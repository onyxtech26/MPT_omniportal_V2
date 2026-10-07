"""Guards for the agenda workbook writer, using synthetic data only.

Covers the two defects found on 2026-09-02:

1. Colouring a variance cell must not resize it. `Font(bold=..., color=...)`
   replaces the whole font object and drops the template's Calibri 10, so the
   percentages rendered ~11% larger than the figures beside them.

2. An outlet with no prior-year trading (CS and MIL opened in 2026) must not
   leave `=E/C` and `=J/H` to divide by zero. Those printed #DIV/0! in the
   workbook the manager takes to the meeting.

And the defect found on 2026-09-03:

3. The variance columns must carry literal values, not the template's formulas.
   openpyxl writes a formula with an empty cached result, so every viewer that
   renders the cache instead of recalculating (WPS, Excel Online, Sheets, phone
   previews, PDF exports) showed those four columns blank.
"""
import os

import openpyxl
import pandas as pd
import pytest

from agenda.agenda_writer import fill_agenda

TEMPLATE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "agenda", "Meeting_Agenda.xlsx")

pytestmark = pytest.mark.skipif(
    not os.path.exists(TEMPLATE), reason="agenda template not present"
)


def _frame(rows):
    """Build a minimal POS-shaped frame: (branch, day-month, category, qty, amt, cost)."""
    df = pd.DataFrame(
        [{"com_unit": b, "trx_date": f"15/{m:02d}/2025 00:00:00", "inv_category": c,
          "trx_mode": "D", "trx_qty": q, "trx_amt": a, "cost_amt": k}
         for b, m, c, q, a, k in rows]
    )
    df["_date"] = pd.to_datetime(df["trx_date"], format="%d/%m/%Y %H:%M:%S")
    df["_month"] = df["_date"].dt.month
    return df


@pytest.fixture
def built(tmp_path):
    """FY25 has ONLY 'OLD'; FY26 has 'OLD' plus brand-new 'NEW'."""
    df25 = _frame([("OLD", 8, "CAS", 2, 1000.0, 600.0)])
    df26 = _frame([("OLD", 8, "CAS", 3, 1500.0, 800.0),
                   ("NEW", 8, "CAS", 4, 2000.0,   700.0)])
    out = tmp_path / "agenda.xlsx"
    fill_agenda(TEMPLATE, str(out), df25, df26, month=8, branches=["OLD", "NEW"])
    return str(out)


@pytest.fixture
def books(built):
    return openpyxl.load_workbook(built)["Sheet1"]


@pytest.fixture
def cached(built):
    """The workbook as a viewer that does NOT recalculate sees it.

    data_only=True returns only cached results, so a cell holding an
    unevaluated formula reads back as None -- which is precisely the bug.
    """
    return openpyxl.load_workbook(built, data_only=True)["Sheet1"]


def test_variance_cells_keep_the_template_font(books):
    """Colouring must preserve face and size, only overriding weight and colour."""
    baseline = books["C6"].font            # a plain figure the writer does not restyle
    for coord in ("F6", "K6", "E7", "J7"):
        font = books[coord].font
        assert font.name == baseline.name, coord
        assert font.sz == baseline.sz, f"{coord} lost the template size"


def test_outlet_with_a_baseline_still_gets_its_comparisons(books):
    assert books["B6"].value == "OLD"
    assert books["E6"].value is not None, "sales variance amount should be present"
    assert books["F6"].value is not None, "sales variance % should be present"
    assert books["E7"].value is not None, "margin variance should be present"
    assert books["J7"].value is not None, "accumulated margin variance should be present"


def test_variance_columns_are_values_not_unevaluated_formulas(cached):
    """The regression guard: FY25 1000 -> FY26 1500 is +500, +50%.

    Read through data_only=True, so this only passes if the numbers are stored
    in the file rather than deferred to whatever app happens to open it.
    """
    assert cached["E6"].value == pytest.approx(500.0), "monthly variance amount"
    assert cached["F6"].value == pytest.approx(0.5), "monthly variance %"
    assert cached["J6"].value == pytest.approx(500.0), "accumulated variance amount"
    assert cached["K6"].value == pytest.approx(0.5), "accumulated variance %"


def test_no_formulas_are_left_in_the_output(books):
    """Nothing in the sheet may depend on a recalculation pass to display."""
    leftover = [c.coordinate for row in books.iter_rows() for c in row
                if isinstance(c.value, str) and c.value.startswith("=")]
    assert leftover == [], f"unevaluated formulas would render blank: {leftover}"


def test_new_outlet_has_no_divide_by_zero_formulas(books):
    """No FY25 baseline -> comparison cells blank, FY26 figures still written."""
    assert books["B8"].value == "NEW"
    assert books["C8"].value == 0, "FY25 sales should be zero for a 2026-only outlet"
    # The percentage cells must be blank rather than dividing by a zero baseline.
    for coord in ("F8", "K8"):
        assert books[coord].value is None, f"{coord} would be a divide by zero"
    # A margin 'variance' against a 0.00% baseline is equally meaningless.
    assert books["E9"].value is None
    assert books["J9"].value is None
    # ...but the FY26 figures themselves are still reported.
    assert books["D8"].value == pytest.approx(2000.0)
    assert books["G9"].value == pytest.approx(1300.0)


def test_load_report_csv_applies_discounts(tmp_path):
    """Discount percentages on line items reduce trx_amt so net sales matches printed POS report."""
    from agenda.engine import load_report_csv, branch_figures

    csv_file = tmp_path / "test_discount.csv"
    csv_file.write_text(
        "com_unit,trx_date,inv_category,trx_mode,trx_qty,trx_amt,cost_amt,discount\n"
        "MFW,10/01/2026 12:00:00,WAT,D,1,10000.0,6000.0,20.0\n"
        "MFW,10/01/2026 12:00:00,WAT,D,1,200.0,100.0,0.0\n"
        "MFW,10/01/2026 12:00:00,WAT,C,1,200.0,100.0,0.0\n"
    )
    df = load_report_csv(str(csv_file))
    figs = branch_figures(df, "MFW", [1])
    assert figs["sales"] == pytest.approx(8000.0)
    assert figs["cost"] == pytest.approx(6000.0)
    assert figs["profit"] == pytest.approx(2000.0)
    assert figs["margin"] == pytest.approx(0.25)

