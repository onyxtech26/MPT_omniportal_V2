"""Extend the anonymised demo dataset to cover Jan 2025 - Jul 2026.

The original demo export stops at September 2025, which leaves the portal with
no second year to compare against — and year-on-year comparison is the whole
point of the meeting agenda. This script keeps the existing rows untouched and
synthesises the missing months (Oct 2025 - Jul 2026) by resampling the real
distribution of branches, brands, salespeople and prices, then applying a
seasonal shape and a modest year-on-year growth.

Everything produced here is fabricated demo data. It is derived only from the
already-anonymised file, never from a real POS export.

Run from backend/:  python make_demo_dataset.py
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "Sales Profit Report - By Product Group 2025.csv")
OUTPUT = os.path.join(HERE, "Sales Profit Report - By Product Group DEMO 2025-2026.csv")

SEED = 20260809          # fixed so the dataset is reproducible
GROWTH_2026 = 1.08       # gentle year-on-year uplift so YoY questions are interesting

# Malaysian retail shape: Chinese New Year in February, Hari Raya around March,
# a year-end lift in December. Mirrors the pattern the seasonal module found.
MONTH_FACTOR = {
    1: 1.00, 2: 1.15, 3: 1.25, 4: 1.05, 5: 1.00, 6: 0.95,
    7: 1.00, 8: 0.95, 9: 0.95, 10: 1.00, 11: 1.05, 12: 1.20,
}

# Months to fabricate: everything after the source file's coverage.
NEW_MONTHS = [(2025, m) for m in (10, 11, 12)] + [(2026, m) for m in range(1, 8)]

rng = np.random.default_rng(SEED)


def month_days(year: int, month: int) -> int:
    import calendar
    return calendar.monthrange(year, month)[1]


def main() -> None:
    src = pd.read_csv(SOURCE, dtype=str)
    parsed = pd.to_datetime(src["trx_date"], dayfirst=True, errors="coerce")
    if parsed.isna().any():
        raise SystemExit("source dates failed to parse; aborting")

    # Guard: only ever build on top of the anonymised demo file.
    revenue = pd.to_numeric(src["trx_amt"], errors="coerce").fillna(0).sum()
    if not (8.5e6 < revenue < 9.0e6):
        raise SystemExit(f"source revenue RM{revenue:,.2f} is not the demo dataset")

    base_per_month = int(round(len(src) / parsed.dt.to_period("M").nunique()))
    print(f"source: {len(src):,} rows, {parsed.min():%b %Y} - {parsed.max():%b %Y}, "
          f"~{base_per_month:,}/month")

    generated = []
    for year, month in NEW_MONTHS:
        factor = MONTH_FACTOR[month] * (GROWTH_2026 if year == 2026 else 1.0)
        # +/-4% noise so months are not mechanically identical
        n = int(round(base_per_month * factor * rng.normal(1.0, 0.04)))

        block = src.sample(n=n, replace=True, random_state=int(rng.integers(1e9))).copy()

        days = rng.integers(1, month_days(year, month) + 1, size=n)
        block["trx_date"] = [f"{d}/{month}/{year} 0:00" for d in days]

        # Jitter money and give each fabricated line its own document number so
        # the block is not a literal copy of earlier transactions.
        for col in ("trx_amt", "cost_amt", "unit_price", "list_price", "adj_amt"):
            if col in block.columns:
                values = pd.to_numeric(block[col], errors="coerce")
                jitter = rng.normal(1.0, 0.06, size=n)
                block[col] = (values * jitter).round(2).where(values.notna(), block[col])

        seq = rng.integers(10_000_000, 99_999_999, size=n)
        block["trx_no"] = [f"PS{year % 100}{month:02d}{s}" for s in seq]

        generated.append(block)
        print(f"  {year}-{month:02d}: {n:,} rows")

    out = pd.concat([src] + generated, ignore_index=True)

    # Sort chronologically so the file reads like a real export.
    order = pd.to_datetime(out["trx_date"], dayfirst=True, errors="coerce")
    out = out.loc[order.sort_values().index].reset_index(drop=True)

    out.to_csv(OUTPUT, index=False)

    final = pd.to_datetime(out["trx_date"], dayfirst=True, errors="coerce")
    total = pd.to_numeric(out["trx_amt"], errors="coerce").fillna(0).sum()
    print(f"\nwrote {os.path.basename(OUTPUT)}")
    print(f"  {len(out):,} rows | {final.min():%d %b %Y} -> {final.max():%d %b %Y} "
          f"| revenue RM{total:,.2f}")
    print(f"  months: {final.dt.to_period('M').nunique()}")


if __name__ == "__main__":
    main()
