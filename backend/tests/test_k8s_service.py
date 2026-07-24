"""
Testes de unidade puros do K8sService e do discovery de AKS.

Não dependem do banco nem do app FastAPI — o import de `kubernetes` é
guardado por try/except no módulo, então estes testes rodam mesmo sem a
biblioteca instalada. Validam a lógica de negócio: cálculo de idade,
health score, montagem de topologia e parsing de descoberta AKS.
"""
import sys
import types
from datetime import datetime, timezone, timedelta

from app.services import k8s_service as k8s


# ── _age ──────────────────────────────────────────────────────────────────────

def test_age_none_returns_empty():
    assert k8s._age(None) == ""


def test_age_seconds():
    ts = datetime.now(timezone.utc) - timedelta(seconds=30)
    assert k8s._age(ts).endswith("s")


def test_age_minutes():
    ts = datetime.now(timezone.utc) - timedelta(minutes=5)
    assert k8s._age(ts) == "5m"


def test_age_hours():
    ts = datetime.now(timezone.utc) - timedelta(hours=3)
    assert k8s._age(ts) == "3h"


def test_age_days():
    ts = datetime.now(timezone.utc) - timedelta(days=2)
    assert k8s._age(ts) == "2d"


def test_age_naive_datetime_is_handled():
    """Aceita timestamp sem timezone sem estourar."""
    ts = datetime.utcnow() - timedelta(hours=1)
    assert k8s._age(ts) == "1h"


# ── _health_score ─────────────────────────────────────────────────────────────

def test_health_score_all_healthy():
    score = k8s.K8sService._health_score(
        [{"ready": True}],
        [{"phase": "Running", "restarts": 0}],
    )
    assert score == 100


def test_health_score_node_not_ready_penalizes():
    # 1 de 2 nodes não-prontos = -20 (40% peso * 50%)
    score = k8s.K8sService._health_score(
        [{"ready": True}, {"ready": False}], []
    )
    assert score == 80


def test_health_score_crashloop_pod_penalizes():
    # 1 de 2 pods não-saudáveis = -30 (60% peso * 50%)
    score = k8s.K8sService._health_score(
        [],
        [{"phase": "Running", "restarts": 0},
         {"phase": "CrashLoopBackOff", "restarts": 9}],
    )
    assert score == 70


def test_health_score_high_restarts_counts_unhealthy():
    score = k8s.K8sService._health_score(
        [], [{"phase": "Running", "restarts": 7}]
    )
    assert score == 40  # 100 - 60


def test_health_score_never_negative():
    score = k8s.K8sService._health_score(
        [{"ready": False}],
        [{"phase": "Failed", "restarts": 0}],
    )
    assert score >= 0


def test_health_score_empty_inputs():
    assert k8s.K8sService._health_score([], []) == 100


# ── build_topology ────────────────────────────────────────────────────────────

def _service_with_stubbed_lists():
    """Cria um K8sService sem __init__ e injeta listagens fixas."""
    svc = k8s.K8sService.__new__(k8s.K8sService)
    svc.list_ingresses = lambda ns: {"ingresses": [
        {"name": "web", "rules": [
            {"host": "app.com", "paths": [{"path": "/", "backend": "web-svc:80"}]}
        ], "tls": []}
    ]}
    svc.list_services = lambda ns: {"services": [
        {"name": "web-svc", "type": "ClusterIP", "selector": {"app": "web"}}
    ]}
    svc.list_deployments = lambda ns: {"deployments": [
        {"name": "web", "ready_replicas": 2, "replicas": 2}
    ]}
    svc.list_pods = lambda ns: {"pods": [{"phase": "Running", "restarts": 0}]}
    return svc


def test_build_topology_success_and_nodes():
    svc = _service_with_stubbed_lists()
    topo = svc.build_topology("default")
    assert topo["success"] is True
    node_ids = {n["id"] for n in topo["nodes"]}
    assert {"ing/web", "svc/web-svc", "deploy/web"} <= node_ids


def test_build_topology_edges():
    svc = _service_with_stubbed_lists()
    topo = svc.build_topology("default")
    edges = {(e["from"], e["to"]) for e in topo["edges"]}
    assert ("ing/web", "svc/web-svc") in edges
    assert ("svc/web-svc", "deploy/web") in edges


def test_build_topology_counts():
    svc = _service_with_stubbed_lists()
    topo = svc.build_topology("default")
    assert topo["counts"] == {"ingresses": 1, "services": 1, "deployments": 1, "pods": 1}


# ── discover_aks ──────────────────────────────────────────────────────────────

def _install_fake_containerservice():
    """Injeta um mock do azure-mgmt-containerservice em sys.modules."""
    for mod in ("azure", "azure.mgmt"):
        if mod not in sys.modules:
            m = types.ModuleType(mod)
            m.__path__ = []
            sys.modules[mod] = m

    fake = types.ModuleType("azure.mgmt.containerservice")

    class _Pool:
        def __init__(self, count):
            self.count = count

    class _MC:
        id = ("/subscriptions/abc/resourceGroups/rg-prod/providers/"
              "Microsoft.ContainerService/managedClusters/aks-prod")
        name = "aks-prod"
        location = "brazilsouth"
        kubernetes_version = "1.29.2"
        fqdn = "aks-prod.hcp.brazilsouth.azmk8s.io"
        agent_pool_profiles = [_Pool(3), _Pool(2)]

    class _KC:
        value = (b"apiVersion: v1\nclusters:\n- cluster:\n"
                 b"    server: https://aks-prod:443\n  name: aks-prod\n"
                 b"contexts: []\nusers: []\n")

    class _Creds:
        kubeconfigs = [_KC()]

    class _Ops:
        def list(self):
            return [_MC()]

        def list_cluster_user_credentials(self, resource_group_name, resource_name):
            assert resource_group_name == "rg-prod" and resource_name == "aks-prod"
            return _Creds()

    class ContainerServiceClient:
        def __init__(self, cred, sub):
            self.managed_clusters = _Ops()

    fake.ContainerServiceClient = ContainerServiceClient
    sys.modules["azure.mgmt.containerservice"] = fake


class _FakeAzure:
    credential = object()
    subscription_id = "abc"


def test_discover_aks_parses_cluster():
    _install_fake_containerservice()
    from app.services import k8s_discovery
    res = k8s_discovery.discover_aks(_FakeAzure())
    assert len(res) == 1
    c = res[0]
    assert c["name"] == "aks-prod"
    assert c["source"] == "aks"
    assert c["region"] == "brazilsouth"
    assert c["distribution"] == "AKS"
    assert c["k8s_version"] == "1.29.2"
    assert c["node_count"] == 5  # 3 + 2
    assert "managedClusters/aks-prod" in c["provider_cluster_id"]


def test_discover_aks_extracts_kubeconfig():
    _install_fake_containerservice()
    from app.services import k8s_discovery
    res = k8s_discovery.discover_aks(_FakeAzure())
    kc = res[0]["kubeconfig"]
    assert isinstance(kc, dict)
    assert "clusters" in kc
    assert kc["clusters"][0]["cluster"]["server"] == "https://aks-prod:443"
