"""Load the anonymised demo dataset into a Supabase project.

This is the one operation the application itself can never do: the app
authenticates as `anon`, which holds SELECT and nothing else. Writing therefore
needs the service_role key, which is read from the environment and never stored
in this file, in .env, or in version control.

    Project Settings -> API -> service_role  (Supabase dashboard)

Usage:
    python seed_supabase.py https://<ref>.supabase.co

The service_role key is prompted for rather than passed as an argument, so it
stays out of shell history and out of the process list. SUPABASE_URL and
SUPABASE_SERVICE_KEY are still honoured if already set in the environment.

The table must be empty. A previous seeding run died part-way on a NaN
serialisation error after several batches had already been accepted, leaving
6,000 duplicate rows behind; refusing to start against a non-empty table is
what stops that from being silent. Use --force only when you mean it.
"""
from __future__ import annotations

import getpass
import json
import os
import sys

import httpx
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, "Sales Profit Report - By Product Group DEMO 2025-2026.csv")
TABLE = "sales_transactions"
BATCH = 2000

TEXT_COLS = ["com_unit", "saleman_cd", "inv_desc", "inv_cd", "inv_category", "trx_mode"]
NUM_COLS = ["trx_amt", "cost_amt", "trx_qty", "list_price"]


def load_rows() -> list[dict]:
    df = pd.read_csv(CSV, dtype=str)

    for col in NUM_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["trx_date"] = pd.to_datetime(df["trx_date"], dayfirst=True, errors="coerce")

    out = []
    for rec in df.to_dict("records"):
        row = {c: (rec[c] if isinstance(rec[c], str) else None) for c in TEXT_COLS}
        for c in NUM_COLS:
            v = rec[c]
            row[c] = None if pd.isna(v) else float(v)
        d = rec["trx_date"]
        row["trx_date"] = None if pd.isna(d) else d.isoformat()
        out.append(row)
    return out


def count_rows(client: httpx.Client, url: str, headers: dict) -> int:
    resp = client.get(
        f"{url}/rest/v1/{TABLE}",
        headers={**headers, "Prefer": "count=exact", "Range": "0-0"},
        params={"select": "id"},
    )
    resp.raise_for_status()
    # PostgREST reports the total in Content-Range as "0-0/123783"
    return int(resp.headers.get("content-range", "0-0/0").split("/")[-1])


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    url = (args[0] if args else os.environ.get("SUPABASE_URL", "")).rstrip("/")
    if not url:
        print("usage: python seed_supabase.py https://<ref>.supabase.co")
        return 1

    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not key:
        key = getpass.getpass("service_role key (input hidden): ").strip()
    if not key:
        print("No key given.")
        return 1

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=120.0) as client:
        existing = count_rows(client, url, headers)
        if existing and "--force" not in sys.argv:
            print(f"Refusing to seed: {TABLE} already holds {existing:,} rows.")
            print("Empty it first, or pass --force if you intend to append.")
            return 1

        rows = load_rows()
        # Fail here, locally, rather than half-way through the upload.
        json.dumps(rows[:1], allow_nan=False)
        print(f"{len(rows):,} rows to load in batches of {BATCH:,}")

        for start in range(0, len(rows), BATCH):
            batch = rows[start:start + BATCH]
            body = json.dumps(batch, allow_nan=False)
            resp = client.post(
                f"{url}/rest/v1/{TABLE}",
                headers={**headers, "Prefer": "return=minimal"},
                content=body,
            )
            if resp.status_code not in (200, 201, 204):
                print(f"\nBatch at row {start} failed: {resp.status_code} {resp.text[:300]}")
                print(f"Loaded {count_rows(client, url, headers):,} rows before failing.")
                return 1
            done = min(start + BATCH, len(rows))
            print(f"  {done:,}/{len(rows):,}", end="\r", flush=True)

        total = count_rows(client, url, headers)
        print(f"\nDone. {TABLE} now holds {total:,} rows.")
        return 0 if total == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
