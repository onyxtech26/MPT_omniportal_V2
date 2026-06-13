from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
import pandas as pd
import os
import json
import time
import base64
import calendar
import shutil
import tempfile
from collections import defaultdict

from agenda.engine import TARGET_BRANCHES, load_report_csv, load_xls_report
from agenda.agenda_writer import fill_agenda
from agenda.message_gen import generate_message

SECRET_KEY = os.environ.get("JWT_SECRET", "local-dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8

security = HTTPBearer()

_login_attempts: dict = defaultdict(list)
_RATE_LIMIT = 5
_RATE_WINDOW = 60

app = FastAPI(docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "capacitor://localhost", "http://localhost:3000", "app://mpt"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)

CSV_FILE_PATH = os.path.join(os.path.dirname(__file__), "Sales Profit Report - By Product Group 2025.csv")
USERS_FILE_PATH = os.path.join(os.path.dirname(__file__), "users.json")
AGENDA_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "agenda", "Meeting_Agenda.xlsx")

# Cache invalidated automatically when CSV file is modified on disk
_summary_cache: dict = {"data": None, "mtime": 0.0}


def _load_users() -> list[dict]:
    with open(USERS_FILE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _get_client_ip(req: Request) -> str:
    return req.headers.get("x-real-ip") or req.client.host


def _check_rate_limit(ip: str):
    now = time.time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _RATE_WINDOW]
    if len(_login_attempts[ip]) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    _login_attempts[ip].append(now)


def create_access_token(username: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _load_summary_data() -> dict:
    """Return cached summary, rebuilding only when the CSV file has changed."""
    mtime = os.path.getmtime(CSV_FILE_PATH)
    if _summary_cache["data"] is not None and mtime == _summary_cache["mtime"]:
        return _summary_cache["data"]

    df = pd.read_csv(CSV_FILE_PATH, dtype=str)
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
    _summary_cache["data"] = result
    _summary_cache["mtime"] = mtime
    return result


@app.get("/")
def read_root():
    return {"message": "MPT OmniPortal Backend is running"}


@app.get("/health")
def health():
    if not os.path.exists(CSV_FILE_PATH):
        raise HTTPException(status_code=503, detail="Data file missing")
    return {"status": "ok"}


@app.post("/api/login")
def login(request: LoginRequest, req: Request):
    _check_rate_limit(_get_client_ip(req))

    users = _load_users()
    user_record = next((u for u in users if u["username"] == request.username), None)

    # Constant-time check even when user not found (prevent timing attacks)
    stored_hash = user_record["password"].encode() if user_record else b"$2b$12$invalidhashpadding000000000000000000000000000000000000"
    try:
        password_valid = bcrypt.checkpw(request.password.encode(), stored_hash)
    except Exception:
        password_valid = False

    if not user_record or not password_valid:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user_record["username"])
    return {
        "message": "Login successful",
        "token": token,
        "user": {
            "id": user_record["id"],
            "username": user_record["username"],
            "role": user_record.get("role", "admin"),
        },
    }


@app.get("/api/summary")
def get_summary(username: str = Depends(verify_token)):
    try:
        if not os.path.exists(CSV_FILE_PATH):
            raise HTTPException(status_code=500, detail="Data file not found")
        return _load_summary_data()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to process data")


def _save_upload(upload: UploadFile, tmp_dir: str) -> str:
    """Persist an uploaded file to tmp_dir, keeping its suffix, return the path."""
    suffix = os.path.splitext(upload.filename or "")[1] or ".csv"
    fd, path = tempfile.mkstemp(suffix=suffix, dir=tmp_dir)
    with os.fdopen(fd, "wb") as fh:
        shutil.copyfileobj(upload.file, fh)
    return path


@app.post("/api/agenda/generate")
def generate_agenda(
    month: int = Form(...),
    year25: UploadFile = File(...),
    year26: UploadFile | None = File(None),
    year25_acc: UploadFile | None = File(None),
    username: str = Depends(verify_token),
):
    if not 1 <= month <= 12:
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")

    tmp_dir = tempfile.mkdtemp(prefix="agenda_")
    try:
        try:
            year25_path = _save_upload(year25, tmp_dir)
            df25 = load_report_csv(year25_path)
            df26 = None
            if year26 is not None:
                df26 = load_report_csv(_save_upload(year26, tmp_dir))

            acc25 = None
            df25_acc = df25
            if year25_acc is not None:
                acc_path = _save_upload(year25_acc, tmp_dir)
                if acc_path.lower().endswith((".xls", ".xlsx")):
                    acc25 = load_xls_report(acc_path)
                    df25_acc = None
                else:
                    df25_acc = load_report_csv(acc_path)
        except Exception:
            raise HTTPException(status_code=400, detail="Could not read the uploaded report file(s). Check they are the full POS export.")

        out_path = os.path.join(tmp_dir, f"agenda_{calendar.month_name[month]}.xlsx")
        try:
            fill_agenda(AGENDA_TEMPLATE_PATH, out_path, df25, df26, month,
                        df25_acc=df25_acc, acc25=acc25)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to build the agenda spreadsheet")

        with open(out_path, "rb") as fh:
            agenda_b64 = base64.b64encode(fh.read()).decode("ascii")

        messages = [
            {"branch": b, "text": generate_message(b, month, df25, df26)}
            for b in TARGET_BRANCHES
        ]

        return {
            "month": calendar.month_name[month],
            "agendaFilename": f"agenda_{calendar.month_name[month]}.xlsx",
            "agendaBase64": agenda_b64,
            "messages": messages,
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


FORECAST_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'forecasting', 'output')
)
_forecast_cache: dict = {"forecasts": None, "top_brands": None, "comparison": None}


def _load_forecasts():
    if _forecast_cache["forecasts"] is not None:
        return _forecast_cache
    forecasts_path   = os.path.join(FORECAST_DIR, 'forecasts.json')
    top_brands_path  = os.path.join(FORECAST_DIR, 'top_brands_by_branch.json')
    comparison_path  = os.path.join(FORECAST_DIR, 'evaluation_report.json')
    if not os.path.exists(forecasts_path):
        raise HTTPException(status_code=503, detail="Forecast data not generated yet. Run forecasting/agents/08_forecaster.py first.")
    with open(forecasts_path, encoding='utf-8') as f:
        _forecast_cache["forecasts"] = json.load(f)
    with open(top_brands_path, encoding='utf-8') as f:
        _forecast_cache["top_brands"] = json.load(f)
    if os.path.exists(comparison_path):
        with open(comparison_path, encoding='utf-8') as f:
            _forecast_cache["comparison"] = json.load(f)
    return _forecast_cache


@app.get("/api/forecast")
def get_forecast(
    branch: str | None = None,
    month: str | None = None,
    username: str = Depends(verify_token),
):
    data = _load_forecasts()
    rows = data["forecasts"]
    if branch:
        rows = [r for r in rows if r["branch"] == branch]
    if month:
        rows = [r for r in rows if r["month"] == month]
    rows = [r for r in rows if r["predicted_units"] > 0]
    rows.sort(key=lambda r: r["predicted_units"], reverse=True)
    return {"forecasts": rows, "total": len(rows)}


@app.get("/api/forecast/top-brands")
def get_top_brands(username: str = Depends(verify_token)):
    data = _load_forecasts()
    return data["top_brands"]


@app.get("/api/brands/models")
def get_brand_models(
    brand: str = "",
    branch: str | None = None,
    username: str = Depends(verify_token),
):
    if not brand:
        raise HTTPException(status_code=400, detail="brand parameter is required")

    df = pd.read_csv(CSV_FILE_PATH, dtype=str)
    df['trx_qty']   = pd.to_numeric(df['trx_qty'],   errors='coerce').fillna(0)
    df['trx_amt']   = pd.to_numeric(df['trx_amt'],   errors='coerce').fillna(0)
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
        return {"brand": brand, "branch": branch, "models": []}

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
    result = result.sort_values('units', ascending=False)

    return {
        "brand": brand,
        "branch": branch,
        "models": [
            {
                "model":      row['inv_cd'],
                "units":      int(round(float(row['units']))),
                "revenue":    round(float(row['revenue']), 2),
                "list_price": round(float(row['list_price']), 2),
            }
            for _, row in result.iterrows()
        ],
    }


@app.get("/api/forecast/comparison")
def get_model_comparison(username: str = Depends(verify_token)):
    data = _load_forecasts()
    if data["comparison"] is None:
        raise HTTPException(status_code=503, detail="Evaluation report not available.")
    return data["comparison"]


@app.post("/api/forecast/reload")
def reload_forecasts(username: str = Depends(verify_token)):
    _forecast_cache["forecasts"] = None
    _forecast_cache["top_brands"] = None
    _forecast_cache["comparison"] = None
    _load_forecasts()
    return {"status": "reloaded"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
