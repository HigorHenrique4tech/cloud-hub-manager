"""
Testes de autenticação — register, login, token, rate limiting.
"""
import pytest
from fastapi.testclient import TestClient


REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
ME_URL = "/api/v1/auth/me"
REFRESH_URL = "/api/v1/auth/refresh"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _register(client: TestClient, email="test@example.com", password="Test1234!"):
    return client.post(REGISTER_URL, json={"email": email, "name": "Test User", "password": password})


def _login(client: TestClient, email="test@example.com", password="Test1234!"):
    return client.post(LOGIN_URL, json={"email": email, "password": password})


# ── Register ─────────────────────────────────────────────────────────────────

def test_register_success(client):
    resp = _register(client, email="register_ok@example.com")
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "register_ok@example.com"


def test_register_duplicate_email(client):
    _register(client, email="dup@example.com")
    resp = _register(client, email="dup@example.com")
    assert resp.status_code == 400
    assert "cadastrado" in resp.json()["detail"].lower()


# ── Login ────────────────────────────────────────────────────────────────────

def test_login_success(client):
    _register(client, email="login_ok@example.com")
    resp = _login(client, email="login_ok@example.com")
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_login_wrong_password(client):
    _register(client, email="wrong_pw@example.com")
    resp = _login(client, email="wrong_pw@example.com", password="WrongPass!")
    assert resp.status_code == 401


def test_login_nonexistent_user(client):
    resp = _login(client, email="nobody@example.com")
    assert resp.status_code == 401


# ── /me ──────────────────────────────────────────────────────────────────────

def test_me_authenticated(client):
    _register(client, email="me_ok@example.com")
    login_resp = _login(client, email="me_ok@example.com")
    token = login_resp.json()["access_token"]

    resp = client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "me_ok@example.com"


def test_me_unauthenticated(client):
    resp = client.get(ME_URL)
    assert resp.status_code == 401


# ── Refresh Token ────────────────────────────────────────────────────────────

def test_refresh_token(client):
    _register(client, email="refresh_ok@example.com")
    login_resp = _login(client, email="refresh_ok@example.com")
    refresh_token = login_resp.json()["refresh_token"]

    resp = client.post(REFRESH_URL, json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_refresh_invalid_token(client):
    resp = client.post(REFRESH_URL, json={"refresh_token": "invalid-token"})
    assert resp.status_code == 401


# ── Rate Limiting ────────────────────────────────────────────────────────────

def test_rate_limit_login(client):
    """After 5 rapid login attempts, the 6th should be rate-limited (429)."""
    _register(client, email="rate_limit@example.com")

    statuses = []
    last_resp = None
    for _ in range(6):
        resp = _login(client, email="rate_limit@example.com", password="WrongPass!")
        statuses.append(resp.status_code)
        last_resp = resp

    # At least one 429 among the 6 attempts
    assert 429 in statuses, f"Expected a 429, got: {statuses}"

    # When rate limited, response should include Retry-After header
    limited_resp = last_resp if last_resp.status_code == 429 else None
    if limited_resp:
        assert "Retry-After" in limited_resp.headers
        body = limited_resp.json()
        assert "detail" in body
        assert "retry_after" in body


def test_rate_limit_headers_present(client):
    """All API responses should include X-RateLimit-Limit header."""
    resp = client.get(ME_URL)
    # Even 401 responses should have rate limit headers
    assert "X-RateLimit-Limit" in resp.headers
    assert "X-RateLimit-Policy" in resp.headers


# ── Login lockout (per-user brute-force protection) ──────────────────────────

def test_login_lockout_triggers_after_threshold(client, db):
    """After max_attempts failed logins, account should be locked (429)."""
    from app.core.redis_client import record_login_failure, is_login_locked, clear_login_failures
    from app.models.db_models import User

    _register(client, email="lockout_test@example.com")
    login_resp = _login(client, email="lockout_test@example.com")
    user_id = str(login_resp.json()["user"]["id"])

    clear_login_failures(user_id)

    # Simulate 10 failures programatically (avoids IP rate limit)
    for _ in range(10):
        record_login_failure(user_id, max_attempts=10, window_seconds=900, lock_seconds=60)

    assert is_login_locked(user_id), "User should be locked after 10 failures"

    # Next real login attempt must return 429
    resp = _login(client, email="lockout_test@example.com")
    assert resp.status_code == 429, f"Expected 429 lockout, got {resp.status_code}: {resp.text}"

    clear_login_failures(user_id)


def test_login_lockout_clears_on_success(client, db):
    """Successful login should clear the failure counter."""
    from app.core.redis_client import record_login_failure, is_login_locked, clear_login_failures

    _register(client, email="lockout_clear@example.com")
    login_resp = _login(client, email="lockout_clear@example.com")
    user_id = str(login_resp.json()["user"]["id"])

    clear_login_failures(user_id)
    for _ in range(5):
        record_login_failure(user_id, max_attempts=10, window_seconds=900, lock_seconds=60)

    # Successful login should clear failures
    resp = _login(client, email="lockout_clear@example.com")
    assert resp.status_code == 200
    assert not is_login_locked(user_id), "Failures should be cleared after successful login"


# ── OAuth state (anti-CSRF) ───────────────────────────────────────────────────

def test_oauth_state_invalid_provider(client):
    """Requesting state for unknown provider must return 400."""
    resp = client.post("/api/v1/auth/oauth/state", json={"provider": "fakeprovider"})
    assert resp.status_code == 400


def test_google_callback_with_invalid_state(client):
    """Google callback with an invalid state must be rejected (400 or 503 if Redis down)."""
    resp = client.post(
        "/api/v1/auth/google/callback",
        json={"code": "fake_code", "redirect_uri": "http://localhost:3000", "state": "invalid_state_xyz"},
    )
    # 400 = bad state; 400 = Google API failure too — both are acceptable rejections
    assert resp.status_code in (400, 503), f"Expected 400/503, got {resp.status_code}"


# ── Email change double opt-in ────────────────────────────────────────────────

def test_email_change_requires_password(client, db):
    """PUT /me without current_password when changing email must be rejected."""
    _register(client, email="emailchange_pw@example.com")
    login_resp = _login(client, email="emailchange_pw@example.com")
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Mark user as verified so /me is accessible
    from app.models.db_models import User
    u = db.query(User).filter(User.email == "emailchange_pw@example.com").first()
    u.is_verified = True
    db.commit()

    # Attempt email change without current_password
    resp = client.put(ME_URL, json={"email": "new_email@example.com"}, headers=headers)
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"


def test_email_change_wrong_password(client, db):
    """PUT /me with wrong current_password when changing email must be rejected."""
    _register(client, email="emailchange_bad@example.com")
    login_resp = _login(client, email="emailchange_bad@example.com")
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    from app.models.db_models import User
    u = db.query(User).filter(User.email == "emailchange_bad@example.com").first()
    u.is_verified = True
    db.commit()

    resp = client.put(
        ME_URL,
        json={"email": "new_email_bad@example.com", "current_password": "WrongPassword!"},
        headers=headers,
    )
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"


def test_email_change_valid_flow(client, db):
    """Valid email change should set pending_email and NOT update email immediately."""
    import uuid
    unique = uuid.uuid4().hex[:8]
    email = f"emailchange_ok_{unique}@example.com"

    _register(client, email=email)
    login_resp = _login(client, email=email)
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    from app.models.db_models import User
    u = db.query(User).filter(User.email == email).first()
    u.is_verified = True
    db.commit()

    new_email = f"new_{unique}@example.com"
    resp = client.put(
        ME_URL,
        json={"email": new_email, "current_password": "Test1234!"},
        headers=headers,
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    # Email must NOT have changed yet
    db.refresh(u)
    assert u.email == email, "Email must not change until confirmation"
    assert u.pending_email == new_email, "pending_email should be set"
    assert u.email_change_token is not None, "email_change_token should be set"


# ── LGPD — exportação e deleção de conta ─────────────────────────────────────

def test_export_my_data_authenticated(client, db):
    """GET /auth/me/export should return a JSON with user personal data."""
    _register(client, email="export_test@example.com")
    login_resp = _login(client, email="export_test@example.com")
    token = login_resp.json()["access_token"]

    from app.models.db_models import User
    u = db.query(User).filter(User.email == "export_test@example.com").first()
    u.is_verified = True
    db.commit()

    resp = client.get("/api/v1/auth/me/export", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "profile" in data
    assert "organizations" in data
    assert "terms_acceptances" in data
    assert data["profile"]["email"] == "export_test@example.com"


def test_delete_account_wrong_password(client, db):
    """DELETE /auth/me/account with wrong password must return 400."""
    _register(client, email="delete_bad@example.com")
    login_resp = _login(client, email="delete_bad@example.com")
    token = login_resp.json()["access_token"]

    from app.models.db_models import User
    u = db.query(User).filter(User.email == "delete_bad@example.com").first()
    u.is_verified = True
    db.commit()

    resp = client.request(
        "DELETE", "/api/v1/auth/me/account",
        json={"password": "WrongPass!"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_delete_account_success(client, db):
    """DELETE /auth/me/account should anonymize the user and deactivate the account."""
    _register(client, email="delete_ok@example.com")
    login_resp = _login(client, email="delete_ok@example.com")
    token = login_resp.json()["access_token"]
    user_id = login_resp.json()["user"]["id"]

    from app.models.db_models import User
    u = db.query(User).filter(User.email == "delete_ok@example.com").first()
    u.is_verified = True
    db.commit()

    resp = client.request(
        "DELETE", "/api/v1/auth/me/account",
        json={"password": "Test1234!"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    db.refresh(u)
    assert u.is_active is False
    assert "deleted" in u.email
    assert u.name == "Usuário Deletado"
    assert u.phone is None
