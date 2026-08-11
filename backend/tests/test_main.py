"""Backend unit tests (pytest + Starlette TestClient).

Covers: successful login, invalid-password login, an unauthenticated
request to a protected endpoint, and the health check — matching the
test set described in the FYP report, Chapter 4.6.1.

Login tests use a fake user list (monkeypatched over main._load_users)
so they don't depend on whatever real accounts exist in users.json.
"""
import bcrypt
import pytest
from fastapi.testclient import TestClient

import main

TEST_USERNAME = "testuser"
TEST_PASSWORD = "testpass123"
TEST_HASH = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt()).decode()

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def fake_users(monkeypatch):
    monkeypatch.setattr(
        main,
        "_load_users",
        lambda: [{"id": 1, "username": TEST_USERNAME, "password": TEST_HASH, "role": "admin"}],
    )
    main._login_attempts.clear()


def test_health():
    r = client.get("/health")
    assert r.status_code == 200


def test_login_success():
    r = client.post("/api/login", json={"username": TEST_USERNAME, "password": TEST_PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert "token" in body
    assert body["user"]["username"] == TEST_USERNAME


def test_login_invalid_password():
    r = client.post("/api/login", json={"username": TEST_USERNAME, "password": "wrong-password"})
    assert r.status_code == 401


def test_summary_requires_auth():
    r = client.get("/api/summary")
    assert r.status_code in (401, 403)


VALID_CSV = (
    b"com_unit,saleman_cd,inv_desc,inv_cd,trx_amt,cost_amt,trx_qty,list_price,trx_date\n"
    b"JCI,S1,CASIO,MTP-1234,100,50,1,120,01/01/2025\n"
)

# A CSV that satisfies the dashboard's six columns but omits the three the
# brand-model breakdown needs — this used to upload cleanly and then 500.
SUMMARY_ONLY_CSV = (
    b"com_unit,saleman_cd,inv_desc,trx_amt,cost_amt,trx_date\n"
    b"JCI,S1,CASIO,100,50,01/01/2025\n"
)


def _use_temp_csv(monkeypatch, tmp_path):
    """Point the sales backend at a throwaway file so tests never touch the
    real data the running app relies on."""
    path = str(tmp_path / "sales_data.csv")
    monkeypatch.setattr(main, "CSV_FILE_PATH", path)
    monkeypatch.setattr(main.datasource, "_active", main.datasource.FileSource(path))
    return path


def test_upload_rejects_role_outside_manager_admin():
    # "boss" is a real role in this system (see backend/users.json) but is not
    # in require_role("manager", "admin") for this endpoint.
    token = main.create_access_token("boss_user", "boss")
    r = client.post(
        "/api/data/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("sales.csv", VALID_CSV, "text/csv")},
    )
    assert r.status_code == 403


def test_agenda_generate_rejects_role_outside_manager_admin():
    token = main.create_access_token("boss_user", "boss")
    r = client.post(
        "/api/agenda/generate",
        headers={"Authorization": f"Bearer {token}"},
        data={"month": 5},
        files={"year25": ("report.csv", VALID_CSV, "text/csv")},
    )
    assert r.status_code == 403


def test_upload_accepts_manager_role_with_valid_csv(tmp_path, monkeypatch):
    _use_temp_csv(monkeypatch, tmp_path)
    token = main.create_access_token("mgr_user", "manager")
    r = client.post(
        "/api/data/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("sales.csv", VALID_CSV, "text/csv")},
    )
    assert r.status_code == 200
    assert (tmp_path / "sales_data.csv").exists()


def test_upload_rejects_non_csv_extension(tmp_path, monkeypatch):
    _use_temp_csv(monkeypatch, tmp_path)
    token = main.create_access_token("mgr_user", "manager")
    r = client.post(
        "/api/data/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("sales.txt", b"not a csv", "text/plain")},
    )
    assert r.status_code == 400


def test_upload_rejects_missing_required_columns(tmp_path, monkeypatch):
    _use_temp_csv(monkeypatch, tmp_path)
    token = main.create_access_token("mgr_user", "manager")
    r = client.post(
        "/api/data/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("sales.csv", b"foo,bar\n1,2\n", "text/csv")},
    )
    assert r.status_code == 400


def test_upload_rejects_csv_missing_brand_model_columns(tmp_path, monkeypatch):
    # Regression: passing upload validation must guarantee /api/brands/models works.
    _use_temp_csv(monkeypatch, tmp_path)
    token = main.create_access_token("mgr_user", "manager")
    r = client.post(
        "/api/data/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("sales.csv", SUMMARY_ONLY_CSV, "text/csv")},
    )
    assert r.status_code == 400
    for col in ("inv_cd", "list_price", "trx_qty"):
        assert col in r.json()["detail"]


def _agenda_csv(branches: list[str], year: int,
                extra_rows: list[str] | None = None) -> bytes:
    """Minimal full-POS-export CSV accepted by load_report_csv (July rows)."""
    rows = ["com_unit,inv_category,trx_date,trx_mode,trx_amt,cost_amt,trx_qty"]
    for b in branches:
        rows.append(f"{b},CAS,15/07/{year} 10:00:00,D,1000,400,2")
    rows.extend(extra_rows or [])
    return ("\n".join(rows) + "\n").encode()


def _agenda_post(data_branches: str | None, csv_branches: list[str]):
    token = main.create_access_token("mgr_user", "manager")
    data = {"month": 7}
    if data_branches is not None:
        data["branches"] = data_branches
    return client.post(
        "/api/agenda/generate",
        headers={"Authorization": f"Bearer {token}"},
        data=data,
        files={
            "year25": ("y25.csv", _agenda_csv(csv_branches, 2025), "text/csv"),
            "year26": ("y26.csv", _agenda_csv(csv_branches, 2026), "text/csv"),
        },
    )


def _xlsx_labels(body: dict) -> list:
    import base64, io
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(body["agendaBase64"])))
    ws = wb["Sheet1"]
    return [ws[f"B{6 + 2 * i}"].value for i in range(6)]


def test_agenda_custom_branches_and_zip():
    import base64, io, zipfile
    r = _agenda_post("WZ,JCI,TBT", ["JCI", "KMT", "WZ", "TBT"])
    assert r.status_code == 200
    body = r.json()
    assert body["branches"] == ["WZ", "JCI", "TBT"]
    assert body["skippedBranches"] == []
    assert [m["branch"] for m in body["messages"]] == ["WZ", "JCI", "TBT"]
    # Workbook: first three slots hold the selection, the rest are blanked.
    assert _xlsx_labels(body) == ["WZ", "JCI", "TBT", None, None, None]
    # ZIP: one .txt per outlet + combined + the workbook.
    zf = zipfile.ZipFile(io.BytesIO(base64.b64decode(body["zipBase64"])))
    assert sorted(zf.namelist()) == sorted(
        ["WZ_July.txt", "JCI_July.txt", "TBT_July.txt",
         "ALL_MESSAGES.txt", "agenda_July.xlsx"]
    )
    assert "Outlets: WZ JULY" in zf.read("WZ_July.txt").decode("utf-8")


def test_agenda_skips_unknown_branches():
    r = _agenda_post("JCI,ZZZ", ["JCI", "KMT"])
    assert r.status_code == 200
    body = r.json()
    assert body["branches"] == ["JCI"]
    assert body["skippedBranches"] == ["ZZZ"]
    assert [m["branch"] for m in body["messages"]] == ["JCI"]
    # Nothing valid selected -> clean 400, not junk output.
    r2 = _agenda_post("ZZZ", ["JCI", "KMT"])
    assert r2.status_code == 400


def test_agenda_more_than_six_branches():
    eight = ["JCI", "KMT", "GPL", "MRT", "MFW", "SAT", "WZ", "TBT"]
    r = _agenda_post(",".join(eight), eight)
    assert r.status_code == 200
    body = r.json()
    # All eight get messages; the workbook keeps the first six.
    assert [m["branch"] for m in body["messages"]] == eight
    assert _xlsx_labels(body) == eight[:6]


def test_agenda_repair_deposit_line():
    # OT (repair/reservation deposits) must surface as a labelled line when it
    # moves >= RM500, and stay hidden as a product row in the breakdown.
    token = main.create_access_token("mgr_user", "manager")
    r = client.post(
        "/api/agenda/generate",
        headers={"Authorization": f"Bearer {token}"},
        data={"month": 7, "branches": "JCI"},
        files={
            "year25": ("y25.csv", _agenda_csv(
                ["JCI"], 2025,
                ["JCI,OT,10/07/2025 09:00:00,D,5000,0,1"]), "text/csv"),
            "year26": ("y26.csv", _agenda_csv(
                ["JCI"], 2026,
                ["JCI,OT,10/07/2026 09:00:00,D,100,0,1"]), "text/csv"),
        },
    )
    assert r.status_code == 200
    text = r.json()["messages"][0]["text"]
    assert "Repair/reservation deposits decreased by -RM4,900.00" in text
    assert "Repair Deposit" not in text  # no product-style OT row


def test_agenda_default_branches_unchanged():
    r = _agenda_post(None, list(main.TARGET_BRANCHES))
    assert r.status_code == 200
    body = r.json()
    assert body["branches"] == list(main.TARGET_BRANCHES)
    assert [m["branch"] for m in body["messages"]] == list(main.TARGET_BRANCHES)
    assert body["agendaFilename"] == "agenda_July.xlsx"
    assert _xlsx_labels(body) == list(main.TARGET_BRANCHES)


def test_datasource_selection_honours_env():
    assert main.datasource.build_source("file", "x.csv").name == "file"
    assert main.datasource.build_source("supabase", "x.csv").name == "supabase"
    # Unknown values fall back to the offline-safe backend.
    assert main.datasource.build_source("nonsense", "x.csv").name == "file"


def test_sql_validator_allows_plain_select():
    from assistant import clean_sql, validate_sql
    sql = validate_sql(clean_sql("```sql\nSELECT com_unit FROM sales_transactions\n```"))
    assert sql == "SELECT com_unit FROM sales_transactions"   # returned unchanged


@pytest.mark.parametrize("inner", [
    "select 1 from sales_transactions",
    "select 1 from sales_transactions limit 5",          # already limited
    "select 1 from sales_transactions limit 5 offset 10",  # appending would break
    "select * from (select 1 from sales_transactions limit 3) x",
])
def test_capped_wraps_any_statement_shape(inner):
    # Regression: the row cap used to be appended as text, which produced
    # "... limit 5 limit 200" and a Postgres syntax error.
    from assistant import MAX_ROWS, capped
    out = capped(inner)
    assert out.startswith("select * from (")
    assert out.endswith(f"limit {MAX_ROWS}")
    assert inner in out


@pytest.mark.parametrize("bad", [
    "drop table sales_transactions",
    "insert into sales_transactions values (1)",
    "update sales_transactions set trx_amt = 0",
    "select 1; delete from sales_transactions",
    "select 1 -- sneaky",
    "with x as (select 1) insert into sales_transactions values (1)",
])
def test_sql_validator_rejects_writes_and_injection(bad):
    from assistant import AssistantError, clean_sql, validate_sql
    with pytest.raises(AssistantError):
        validate_sql(clean_sql(bad))


def test_sql_validator_allows_cte():
    from assistant import clean_sql, validate_sql
    sql = validate_sql(clean_sql("WITH t AS (SELECT 1 AS n) SELECT n FROM t LIMIT 5"))
    assert sql.lower().startswith("with")


@pytest.mark.parametrize("prose", [
    "I'm sorry, but I can't help with that.",       # a refusal containing "with"
    "I cannot answer that from the sales data.",
])
def test_prose_reply_gives_a_human_message(prose):
    # Regression: clean_sql used to match the "with" inside ordinary prose and
    # hand the validator a fragment, surfacing "Only SELECT queries are allowed".
    from assistant import AssistantError, clean_sql, validate_sql
    assert clean_sql(prose) == ""
    with pytest.raises(AssistantError, match="only answer questions about the sales data"):
        validate_sql(clean_sql(prose))


def test_chat_requires_auth():
    r = client.post("/api/chat", json={"question": "which branch earned most?"})
    assert r.status_code in (401, 403)


def test_chat_503_when_assistant_unconfigured(monkeypatch):
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    token = main.create_access_token("mgr_user", "manager")
    r = client.post(
        "/api/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"question": "which branch earned the most?"},
    )
    assert r.status_code == 503
    assert "not configured" in r.json()["detail"].lower()


def test_chat_503_in_file_mode_even_when_configured(monkeypatch, tmp_path):
    # The assistant answers by querying SQL, so it is unavailable offline.
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-test-key")
    _use_temp_csv(monkeypatch, tmp_path)
    token = main.create_access_token("mgr_user", "manager")
    r = client.post(
        "/api/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"question": "which branch earned the most?"},
    )
    assert r.status_code == 503
    assert "database" in r.json()["detail"].lower()


MINIMAL_SEASONAL = {
    "meta": {"limitations": []},
    "seasons": {},
    "per_brand": [],
    "per_month": {str(m): {"peaking": [], "restock_now": []} for m in range(1, 13)},
    "season_totals": {},
}


def test_seasonal_requires_auth():
    r = client.get("/api/insights/seasonal")
    assert r.status_code in (401, 403)


def test_seasonal_with_token(tmp_path, monkeypatch):
    import json as _json
    (tmp_path / "seasonal_restock.json").write_text(_json.dumps(MINIMAL_SEASONAL))
    monkeypatch.setattr(main, "DATAMINING_DIR", str(tmp_path))
    monkeypatch.setitem(main._seasonal_cache, "seasonal", None)
    token = main.create_access_token("boss_user", "boss")
    r = client.get("/api/insights/seasonal", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert "per_month" in r.json()


def test_seasonal_missing_data_503(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATAMINING_DIR", str(tmp_path))
    monkeypatch.setitem(main._seasonal_cache, "seasonal", None)
    token = main.create_access_token("boss_user", "boss")
    r = client.get("/api/insights/seasonal", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 503
