"""
API tests for FinOps budgets — requires Pro plan.
Uses the ws_setup fixture from conftest.py.
"""
import pytest


BASE = "/api/v1/orgs/{org}/workspaces/{ws}/finops/budgets"


def _url(setup, extra=""):
    return BASE.format(org=setup["org_slug"], ws=setup["workspace_id"]) + extra


# ── List (empty) ──────────────────────────────────────────────────────────────


def test_list_budgets_empty(client, ws_setup):
    resp = client.get(_url(ws_setup), headers=ws_setup["headers"])
    assert resp.status_code == 200
    assert resp.json() == []


# ── Create ────────────────────────────────────────────────────────────────────


def test_create_budget_success(client, ws_setup):
    payload = {"name": "AWS Monthly", "provider": "aws", "amount": 500.0}
    resp = client.post(_url(ws_setup), json=payload, headers=ws_setup["headers"])
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["name"] == "AWS Monthly"
    assert data["provider"] == "aws"
    assert data["amount"] == 500.0
    assert data["period"] == "monthly"


def test_create_budget_all_providers(client, ws_setup):
    payload = {"name": "Total Budget", "provider": "all", "amount": 1000.0}
    resp = client.post(_url(ws_setup), json=payload, headers=ws_setup["headers"])
    assert resp.status_code == 201
    assert resp.json()["provider"] == "all"


def test_create_budget_gcp(client, ws_setup):
    payload = {"name": "GCP Dev", "provider": "gcp", "amount": 200.0}
    resp = client.post(_url(ws_setup), json=payload, headers=ws_setup["headers"])
    assert resp.status_code == 201
    assert resp.json()["provider"] == "gcp"


def test_create_budget_requires_pro(client):
    """Free-plan user (no ws_setup upgrade) should get 403."""
    import uuid
    email = f"free_{uuid.uuid4().hex[:6]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Free User", "password": "Test1234!"},
    )
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    orgs = client.get("/api/v1/orgs", headers=headers).json()["organizations"]
    org_slug = orgs[0]["slug"]
    ws_id = client.get(f"/api/v1/orgs/{org_slug}/workspaces", headers=headers).json()["workspaces"][0]["id"]

    url = BASE.format(org=org_slug, ws=ws_id)
    resp = client.post(url, json={"name": "X", "provider": "aws", "amount": 100.0}, headers=headers)
    assert resp.status_code == 403


# ── List after create ─────────────────────────────────────────────────────────


def test_list_budgets_after_create(client, ws_setup):
    client.post(_url(ws_setup), json={"name": "List Test", "provider": "aws", "amount": 300.0}, headers=ws_setup["headers"])
    resp = client.get(_url(ws_setup), headers=ws_setup["headers"])
    assert resp.status_code == 200
    names = [b["name"] for b in resp.json()]
    assert "List Test" in names


# ── Delete ────────────────────────────────────────────────────────────────────


def test_delete_budget(client, ws_setup):
    create_resp = client.post(
        _url(ws_setup),
        json={"name": "To Delete", "provider": "azure", "amount": 100.0},
        headers=ws_setup["headers"],
    )
    budget_id = create_resp.json()["id"]

    del_resp = client.delete(_url(ws_setup, f"/{budget_id}"), headers=ws_setup["headers"])
    assert del_resp.status_code == 204

    budgets = client.get(_url(ws_setup), headers=ws_setup["headers"]).json()
    assert not any(b["id"] == budget_id for b in budgets)


def test_delete_nonexistent_budget(client, ws_setup):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = client.delete(_url(ws_setup, f"/{fake_id}"), headers=ws_setup["headers"])
    assert resp.status_code == 404


# ── breakdown field present ───────────────────────────────────────────────────


def test_budget_breakdown_field_present(client, ws_setup):
    """The breakdown field should always be present (None if not evaluated)."""
    resp = client.post(
        _url(ws_setup),
        json={"name": "Breakdown Test", "provider": "all", "amount": 500.0},
        headers=ws_setup["headers"],
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "breakdown" in data
