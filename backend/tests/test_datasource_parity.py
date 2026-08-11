"""Equivalence tests: the file and database backends must agree exactly.

The claim these tests defend is that `DATA_SOURCE` changes where the numbers
come from and nothing else — the frontend cannot tell the two apart. That claim
is only worth making if it is checked, and checking it is what originally
exposed two real defects in the SQL implementation: pandas' groupby silently
drops null grouping keys where SQL emits them as a NULL group, and a month's
headline revenue counts every row while its brand breakdown omits rows with no
brand, so the two cannot come from a single query.

Skipped unless Supabase credentials are present, so the suite still runs
offline and in CI.
"""
from __future__ import annotations

import os

import pytest

from datasource import FileSource, SupabaseSource

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO_CSV = os.path.join(HERE, "Sales Profit Report - By Product Group DEMO 2025-2026.csv")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

needs_db = pytest.mark.skipif(
    not (SUPABASE_URL and SUPABASE_KEY and os.path.exists(DEMO_CSV)),
    reason="needs SUPABASE_URL, SUPABASE_ANON_KEY and the demo CSV",
)

# Money is compared to the cent. Both backends sum the same values, but one
# goes through numpy float64 and the other through Postgres numeric, so an
# exact `==` on the raw floats would be testing IEEE754, not the data.
CENTS = 2


def r(x) -> float:
    return round(float(x or 0), CENTS)


@pytest.fixture(scope="module")
def file_summary():
    return FileSource(DEMO_CSV).load_summary()


@pytest.fixture(scope="module")
def db_summary():
    return SupabaseSource(SUPABASE_URL, SUPABASE_KEY).load_summary()


@needs_db
def test_same_outlets(file_summary, db_summary):
    f = [o["code"] for o in file_summary["outlets"]]
    d = [o["code"] for o in db_summary["outlets"]]
    assert f == d, "outlet set or revenue ordering differs"


@needs_db
def test_outlet_totals_match(file_summary, db_summary):
    dbo = {o["code"]: o for o in db_summary["outlets"]}
    for fo in file_summary["outlets"]:
        do = dbo[fo["code"]]
        assert r(fo["totalRevenue"]) == r(do["totalRevenue"]), fo["code"]
        assert r(fo["totalInvestment"]) == r(do["totalInvestment"]), fo["code"]
        assert fo["transactionCount"] == do["transactionCount"], fo["code"]


@needs_db
def test_salespeople_and_brands_match(file_summary, db_summary):
    dbo = {o["code"]: o for o in db_summary["outlets"]}
    for fo in file_summary["outlets"]:
        do = dbo[fo["code"]]
        assert set(fo["salesmen"]) == set(do["salesmen"]), f"{fo['code']} staff"
        for sid, rev in fo["salesmen"].items():
            assert r(rev) == r(do["salesmen"][sid]), f"{fo['code']}/{sid}"

        # The null-key defect surfaced here: SQL returned a NULL brand group
        # that pandas had dropped, so the brand sets differed by one entry.
        assert set(fo["brands"]) == set(do["brands"]), f"{fo['code']} brands"
        for brand, rev in fo["brands"].items():
            assert r(rev) == r(do["brands"][brand]), f"{fo['code']}/{brand}"


@needs_db
def test_monthly_and_daily_grain_match(file_summary, db_summary):
    dbo = {o["code"]: o for o in db_summary["outlets"]}
    for fo in file_summary["outlets"]:
        do = dbo[fo["code"]]
        for sid, fp in fo["salesmanProfiles"].items():
            dp = do["salesmanProfiles"][sid]
            assert r(fp["totalRevenue"]) == r(dp["totalRevenue"]), sid

            assert set(fp["monthlyData"]) == set(dp["monthlyData"]), f"{sid} months"
            for month, fm in fp["monthlyData"].items():
                dm = dp["monthlyData"][month]
                # The month-grain defect: revenue counts every row, brands omit
                # rows with no brand. One query cannot produce both.
                assert r(fm["revenue"]) == r(dm["revenue"]), f"{sid}/{month}"
                assert set(fm["brands"]) == set(dm["brands"]), f"{sid}/{month} brands"
                for b, v in fm["brands"].items():
                    assert r(v) == r(dm["brands"][b]), f"{sid}/{month}/{b}"

            assert set(fp["dailyRevenue"]) == set(dp["dailyRevenue"]), f"{sid} days"
            for day, v in fp["dailyRevenue"].items():
                assert r(v) == r(dp["dailyRevenue"][day]), f"{sid}/{day}"


@needs_db
@pytest.mark.parametrize("brand", ["CASIO", "SEIKO", "BONIA"])
def test_brand_models_match(brand):
    f = FileSource(DEMO_CSV).brand_models(brand)
    d = SupabaseSource(SUPABASE_URL, SUPABASE_KEY).brand_models(brand)
    assert [x["model"] for x in f] == [x["model"] for x in d], f"{brand} model set"
    for fm, dm in zip(f, d):
        assert fm["units"] == dm["units"], f"{brand}/{fm['model']} units"
        assert r(fm["revenue"]) == r(dm["revenue"]), f"{brand}/{fm['model']} revenue"
        assert r(fm["list_price"]) == r(dm["list_price"]), f"{brand}/{fm['model']} price"
