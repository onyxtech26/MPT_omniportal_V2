from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
import pandas as pd
import os
import sys
import json
import time
import base64
import calendar
import io
import shutil
import tempfile
import zipfile
from collections import defaultdict

from dotenv import load_dotenv

from agenda.engine import TARGET_BRANCHES, load_report_csv, load_xls_report
from agenda.agenda_writer import fill_agenda
from agenda.message_gen import generate_message
import assistant
import datasource

# Settings come from backend/.env in development and from real environment
# variables in hosted deployments; both paths land in os.environ.
#
# The frozen desktop build deliberately skips the .env file. That app is the
# offline one, and reading a developer's .env — which points at a cloud
# database — would make it fail on a machine with no network. Real environment
# variables still apply, so a packaged install can be configured on purpose.
if not getattr(sys, "frozen", False):
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

SECRET_KEY = os.environ.get("JWT_SECRET", "local-dev-secret-change-in-production")
DATA_SOURCE = (os.environ.get("DATA_SOURCE") or "file").strip().lower()
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

if getattr(sys, "frozen", False):
    BASE_DIR = sys._MEIPASS  # PyInstaller extraction root
else:
    BASE_DIR = os.path.dirname(__file__)


def _user_data_dir() -> str:
    """Writable per-user folder for data the manager uploads (survives app updates)."""
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    path = os.path.join(base, "MPT OmniPortal")
    os.makedirs(path, exist_ok=True)
    return path


# The sales dataset lives in a writable user folder so the manager can replace it
# from inside the app. The copy bundled with the build seeds it on first run.
# In database mode there is nothing to seed, so the copy is skipped.
_SEED_CSV_PATH = os.path.join(
    BASE_DIR, "Sales Profit Report - By Product Group DEMO 2025-2026.csv"
)
CSV_FILE_PATH = os.path.join(_user_data_dir(), "sales_data.csv")
if DATA_SOURCE != "supabase":
    if not os.path.exists(CSV_FILE_PATH) and os.path.exists(_SEED_CSV_PATH):
        shutil.copy(_SEED_CSV_PATH, CSV_FILE_PATH)

USERS_FILE_PATH = os.path.join(BASE_DIR, "users.json")
AGENDA_TEMPLATE_PATH = os.path.join(BASE_DIR, "agenda", "Meeting_Agenda.xlsx")

# Sales reads go through the configured backend (CSV or Postgres); each one
# owns its own caching strategy.
datasource.set_source(datasource.build_source(DATA_SOURCE, CSV_FILE_PATH))


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


def create_access_token(username: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": username, "role": role, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def _decode_token(credentials: HTTPAuthorizationCredentials) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("sub"):
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    return _decode_token(credentials)["sub"]


def require_role(*allowed: str):
    def checker(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
        payload = _decode_token(credentials)
        role = payload.get("role", "admin")
        if role not in allowed:
            raise HTTPException(status_code=403, detail="Your account does not have permission for this action")
        return payload["sub"]
    return checker


def _load_summary_data() -> dict:
    """Dashboard summary from whichever sales backend is configured."""
    return datasource.get_source().load_summary()


@app.get("/")
def read_root():
    return {"message": "MPT OmniPortal Backend is running"}


@app.get("/health")
def health():
    # The desktop shell blocks its window on this probe, so it deliberately
    # checks only local readiness: a slow or unreachable database must never
    # stop the app from opening.
    source = datasource.get_source()
    if source.name == "file" and not source.is_ready():
        raise HTTPException(status_code=503, detail="Data file missing")
    return {"status": "ok", "dataSource": source.name}


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

    token = create_access_token(user_record["username"], user_record.get("role", "admin"))
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
        return _load_summary_data()
    except HTTPException:
        raise
    except datasource.DataSourceError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to process data")


@app.post("/api/data/upload")
def upload_sales_data(
    file: UploadFile = File(...),
    username: str = Depends(require_role("manager", "admin")),
):
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv sales report.")

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".csv")
    try:
        with os.fdopen(tmp_fd, "wb") as fh:
            shutil.copyfileobj(file.file, fh)

        try:
            sample = pd.read_csv(tmp_path, dtype=str, nrows=5)
        except Exception:
            raise HTTPException(status_code=400, detail="That file could not be read as a CSV.")

        # Checked against every column the app reads, not just the dashboard's:
        # a CSV missing trx_qty/list_price/inv_cd used to upload cleanly and
        # then break the brand-model breakdown.
        missing = datasource.REQUIRED_COLUMNS - set(sample.columns)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"This CSV is missing required columns: {', '.join(sorted(missing))}",
            )

        try:
            datasource.get_source().replace_sales_data(tmp_path)
        except datasource.DataSourceError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {"status": "ok", "message": "Sales data updated."}


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
    branches: str | None = Form(None),
    username: str = Depends(require_role("manager", "admin")),
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

        # Outlet selection: comma-separated codes, defaulting to the six main
        # branches. Codes absent from the uploaded data are skipped (reported
        # back) rather than producing RM0.00 junk messages.
        if branches:
            requested = [b.strip().upper() for b in branches.split(",") if b.strip()]
        else:
            requested = list(TARGET_BRANCHES)
        seen: set[str] = set()
        requested = [b for b in requested if not (b in seen or seen.add(b))]

        available = set(df25["com_unit"].dropna().astype(str).str.strip())
        if df26 is not None:
            available |= set(df26["com_unit"].dropna().astype(str).str.strip())

        selected = [b for b in requested if b in available]
        skipped = [b for b in requested if b not in available]
        if not selected:
            raise HTTPException(
                status_code=400,
                detail="None of the selected outlets appear in the uploaded report(s). "
                       f"Available outlets: {', '.join(sorted(available))}",
            )

        month_name = calendar.month_name[month]
        out_path = os.path.join(tmp_dir, f"agenda_{month_name}.xlsx")
        try:
            # Template holds six slots; the workbook takes the first six
            # selected outlets, messages cover all of them.
            fill_agenda(AGENDA_TEMPLATE_PATH, out_path, df25, df26, month,
                        df25_acc=df25_acc, acc25=acc25, branches=selected[:6])
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to build the agenda spreadsheet")

        with open(out_path, "rb") as fh:
            agenda_bytes = fh.read()
        agenda_b64 = base64.b64encode(agenda_bytes).decode("ascii")

        messages = [
            {"branch": b, "text": generate_message(b, month, df25, df26)}
            for b in selected
        ]

        # Bundle everything into one ZIP: a .txt per outlet message, a
        # combined file, and the agenda workbook itself.
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for m in messages:
                zf.writestr(f"{m['branch']}_{month_name}.txt", m["text"])
            separator = "\n\n" + "-" * 40 + "\n\n"
            zf.writestr("ALL_MESSAGES.txt", separator.join(m["text"] for m in messages))
            zf.writestr(f"agenda_{month_name}.xlsx", agenda_bytes)
        zip_b64 = base64.b64encode(zip_buf.getvalue()).decode("ascii")

        return {
            "month": month_name,
            "branches": selected,
            "skippedBranches": skipped,
            "agendaFilename": f"agenda_{month_name}.xlsx",
            "agendaBase64": agenda_b64,
            "zipFilename": f"agenda_package_{month_name}.zip",
            "zipBase64": zip_b64,
            "messages": messages,
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if getattr(sys, "frozen", False):
    FORECAST_DIR = os.path.join(BASE_DIR, 'forecasting_output')
else:
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

    try:
        models = datasource.get_source().brand_models(brand, branch)
    except datasource.DataSourceError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return {"brand": brand, "branch": branch, "models": models}


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)


# Keeps a single user from exhausting the shared model quota.
_chat_calls: dict = defaultdict(list)
_CHAT_LIMIT = 10
_CHAT_WINDOW = 60


@app.get("/api/chat/status")
def chat_status(username: str = Depends(verify_token)):
    """Lets the UI show why the assistant is unavailable before a question."""
    source = datasource.get_source()
    return {
        "configured": assistant.is_configured(),
        "queryable": source.name == "supabase",
        "model": assistant.model_name() if assistant.is_configured() else None,
    }


@app.post("/api/chat")
def chat(request: ChatRequest, username: str = Depends(verify_token)):
    if not assistant.is_configured():
        raise HTTPException(
            status_code=503,
            detail="The assistant is not configured. Add NVIDIA_API_KEY to backend/.env.",
        )

    source = datasource.get_source()
    if source.name != "supabase":
        raise HTTPException(
            status_code=503,
            detail="The assistant answers questions by querying the database. "
                   "Set DATA_SOURCE=supabase to enable it.",
        )

    now = time.time()
    _chat_calls[username] = [t for t in _chat_calls[username] if now - t < _CHAT_WINDOW]
    if len(_chat_calls[username]) >= _CHAT_LIMIT:
        raise HTTPException(status_code=429, detail="Too many questions. Try again in a minute.")
    _chat_calls[username].append(now)

    try:
        return assistant.answer_question(request.question, source)
    except assistant.AssistantError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except datasource.DataSourceError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


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


if getattr(sys, "frozen", False):
    DATAMINING_DIR = os.path.join(BASE_DIR, 'datamining_output')
else:
    DATAMINING_DIR = os.path.normpath(
        os.path.join(os.path.dirname(__file__), '..', '..', 'datamining', 'output')
    )
_seasonal_cache: dict = {"seasonal": None}


def _load_seasonal():
    if _seasonal_cache["seasonal"] is not None:
        return _seasonal_cache["seasonal"]
    path = os.path.join(DATAMINING_DIR, 'seasonal_restock.json')
    if not os.path.exists(path):
        raise HTTPException(status_code=503, detail="Seasonal data not generated yet. Run datamining/agents/07_seasonal_restock.py first.")
    with open(path, encoding='utf-8') as f:
        _seasonal_cache["seasonal"] = json.load(f)
    return _seasonal_cache["seasonal"]


@app.get("/api/insights/seasonal")
def get_seasonal_insights(
    month: int | None = None,
    username: str = Depends(verify_token),
):
    data = _load_seasonal()
    if month is not None:
        if not 1 <= month <= 12:
            raise HTTPException(status_code=400, detail="month must be 1-12")
        return {
            "meta": data["meta"],
            "seasons": data["seasons"],
            "month": data["per_month"][str(month)],
        }
    return data


@app.post("/api/insights/reload")
def reload_seasonal(username: str = Depends(verify_token)):
    _seasonal_cache["seasonal"] = None
    _load_seasonal()
    return {"status": "reloaded"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
