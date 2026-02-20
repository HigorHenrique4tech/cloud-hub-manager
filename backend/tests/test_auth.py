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
    for _ in range(6):
        resp = _login(client, email="rate_limit@example.com", password="WrongPass!")
        statuses.append(resp.status_code)

    # At least one 429 among the 6 attempts
    assert 429 in statuses, f"Expected a 429, got: {statuses}"
