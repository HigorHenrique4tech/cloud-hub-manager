"""
Testes de API do módulo Kubernetes.

Cobrem: autenticação obrigatória, gate de plano (enterprise), validação de
import de kubeconfig, isolamento multi-tenant e o ciclo registrar→listar.
Usam as fixtures de conftest.py (SQLite in-memory).
"""
import uuid
import pytest

from app.models.db_models import Organization


K8S_BASE = "/api/v1/orgs/{slug}/workspaces/{ws}/k8s"

# kubeconfig estruturalmente válido (servidor inalcançável — status ficará "unreachable")
VALID_KUBECONFIG = {
    "apiVersion": "v1",
    "kind": "Config",
    "clusters": [{"name": "t", "cluster": {
        "server": "https://127.0.0.1:6443", "insecure-skip-tls-verify": True}}],
    "users": [{"name": "t", "user": {"token": "fake-token"}}],
    "contexts": [{"name": "t", "context": {"cluster": "t", "user": "t"}}],
    "current-context": "t",
}


def _set_plan(db, slug, plan):
    org = db.query(Organization).filter(Organization.slug == slug).first()
    org.plan_tier = plan
    db.commit()


@pytest.fixture()
def ent_setup(client, db, ws_setup):
    """Promove a org do ws_setup para enterprise."""
    _set_plan(db, ws_setup["org_slug"], "enterprise")
    return ws_setup


def _url(setup, path=""):
    return K8S_BASE.format(slug=setup["org_slug"], ws=setup["workspace_id"]) + path


# ── Autenticação ──────────────────────────────────────────────────────────────

def test_clusters_requires_auth(client, ent_setup):
    resp = client.get(_url(ent_setup, "/clusters"))
    assert resp.status_code in (401, 403)


# ── Plan gate ─────────────────────────────────────────────────────────────────

def test_clusters_blocked_for_pro_plan(client, ws_setup):
    """Plano pro (não-enterprise) deve receber 403 no módulo K8s."""
    resp = client.get(_url(ws_setup, "/clusters"), headers=ws_setup["headers"])
    assert resp.status_code == 403
    assert "Kubernetes" in resp.json()["detail"]


def test_clusters_allowed_for_enterprise(client, ent_setup):
    resp = client.get(_url(ent_setup, "/clusters"), headers=ent_setup["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["clusters"] == []


# ── Validação de import ───────────────────────────────────────────────────────

def test_import_rejects_kubeconfig_without_clusters(client, ent_setup):
    resp = client.post(
        _url(ent_setup, "/clusters"),
        headers=ent_setup["headers"],
        json={"name": "bad", "kubeconfig": {"foo": "bar"}},
    )
    assert resp.status_code == 400


def test_import_rejects_invalid_raw_yaml(client, ent_setup):
    resp = client.post(
        _url(ent_setup, "/clusters"),
        headers=ent_setup["headers"],
        json={"name": "bad2", "kubeconfig_raw": "just a plain string"},
    )
    assert resp.status_code == 400


def test_import_blocked_for_pro_plan(client, ws_setup):
    resp = client.post(
        _url(ws_setup, "/clusters"),
        headers=ws_setup["headers"],
        json={"name": "x", "kubeconfig": VALID_KUBECONFIG},
    )
    assert resp.status_code == 403


# ── Ciclo registrar → listar ──────────────────────────────────────────────────

def test_import_then_list_cluster(client, ent_setup):
    name = f"cluster-{uuid.uuid4().hex[:6]}"
    resp = client.post(
        _url(ent_setup, "/clusters"),
        headers=ent_setup["headers"],
        json={"name": name, "kubeconfig": VALID_KUBECONFIG},
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["name"] == name
    assert created["source"] == "manual"
    # servidor inalcançável → status unreachable (a conexão é testada no import)
    assert created["status"] in ("unreachable", "connected")

    listing = client.get(_url(ent_setup, "/clusters"), headers=ent_setup["headers"])
    assert listing.status_code == 200
    names = [c["name"] for c in listing.json()["clusters"]]
    assert name in names


def test_import_duplicate_name_conflicts(client, ent_setup):
    name = f"dup-{uuid.uuid4().hex[:6]}"
    body = {"name": name, "kubeconfig": VALID_KUBECONFIG}
    first = client.post(_url(ent_setup, "/clusters"), headers=ent_setup["headers"], json=body)
    assert first.status_code == 201
    second = client.post(_url(ent_setup, "/clusters"), headers=ent_setup["headers"], json=body)
    assert second.status_code == 409


# ── Isolamento multi-tenant ───────────────────────────────────────────────────

def test_cluster_isolated_between_orgs(client, db, ent_setup):
    # cria cluster na org A
    name = f"isolated-{uuid.uuid4().hex[:6]}"
    client.post(_url(ent_setup, "/clusters"), headers=ent_setup["headers"],
                json={"name": name, "kubeconfig": VALID_KUBECONFIG})

    # registra segundo usuário (org B própria), também enterprise
    email = f"orgb_{uuid.uuid4().hex[:6]}@example.com"
    reg = client.post("/api/v1/auth/register",
                      json={"email": email, "name": "Org B", "password": "Test1234!"})
    assert reg.status_code == 201
    b_headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    b_orgs = client.get("/api/v1/orgs", headers=b_headers).json()["organizations"]
    b_slug = b_orgs[0]["slug"]
    _set_plan(db, b_slug, "enterprise")

    # usuário B não acessa o workspace da org A
    resp = client.get(_url(ent_setup, "/clusters"), headers=b_headers)
    assert resp.status_code in (403, 404)


# ── 404 em cluster inexistente ────────────────────────────────────────────────

def test_overview_unknown_cluster_404(client, ent_setup):
    fake_id = str(uuid.uuid4())
    resp = client.get(_url(ent_setup, f"/clusters/{fake_id}/overview"),
                      headers=ent_setup["headers"])
    assert resp.status_code == 404


# ── Ações de escrita (V1) ─────────────────────────────────────────────────────

def test_scale_unknown_cluster_404(client, ent_setup):
    fake_id = str(uuid.uuid4())
    resp = client.post(
        _url(ent_setup, f"/clusters/{fake_id}/deployments/default/web/scale"),
        headers=ent_setup["headers"], json={"replicas": 3},
    )
    assert resp.status_code == 404


def test_scale_invalid_replicas_400(client, ent_setup):
    name = f"sc-{uuid.uuid4().hex[:6]}"
    created = client.post(_url(ent_setup, "/clusters"), headers=ent_setup["headers"],
                          json={"name": name, "kubeconfig": VALID_KUBECONFIG}).json()
    resp = client.post(
        _url(ent_setup, f"/clusters/{created['id']}/deployments/default/web/scale"),
        headers=ent_setup["headers"], json={"replicas": -5},
    )
    assert resp.status_code == 400


def test_scale_blocked_for_pro_plan(client, ws_setup):
    fake_id = str(uuid.uuid4())
    resp = client.post(
        _url(ws_setup, f"/clusters/{fake_id}/deployments/default/web/scale"),
        headers=ws_setup["headers"], json={"replicas": 2},
    )
    assert resp.status_code == 403


def test_restart_unknown_cluster_404(client, ent_setup):
    fake_id = str(uuid.uuid4())
    resp = client.post(
        _url(ent_setup, f"/clusters/{fake_id}/deployments/default/web/restart"),
        headers=ent_setup["headers"],
    )
    assert resp.status_code == 404
