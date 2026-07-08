"""MPT agenda calculation engine.

Pure functions, no I/O side effects. Given the raw POS "Sales Profit Report"
CSV, compute per-branch sales/cost/profit/margin for a month and for the
Jan->month accumulation, applying the verified trx_mode D-minus-C rule.

See SKILL.md section 3 for the formula and section 4 for the proof.
"""
from __future__ import annotations
import pandas as pd

TARGET_BRANCHES = ["JCI", "KMT", "GPL", "MRT", "MFW", "SAT"]
NUMERIC_COLS = ["trx_amt", "cost_amt", "trx_qty"]

# POS cipher: digits substituted in printed reports to hide margin data from staff.
# Reverse map (encoded letter → digit): - R A Y M O N D J E → 0 1 2 3 4 5 6 7 8 9
_DECODE_TABLE = str.maketrans("-RAYMONDJE", "0123456789")


def _decode_pos(s: str) -> float:
    """Decode a POS-encoded financial string to float."""
    s = str(s).strip()
    is_negative = False
    if s.startswith("(") and s.endswith(")"):
        is_negative = True
        s = s[1:-1]
    
    # Remove commas if any (e.g., thousands separators)
    s = s.replace(",", "")
    
    val = float(s.translate(_DECODE_TABLE))
    return -val if is_negative else val


def load_xls_report(path: str) -> dict[str, dict]:
    """Read a formatted 'Sales Profit Report' XLS and return branch totals.

    Extracts per-branch: Sales (col 13, plain numeric), Profit (col 16,
    POS-encoded), Margin % (col 18, POS-encoded) from every branch Total row.
    Returns {branch_code: {sales, profit, cost, margin}} where margin is 0..1.
    """
    df = pd.read_excel(path, header=None)
    result = {}
    for _, row in df.iterrows():
        label = row[4]
        if not isinstance(label, str) or "Total:" not in label or "Grand" in label:
            continue
        branch = label.replace(" Total:", "").strip()
        sales  = round(float(row[13]), 2)
        profit = round(_decode_pos(str(row[16])), 2)
        margin = round(_decode_pos(str(row[18])) / 100, 4)
        result[branch] = {"sales": sales, "profit": profit,
                          "cost": round(sales - profit, 2), "margin": margin}
    return result


def load_report_csv(path: str) -> pd.DataFrame:
    """Load and normalise a raw POS report CSV."""
    df = pd.read_csv(path, dtype=str)
    for c in NUMERIC_COLS:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["_date"] = pd.to_datetime(df["trx_date"], format="%d/%m/%Y %H:%M:%S",
                                 errors="coerce")
    mask = df["_date"].isna()
    if mask.any():
        df.loc[mask, "_date"] = pd.to_datetime(
            df.loc[mask, "trx_date"], format="%d/%m/%Y %H:%M", errors="coerce"
        )
    df["_month"] = df["_date"].dt.month
    return df


def _net(sub: pd.DataFrame, col: str) -> float:
    """D-minus-C net: debits add, credits (returns) subtract.

    Credit rows (trx_mode='C') are summed as-is (signed). A negative C row
    is a POS correction entry that cancels the corresponding positive C row
    when summed — taking .abs() would double-subtract it, which is wrong.
    """
    debit  = sub.loc[sub["trx_mode"] == "D", col].sum()
    credit = sub.loc[sub["trx_mode"] == "C", col].sum()   # signed sum, NOT abs()
    return round(float(debit - credit), 2)


def branch_figures(df: pd.DataFrame, branch: str, months: list[int]) -> dict:
    """Sales/cost/profit/margin/qty for one branch over the given month(s)."""
    sub = df[(df["com_unit"] == branch) & (df["_month"].isin(months))]
    sales = _net(sub, "trx_amt")
    cost = _net(sub, "cost_amt")
    qty = _net(sub, "trx_qty")
    profit = round(sales - cost, 2)
    margin = round(profit / sales, 4) if sales else 0.0
    return {"branch": branch, "sales": sales, "cost": cost,
            "qty": qty, "profit": profit, "margin": margin}


def monthly_table(df: pd.DataFrame, month: int,
                  branches: list[str] | None = None) -> pd.DataFrame:
    """Single-month figures for all target branches."""
    branches = branches or TARGET_BRANCHES
    return pd.DataFrame(branch_figures(df, b, [month]) for b in branches)


def accumulated_table(df: pd.DataFrame, month: int,
                      branches: list[str] | None = None) -> pd.DataFrame:
    """Jan->month accumulated figures for all target branches."""
    branches = branches or TARGET_BRANCHES
    months = list(range(1, month + 1))
    return pd.DataFrame(branch_figures(df, b, months) for b in branches)


def variance(this_year: float, last_year: float) -> tuple[float, float]:
    """Returns (amount, pct) variance of this vs last year."""
    amt = round(this_year - last_year, 2)
    pct = round(amt / last_year, 4) if last_year else 0.0
    return amt, pct


def product_breakdown(df: pd.DataFrame, branch: str,
                      months: list[int]) -> dict[str, dict]:
    """Per-category sales/cost/qty for one branch over the given months.

    Returns {inv_category: {sales, cost, profit, qty}} applying D-minus-C.
    """
    sub = df[(df["com_unit"] == branch) & (df["_month"].isin(months))]
    result = {}
    for cat, grp in sub.groupby("inv_category"):
        sales = _net(grp, "trx_amt")
        cost  = _net(grp, "cost_amt")
        qty   = _net(grp, "trx_qty")
        result[str(cat)] = {
            "sales": sales, "cost": cost,
            "profit": round(sales - cost, 2), "qty": round(qty, 1),
        }
    return result
