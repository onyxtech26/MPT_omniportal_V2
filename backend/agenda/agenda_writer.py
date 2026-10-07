"""Write engine results into the manager's Meeting Agenda workbook.

Opens the agenda template with openpyxl, writes the FY25 figures the 2025 CSV
can prove (monthly + Jan->month accumulated sales, profit margins, profit
amounts) into their exact cells, and computes the variance columns. When no
2026 CSV is supplied the FY26 columns are left blank and their headers are
annotated "awaiting data input" (SKILL.md section 5 -- never fabricate 2026
numbers).

Every cell is written as a literal value. The template ships the variance
columns as formulas (=D6-C6, =E6/C6, =I6-H6, =J6/H6), but openpyxl saves a
formula with an EMPTY cached result, so only apps that recalculate on open
(desktop Excel) would show anything -- WPS, Excel Online, Sheets, phone
previews and PDF exports all rendered those four columns blank. We overwrite
them with computed numbers so the workbook carries its own answers everywhere.
"""
from __future__ import annotations
import calendar
from copy import copy

import openpyxl
from openpyxl.styles import Color

from .engine import TARGET_BRANCHES, branch_figures

# Variance % colouring: negative → red, zero/positive → blue (bold, matching template).
_RED  = "FFFF0000"
_BLUE = "FF0070C0"


def _colour_pct(cell, value: float | None) -> None:
    """Colour a variance cell by sign, preserving the template's font.

    Assigning a bare ``Font(bold=..., color=...)`` replaces the whole font
    object, which drops the template's explicit Calibri 10 and leaves the cell
    to fall back to the workbook default (Calibri 11). That renders the four
    variance cells about 11% larger than the figures beside them -- visible
    against the manager's own sheet, where every body cell is the same size.
    Copy the existing font and override only weight and colour.
    """
    if value is None:
        return
    font = copy(cell.font)
    font.b = True
    font.color = Color(rgb=_RED if value < 0 else _BLUE)
    cell.font = font

# The template has six branch slots, two rows apart: an even "sales" row and
# the "Profit" row beneath it. Slot 0=rows 6/7, slot 1=8/9 ... slot 5=16/17 --
# see data/reference/Meeting_Agenda.xlsx. Rows 18+ hold unrelated content
# (random stock checks etc.), so six slots is a hard template limit.
NUM_SLOTS = 6


def _sales_row(slot: int) -> int:
    return 6 + 2 * slot

AWAITING = "awaiting data input"

# FY26 cells cleared when no 2026 data exists. Keyed by (column, row offset
# from the branch sales row): 0 = sales row, 1 = profit row beneath it.
#
# Sales rows (offset 0) hold the variance cells E=D-C and F=E/C for the monthly
# block, and J=I-H and K=J/H for the accumulated block.  With no FY26 data there
# is nothing to compare against, so they are blanked out here too.
FY26_CELLS = [
    ("D", 0),  # FY26 monthly sales
    ("D", 1),  # FY26 monthly margin
    ("E", 0),  # monthly sales variance amount (formula =D-C, errors when D is blank)
    ("F", 0),  # monthly sales variance %    (formula =E/C, errors when E/D are blank)
    ("G", 1),  # FY26 monthly profit amount
    ("E", 1),  # FY26 monthly margin variance (value, not a formula)
    ("I", 0),  # FY26 accumulated sales
    ("I", 1),  # FY26 accumulated margin
    ("J", 0),  # accumulated sales variance amount (formula =I-H)
    ("K", 0),  # accumulated sales variance %    (formula =J/H)
    ("L", 1),  # FY26 accumulated profit amount
    ("J", 1),  # FY26 accumulated margin variance (value, not a formula)
]


def _acc_margin_label(branch: str, margin: float) -> str:
    """Reproduce the sheet's 'JCI        37.40%' accumulated-margin text."""
    return f"{branch}        {margin * 100:.2f}%"


def _blank_slot(ws, slot: int) -> None:
    """Clear an unused branch slot entirely -- labels, figures and variances,
    including the template's variance formulas in E/F/J/K, which would error
    against blank inputs if left in place."""
    srow = _sales_row(slot)
    for row in (srow, srow + 1):
        for col in "BCDEFGHIJKL":
            ws[f"{col}{row}"] = None


def _write_branch(ws, branch: str, slot: int, df25, df26, month: int,
                  df25_acc=None, acc25: dict | None = None) -> None:
    srow = _sales_row(slot)
    prow = srow + 1
    months = list(range(1, month + 1))

    # Outlet label (static text in the template for the default six; must be
    # written explicitly when a custom branch occupies this slot).
    ws[f"B{srow}"] = branch
    ws[f"B{prow}"] = "Profit"

    monthly = branch_figures(df25, branch, [month])

    # --- FY25 monthly block (left side) ---
    ws[f"C{srow}"] = monthly["sales"]
    ws[f"C{prow}"] = monthly["margin"]
    ws[f"G{srow}"] = monthly["profit"]

    # --- FY25 accumulated (XLS dict takes priority over CSV DataFrame) ---
    if acc25 is not None and branch in acc25:
        d = acc25[branch]
        acc_sales, acc_profit, acc_margin = d["sales"], d["profit"], d["margin"]
    elif df25_acc is not None:
        acc = branch_figures(df25_acc, branch, months)
        acc_sales, acc_profit, acc_margin = acc["sales"], acc["profit"], acc["margin"]
    else:
        acc_sales = acc_profit = acc_margin = None

    if acc_sales is not None:
        ws[f"H{srow}"] = acc_sales
        ws[f"H{prow}"] = _acc_margin_label(branch, acc_margin)
        ws[f"L{srow}"] = acc_profit
    else:
        ws[f"H{srow}"] = ws[f"H{prow}"] = ws[f"L{srow}"] = None

    # --- FY26 columns ---
    if df26 is not None:
        m26 = branch_figures(df26, branch, [month])
        a26 = branch_figures(df26, branch, months)
        ws[f"D{srow}"] = m26["sales"]
        ws[f"D{prow}"] = m26["margin"]
        ws[f"G{prow}"] = m26["profit"]

        # An outlet that did not trade in FY25 (CS and MIL opened in 2026) has
        # no baseline to compare against. The template's =E/C and =J/H would
        # divide by zero and print #DIV/0! in the manager's sheet, and a margin
        # "variance" measured against 0.00% would read as a 63-point gain that
        # never happened. So when the baseline is absent, every COMPARISON cell
        # is blanked; the FY26 figures themselves, and the variance amounts in
        # E/J (which are just the FY26 totals), still print normally.
        has_month_base = bool(monthly["sales"])
        has_acc_base = bool(acc_sales)

        # Monthly margin variance (profit row, col E) — value cell, colour by sign.
        e_val = round(m26["margin"] - monthly["margin"], 4) if has_month_base else None
        ws[f"E{prow}"] = e_val
        _colour_pct(ws[f"E{prow}"], e_val)

        ws[f"I{srow}"] = a26["sales"]
        ws[f"I{prow}"] = a26["margin"]
        ws[f"L{prow}"] = a26["profit"]

        # Accumulated margin variance (profit row, col J) — value cell, colour by sign.
        j_val = (round(a26["margin"] - acc_margin, 4)
                 if acc_margin is not None and has_acc_base else None)
        ws[f"J{prow}"] = j_val
        _colour_pct(ws[f"J{prow}"], j_val)

        # Monthly sales variance amount (col E) and % (col F) on the sales row.
        # These are written as literal numbers rather than left to the template's
        # =D6-C6 / =E6/C6, because openpyxl saves a formula with an EMPTY cached
        # result (<f>D6-C6</f><v></v>). Desktop Excel recalculates on load and
        # fills it in, but any viewer that renders the cache instead -- WPS,
        # Excel Online, Sheets, phone previews, PDF exports -- draws the cell
        # blank. The manager's sheet gets forwarded and printed, so it has to
        # carry its own answers. The template's number formats are untouched:
        # col E is accounting (prints -84719 as "(84,719)") and col F is "0%".
        e_amt = round(m26["sales"] - monthly["sales"], 2)
        ws[f"E{srow}"] = e_amt

        if has_month_base:
            f_pct = round(e_amt / monthly["sales"], 4)
            ws[f"F{srow}"] = f_pct
            _colour_pct(ws[f"F{srow}"], f_pct)
        else:
            ws[f"F{srow}"] = None

        # Accumulated sales variance amount (col J) and % (col K) — same reasoning.
        j_amt = round(a26["sales"] - acc_sales, 2) if acc_sales is not None else None
        ws[f"J{srow}"] = j_amt

        if has_acc_base:
            k_pct = round(j_amt / acc_sales, 4)
            ws[f"K{srow}"] = k_pct
            _colour_pct(ws[f"K{srow}"], k_pct)
        else:
            ws[f"K{srow}"] = None
    else:
        for col, off in FY26_CELLS:
            ws[f"{col}{srow + off}"] = None


_UNSET = object()


def fill_agenda(template_path: str, out_path: str, df25, df26=None,
                month: int = 4, df25_acc=_UNSET,
                acc25: dict | None = None,
                branches: list[str] | None = None) -> str:
    """Fill a copy of the agenda template and save it to out_path.

    df25/df26: DataFrames from load_report_csv. df26 may be None.
    df25_acc:  accumulated FY25 DataFrame source (defaults to df25). Pass None
               when only a monthly CSV is available and no XLS is provided.
    acc25:     pre-decoded XLS branch totals from load_xls_report(); takes
               priority over df25_acc for the FY25 accumulated cells.
    branches:  outlets to place in the template's six slots, in order
               (defaults to TARGET_BRANCHES). Only the first NUM_SLOTS are
               written; unused slots are blanked.
    Occupied slots get computed variance values in E/F/J/K, replacing the
    template's =D6-C6 style formulas (see the module docstring for why).
    """
    if df25_acc is _UNSET:
        df25_acc = df25
    branches = list(branches) if branches is not None else list(TARGET_BRANCHES)
    branches = branches[:NUM_SLOTS]

    wb = openpyxl.load_workbook(template_path)
    ws = wb["Sheet1"]

    month_name = calendar.month_name[month].upper()
    month_abbr = calendar.month_abbr[month].upper()
    ws["F1"] = month_name
    has_acc25 = acc25 is not None or df25_acc is not None
    ws["H2"] = f"JAN-{month_abbr} 25" if has_acc25 else f"JAN-{month_abbr} 25 ({AWAITING})"
    ws["I2"] = f"JAN-{month_abbr} 26"
    ws["H4"] = f"G 1-{month}"
    ws["I4"] = f"H 1-{month}"

    for slot, branch in enumerate(branches):
        _write_branch(ws, branch, slot, df25, df26, month, df25_acc, acc25)
    for slot in range(len(branches), NUM_SLOTS):
        _blank_slot(ws, slot)

    if df26 is None:
        ws["D5"] = f"FY26/ ({AWAITING})"
        ws["I5"] = f"FY26/ Acc. Sales ({AWAITING})"

    # Every cell we write is a literal value, so there is nothing left to
    # recalculate. Kept as a safety net in case a future template revision
    # introduces a formula outside the six branch slots.
    wb.calculation.fullCalcOnLoad = True
    wb.save(out_path)
    return out_path
