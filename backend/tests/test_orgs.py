"""
RBAC and organization API tests.
"""
import pytest


# ── List orgs ─────────────────────────────────────────────────────────────────


def test_list_orgs_unauthenticated(client):
    resp = client.get("/api/v1/orgs")
    assert resp.status_code == 401


def test_list_orgs_authenticated(client, ws_setup):
    resp = client.get("/api/v1/orgs", headers=ws_setup["headers"])
    assert resp.status_code == 200
    orgs = resp.json()["organizations"]
    assert len(orgs) >= 1
    assert all("slug" in o for o in orgs)


# ── Workspace access ──────────────────────────────────────────────────────────


def test_list_workspaces_owner(client, ws_setup):
    resp = client.get(
        f"/api/v1/orgs/{ws_setup['org_slug']}/workspaces",
        headers=ws_setup["headers"],
    )
    assert resp.status_code == 200
    ws = resp.json()["workspaces"]
    assert len(ws) >= 1


def test_workspace_access_other_user_denied(client, ws_setup):
    """Another user should not access a different org's workspace endpoints."""
    import uuid
    email = f"other_{uuid.uuid4().hex[:6]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Other", "password": "Test1234!"},
    )
    other_token = reg.json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    resp = client.get(
        f"/api/v1/orgs/{ws_setup['org_slug']}/workspaces",
        headers=other_headers,
    )
    # Must not be 200 — either 403 or 404
    assert resp.status_code in (403, 404)
