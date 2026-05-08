from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import pandas as pd
import os
import time
from collections import defaultdict

from mysql.connector.pooling import MySQLConnectionPool
from mysql.connector import Error

SECRET_KEY = os.environ.get("JWT_SECRET", "")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET environment variable is not set")

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

_DUMMY_HASH = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW"

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

CSV_FILE_PATH = os.path.join(os.path.dirname(__file__), "Sales Profit Report - By Product Group 2024.csv")

DB_CONFIG = {
    'host': os.environ.get("DB_HOST", "localhost"),
    'user': os.environ.get("DB_USER", "root"),
    'password': os.environ.get("DB_PASSWORD", ""),
    'database': os.environ.get("DB_NAME", "mpt_db"),
}

_db_pool = MySQLConnectionPool(pool_name="mpt_pool", pool_size=5, **DB_CONFIG)

# Cache invalidated automatically when CSV file is modified on disk
_summary_cache: dict = {"data": None, "mtime": 0.0}


def _get_client_ip(req: Request) -> str:
    # Nginx forwards the real client IP via X-Real-IP
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

    df = pd.read_csv(CSV_FILE_PATH)
    df['trx_amt'] = pd.to_numeric(df['trx_amt'], errors='coerce').fillna(0)
    df['cost_amt'] = pd.to_numeric(df['cost_amt'], errors='coerce').fillna(0)
    df['trx_date'] = pd.to_datetime(df['trx_date'], errors='coerce')
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
    conn = None
    try:
        conn = _db_pool.get_connection()
    except Exception:
        raise HTTPException(status_code=503, detail="Database unreachable")
    finally:
        if conn:
            conn.close()
    return {"status": "ok"}


@app.post("/api/login")
def login(request: LoginRequest, req: Request):
    _check_rate_limit(_get_client_ip(req))

    conn = None
    cursor = None
    user_record = None
    try:
        conn = _db_pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, username, password, role FROM users WHERE username = %s",
            (request.username,)
        )
        user_record = cursor.fetchone()
    except Error:
        raise HTTPException(status_code=500, detail="Service unavailable")
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()

    stored_hash = user_record["password"] if user_record else _DUMMY_HASH
    password_valid = pwd_context.verify(request.password, stored_hash)

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
