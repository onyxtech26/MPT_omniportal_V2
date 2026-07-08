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
