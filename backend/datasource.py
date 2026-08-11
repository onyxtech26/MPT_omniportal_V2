"""Pluggable sales-data backends.

The portal ships in two deployment shapes and this module is the seam between
them:

* ``file``     - pandas over a CSV in the user's data folder. This is what the
                 packaged Windows build runs: no server, no network, works on a
                 laptop with the Wi-Fi off.
* ``supabase`` - the same data in Postgres, read over PostgREST. Needed for the
                 hosted deployment and for the AI assistant, which answers
                 questions by querying SQL directly.

Both implementations return byte-identical payloads so the frontend cannot tell
them apart; ``tests/test_datasource_parity.py`` asserts exactly that. Selection
is via the ``DATA_SOURCE`` environment variable and nothing else in the app
needs to know which one is live.
"""
from __future__ import annotations

import os
import shutil
import time

import httpx
import pandas as pd

SUPABASE_TIMEOUT = 30.0
SUMMARY_TTL_SECONDS = 60.0

# Columns a sales CSV must provide. The first six drive the dashboard summary;
# the last three are required by the brand-model breakdown, which used to fail
# with a KeyError on CSVs that satisfied only the summary's needs.
REQUIRED_COLUMNS = {
    "com_unit", "saleman_cd", "inv_desc", "trx_amt", "cost_amt", "trx_date",
    "trx_qty", "list_price", "inv_cd",
}


class DataSourceError(RuntimeError):
    """Raised when a backend is unreachable or misconfigured."""


# --------------------------------------------------------------------------
# File backend
# --------------------------------------------------------------------------
class FileSource:
    """CSV-backed store. Preserves the original single-file caching behaviour:
    the summary is rebuilt only when the file's mtime changes."""

    name = "file"

    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        self._cache: dict = {"data": None, "mtime": 0.0}

    def is_ready(self) -> bool:
        return os.path.exists(self.csv_path)

    def describe(self) -> str:
        return f"file:{os.path.basename(self.csv_path)}"

    def invalidate(self) -> None:
        self._cache["data"] = None
        self._cache["mtime"] = 0.0

    def load_summary(self) -> dict:
        if not self.is_ready():
            raise DataSourceError("Data file not found")

        mtime = os.path.getmtime(self.csv_path)
        if self._cache["data"] is not None and mtime == self._cache["mtime"]:
            return self._cache["data"]

        df = pd.read_csv(self.csv_path, dtype=str)
        df['trx_amt'] = pd.to_numeric(df['trx_amt'], errors='coerce').fillna(0)
        df['cost_amt'] = pd.to_numeric(df['cost_amt'], errors='coerce').fillna(0)
        df['trx_date'] = pd.to_datetime(df['trx_date'], dayfirst=True, errors='coerce')
        df['month'] = df['trx_date'].dt.strftime('%Y-%m')

        outlets = []
        for outlet_code, outlet_df in df.groupby('com_unit'):
            salesmen = outlet_df.groupby('saleman_cd')['trx_amt'].sum().to_dict()
            brands = outlet_df.groupby('inv_desc')['trx_amt'].sum().to_dict()

            salesman_profiles = {}
            for salesman_id, salesman_df in outlet_df.groupby('saleman_cd'):
                salesman_brands = salesman_df.groupby('inv_desc')['trx_amt'].sum().to_dict()

                monthly_data = {}
                valid_monthly = salesman_df.dropna(subset=['month'])
                for month_key, month_df in valid_monthly.groupby('month'):
                    month_brands = month_df.groupby('inv_desc')['trx_amt'].sum().to_dict()
                    monthly_data[str(month_key)] = {
                        "revenue": float(month_df['trx_amt'].sum()),
                        "brands": {str(k): float(v) for k, v in month_brands.items()}
                    }

                daily_revenue = {}
                valid_daily = salesman_df.dropna(subset=['trx_date'])
                for date_val, date_df in valid_daily.groupby(valid_daily['trx_date'].dt.date):
                    daily_revenue[str(date_val)] = float(date_df['trx_amt'].sum())

                salesman_profiles[str(salesman_id)] = {
                    "name": str(salesman_id),
                    "totalRevenue": float(salesman_df['trx_amt'].sum()),
                    "brands": {str(k): float(v) for k, v in salesman_brands.items()},
                    "monthlyData": monthly_data,
                    "dailyRevenue": daily_revenue
                }

            outlets.append({
                "code": str(outlet_code).strip(),
                "name": f"Branch {outlet_code}",
                "totalRevenue": float(outlet_df['trx_amt'].sum()),
                "totalInvestment": float(outlet_df['cost_amt'].sum()),
                "transactionCount": int(len(outlet_df)),
                "salesmen": {str(k): float(v) for k, v in salesmen.items()},
                "brands": {str(k): float(v) for k, v in brands.items()},
                "salesmanProfiles": salesman_profiles
            })

        outlets.sort(key=lambda x: x['totalRevenue'], reverse=True)
        result = {"message": "Data successfully processed", "outlets": outlets}
        self._cache["data"] = result
        self._cache["mtime"] = mtime
        return result

    def brand_models(self, brand: str, branch: str | None = None) -> list[dict]:
        df = pd.read_csv(self.csv_path, dtype=str)
        df['trx_qty'] = pd.to_numeric(df['trx_qty'], errors='coerce').fillna(0)
        df['trx_amt'] = pd.to_numeric(df['trx_amt'], errors='coerce').fillna(0)
        df['list_price'] = pd.to_numeric(df['list_price'], errors='coerce').fillna(0)

        # Catch both "CASIO" and "CASIO-Return" rows so returns net out correctly
        brand_norm = brand.strip().upper()
        df = df[df['inv_desc'].str.upper().str.startswith(brand_norm, na=False)]

        if branch:
            df = df[df['com_unit'].str.strip() == branch.strip()]

        # Drop junk model codes (battery services, blanks, etc.)
        df = df[df['inv_cd'].notna()]
        df = df[~df['inv_cd'].str.startswith('**', na=False)]
        df = df[df['inv_cd'].str.strip().ne('')]

        if df.empty:
            return []

        # Most common non-zero list price per model code
        price_df = df[df['list_price'] > 0]
        prices: dict = {}
        if not price_df.empty:
            prices = (
                price_df.groupby('inv_cd')['list_price']
                .agg(lambda x: float(x.mode().iloc[0]))
                .to_dict()
            )

        result = (
            df.groupby('inv_cd')
            .agg(units=('trx_qty', 'sum'), revenue=('trx_amt', 'sum'))
            .reset_index()
        )
        result = result[result['units'] > 0].copy()
        result['list_price'] = result['inv_cd'].map(prices).fillna(0.0)
        # Model code breaks ties. Without it the order among equal unit counts
        # is whatever each backend happens to produce -- pandas' stable sort
        # keeps groupby order, Postgres makes no guarantee at all -- so the two
        # disagree on the ranking even though the numbers are identical.
        result = result.sort_values(['units', 'inv_cd'], ascending=[False, True])

        return [
            {
                "model": row['inv_cd'],
                "units": int(round(float(row['units']))),
                "revenue": round(float(row['revenue']), 2),
                "list_price": round(float(row['list_price']), 2),
            }
            for _, row in result.iterrows()
        ]

    def replace_sales_data(self, tmp_path: str) -> None:
        shutil.move(tmp_path, self.csv_path)
        self.invalidate()


# --------------------------------------------------------------------------
# Supabase backend
# --------------------------------------------------------------------------
class SupabaseSource:
    """Postgres-backed store, reached through PostgREST.

    Reads go through the ``run_readonly_query`` RPC using the publishable key,
    whose role holds SELECT and nothing else — so no code path here, including
    the AI assistant's generated SQL, is capable of writing.
    """

    name = "supabase"
    TABLE = "sales_transactions"

    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self._cache: dict = {"data": None, "at": 0.0}

    def is_ready(self) -> bool:
        return bool(self.url and self.key)

    def describe(self) -> str:
        return f"supabase:{self.url.split('//')[-1].split('.')[0]}"

    def invalidate(self) -> None:
        self._cache["data"] = None
        self._cache["at"] = 0.0

    def query(self, sql: str) -> list[dict]:
        """Run one read-only SELECT and return its rows."""
        if not self.is_ready():
            raise DataSourceError("Supabase is not configured")
        try:
            resp = httpx.post(
                f"{self.url}/rest/v1/rpc/run_readonly_query",
                headers={
                    "apikey": self.key,
                    "Authorization": f"Bearer {self.key}",
                    "Content-Type": "application/json",
                },
                json={"q": sql},
                timeout=SUPABASE_TIMEOUT,
            )
        except httpx.HTTPError as exc:
            raise DataSourceError(f"Could not reach the database: {exc}") from exc

        if resp.status_code != 200:
            raise DataSourceError(f"Database rejected the query: {resp.text[:300]}")
        return resp.json() or []

    def load_summary(self) -> dict:
        now = time.time()
        if self._cache["data"] is not None and now - self._cache["at"] < SUMMARY_TTL_SECONDS:
            return self._cache["data"]

        # Aggregate at each grain the dashboard needs. Doing this in SQL keeps
        # the payload in the low thousands of rows instead of shipping 55k
        # transactions over the wire on every request.
        #
        # The `is not null` guards on grouping keys are deliberate: pandas'
        # groupby drops null keys, while SQL would emit them as a NULL group.
        # Outlet totals intentionally omit the guard so they still count rows
        # whose brand or salesperson is blank, exactly as the file backend does.
        outlet_rows = self.query(f"""
            select com_unit,
                   sum(trx_amt)  as revenue,
                   sum(cost_amt) as cost,
                   count(*)      as txns
            from {self.TABLE}
            where com_unit is not null
            group by com_unit
        """)
        staff_rows = self.query(f"""
            select com_unit, saleman_cd, sum(trx_amt) as revenue
            from {self.TABLE}
            where com_unit is not null and saleman_cd is not null
            group by com_unit, saleman_cd
        """)
        brand_rows = self.query(f"""
            select com_unit, inv_desc, sum(trx_amt) as revenue
            from {self.TABLE}
            where com_unit is not null and inv_desc is not null
            group by com_unit, inv_desc
        """)
        staff_brand_rows = self.query(f"""
            select com_unit, saleman_cd, inv_desc, sum(trx_amt) as revenue
            from {self.TABLE}
            where com_unit is not null and saleman_cd is not null
              and inv_desc is not null
            group by com_unit, saleman_cd, inv_desc
        """)
        # A month's headline revenue counts every row, but its brand breakdown
        # omits rows with no brand — so the two cannot come from one query.
        month_total_rows = self.query(f"""
            select com_unit, saleman_cd,
                   to_char(trx_date, 'YYYY-MM') as month,
                   sum(trx_amt) as revenue
            from {self.TABLE}
            where trx_date is not null and com_unit is not null
              and saleman_cd is not null
            group by com_unit, saleman_cd, month
        """)
        month_rows = self.query(f"""
            select com_unit, saleman_cd,
                   to_char(trx_date, 'YYYY-MM') as month,
                   inv_desc, sum(trx_amt) as revenue
            from {self.TABLE}
            where trx_date is not null and com_unit is not null
              and saleman_cd is not null and inv_desc is not null
            group by com_unit, saleman_cd, month, inv_desc
        """)
        day_rows = self.query(f"""
            select com_unit, saleman_cd,
                   to_char(trx_date, 'YYYY-MM-DD') as day,
                   sum(trx_amt) as revenue
            from {self.TABLE}
            where trx_date is not null and com_unit is not null
              and saleman_cd is not null
            group by com_unit, saleman_cd, day
        """)

        def nest(rows, *keys, value="revenue"):
            out: dict = {}
            for r in rows:
                cursor = out
                for k in keys[:-1]:
                    cursor = cursor.setdefault(str(r[k]), {})
                cursor[str(r[keys[-1]])] = float(r[value] or 0)
            return out

        staff_by_outlet = nest(staff_rows, "com_unit", "saleman_cd")
        brands_by_outlet = nest(brand_rows, "com_unit", "inv_desc")
        brands_by_staff = nest(staff_brand_rows, "com_unit", "saleman_cd", "inv_desc")
        days_by_staff = nest(day_rows, "com_unit", "saleman_cd", "day")

        # month grain carries both a revenue total and a brand breakdown
        months_by_staff: dict = {}

        def month_node(row):
            return (months_by_staff
                    .setdefault(str(row["com_unit"]), {})
                    .setdefault(str(row["saleman_cd"]), {})
                    .setdefault(str(row["month"]), {"revenue": 0.0, "brands": {}}))

        for r in month_total_rows:
            month_node(r)["revenue"] = float(r["revenue"] or 0)
        for r in month_rows:
            month_node(r)["brands"][str(r["inv_desc"])] = float(r["revenue"] or 0)

        outlets = []
        for r in outlet_rows:
            code = str(r["com_unit"])
            staff = staff_by_outlet.get(code, {})
            profiles = {
                sid: {
                    "name": sid,
                    "totalRevenue": total,
                    "brands": brands_by_staff.get(code, {}).get(sid, {}),
                    "monthlyData": months_by_staff.get(code, {}).get(sid, {}),
                    "dailyRevenue": days_by_staff.get(code, {}).get(sid, {}),
                }
                for sid, total in staff.items()
            }
            outlets.append({
                "code": code.strip(),
                "name": f"Branch {code}",
                "totalRevenue": float(r["revenue"] or 0),
                "totalInvestment": float(r["cost"] or 0),
                "transactionCount": int(r["txns"] or 0),
                "salesmen": staff,
                "brands": brands_by_outlet.get(code, {}),
                "salesmanProfiles": profiles,
            })

        outlets.sort(key=lambda x: x["totalRevenue"], reverse=True)
        result = {"message": "Data successfully processed", "outlets": outlets}
        self._cache["data"] = result
        self._cache["at"] = now
        return result

    def coverage(self) -> dict:
        """What period the data spans — so the assistant can answer questions
        about the data itself, not only questions answered from it."""
        rows = self.query(
            f"select to_char(min(trx_date), 'Mon YYYY') as first_month, "
            f"to_char(max(trx_date), 'Mon YYYY') as last_month, "
            f"count(*) as rows from {self.TABLE} where trx_date is not null"
        )
        return rows[0] if rows else {}

    def brand_models(self, brand: str, branch: str | None = None) -> list[dict]:
        brand_norm = _sql_literal(brand.strip().upper() + "%")
        branch_clause = ""
        if branch:
            branch_clause = f"and btrim(com_unit) = {_sql_literal(branch.strip())}"

        # mode() within group reproduces pandas' "most common non-zero list
        # price per model code"; units/revenue mirror the groupby sums.
        rows = self.query(f"""
            select inv_cd as model,
                   sum(trx_qty) as units,
                   sum(trx_amt) as revenue,
                   coalesce(
                     mode() within group (order by list_price)
                       filter (where list_price > 0), 0) as list_price
            from {self.TABLE}
            where upper(inv_desc) like {brand_norm}
              and inv_cd is not null
              and inv_cd not like '**%'
              and btrim(inv_cd) <> ''
              {branch_clause}
            group by inv_cd
            having sum(trx_qty) > 0
            order by units desc, model asc
        """)
        return [
            {
                "model": r["model"],
                "units": int(round(float(r["units"] or 0))),
                "revenue": round(float(r["revenue"] or 0), 2),
                "list_price": round(float(r["list_price"] or 0), 2),
            }
            for r in rows
        ]

    def replace_sales_data(self, tmp_path: str) -> None:
        raise DataSourceError(
            "Uploads are disabled while the portal is running on the database. "
            "Load new data into Supabase instead."
        )


def _sql_literal(value: str) -> str:
    """Quote a string for inline SQL (single quotes doubled)."""
    return "'" + value.replace("'", "''") + "'"


# --------------------------------------------------------------------------
# Selection
# --------------------------------------------------------------------------
_active = None


def get_source():
    """Return the configured backend, building it on first use."""
    global _active
    if _active is None:
        _active = build_source()
    return _active


def build_source(mode: str | None = None, csv_path: str | None = None):
    mode = (mode or os.environ.get("DATA_SOURCE") or "file").strip().lower()
    if mode == "supabase":
        return SupabaseSource(
            os.environ.get("SUPABASE_URL", ""),
            os.environ.get("SUPABASE_ANON_KEY", ""),
        )
    if csv_path is None:
        raise DataSourceError("csv_path is required for the file data source")
    return FileSource(csv_path)


def set_source(source) -> None:
    """Install a backend explicitly (used by main at startup and by tests)."""
    global _active
    _active = source
