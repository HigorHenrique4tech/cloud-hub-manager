"""Kubernetes & Containers API (workspace-scoped, read-only MVP).

Conexão agentless: cada cluster guarda um kubeconfig cifrado (Fernet per-org).
Clusters entram por auto-descoberta das CloudAccounts (AKS) ou import manual.
"""
import asyncio
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import K8sCluster, CloudAccount
from app.services import AzureService
from app.services.auth_service import (
    decrypt_credential, decrypt_for_account,
    encrypt_for_org, get_or_create_org_key,
)
from app.services.k8s_service import K8sService
from app.services import k8s_discovery
from app.api.finops._helpers import _get_org_plan, _require_plan
from app.services.log_service import log_activity

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/k8s",
    tags=["Kubernetes (workspace)"],
)

K8S_MIN_PLAN = "enterprise"


# ── Schemas ───────────────────────────────────────────────────────────────────

class ImportKubeconfigRequest(BaseModel):
    name: str
    kubeconfig: Optional[dict] = None      # já parseado (JSON)
    kubeconfig_raw: Optional[str] = None   # YAML cru — parseado no backend


class ScaleRequest(BaseModel):
    replicas: int


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _run(fn, *args, _timeout=60, **kwargs):
    """Roda chamada síncrona do client K8s em thread pool com timeout."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(fn, *args, **kwargs), timeout=_timeout
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail=f"Operação Kubernetes expirou após {_timeout}s")


def _gate(member: MemberContext, db: Session):
    """Plan gate — Kubernetes é feature enterprise."""
    plan = _get_org_plan(member, db)
    _require_plan(plan, K8S_MIN_PLAN, "Kubernetes")


def _get_cluster_or_404(db: Session, member: MemberContext, cluster_id: str) -> K8sCluster:
    cluster = (
        db.query(K8sCluster)
        .filter(
            K8sCluster.id == cluster_id,
            K8sCluster.workspace_id == member.workspace_id,
            K8sCluster.is_active == True,
        )
        .first()
    )
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster Kubernetes não encontrado.")
    return cluster


def _build_k8s_service(db: Session, member: MemberContext, cluster: K8sCluster) -> K8sService:
    org_key = get_or_create_org_key(db, member.organization_id)
    data = decrypt_credential(cluster.encrypted_kubeconfig, org_key=org_key)

    # EKS: reconecta on-demand gerando um token STS fresco (não armazenado).
    if data.get("eks_ref"):
        ref = data["eks_ref"]
        if not cluster.cloud_account_id:
            raise HTTPException(status_code=400, detail="Cluster EKS sem conta AWS vinculada.")
        account = db.query(CloudAccount).filter(
            CloudAccount.id == cluster.cloud_account_id,
            CloudAccount.workspace_id == member.workspace_id,
        ).first()
        if not account:
            raise HTTPException(status_code=400, detail="Conta AWS do cluster EKS não encontrada.")
        from app.services import AWSService
        acc = decrypt_for_account(db, account)
        aws = AWSService(
            access_key=acc.get("access_key_id", ""),
            secret_key=acc.get("secret_access_key", ""),
            region=ref.get("region") or acc.get("region", "us-east-1"),
        )
        token = aws.get_eks_token(ref["cluster_name"])
        ca_pem = None
        if ref.get("ca"):
            import base64
            ca_pem = base64.b64decode(ref["ca"]).decode("utf-8")
        return K8sService(server=ref.get("endpoint"), token=token, ca_cert=ca_pem)

    if data.get("kubeconfig"):
        return K8sService(kubeconfig=data["kubeconfig"])
    return K8sService(
        server=data.get("server"), token=data.get("token"), ca_cert=data.get("ca"),
    )


def _cluster_to_dict(c: K8sCluster) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "source": c.source,
        "region": c.region,
        "distribution": c.distribution,
        "k8s_version": c.k8s_version,
        "endpoint": c.endpoint,
        "status": c.status,
        "node_count": c.node_count,
        "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


# ── Cluster registry ──────────────────────────────────────────────────────────

@ws_router.get("/clusters")
async def list_clusters(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    clusters = (
        db.query(K8sCluster)
        .filter(K8sCluster.workspace_id == member.workspace_id, K8sCluster.is_active == True)
        .order_by(K8sCluster.created_at.desc())
        .all()
    )
    return {"total": len(clusters), "clusters": [_cluster_to_dict(c) for c in clusters]}


@ws_router.post("/clusters", status_code=201)
async def import_cluster(
    body: ImportKubeconfigRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Importa um cluster a partir de um kubeconfig (dict)."""
    _gate(member, db)
    exists = db.query(K8sCluster).filter(
        K8sCluster.workspace_id == member.workspace_id,
        K8sCluster.name == body.name,
        K8sCluster.is_active == True,
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail="Já existe um cluster com esse nome.")

    kubeconfig = body.kubeconfig
    if not kubeconfig and body.kubeconfig_raw:
        try:
            import yaml
            kubeconfig = yaml.safe_load(body.kubeconfig_raw)
        except Exception:
            raise HTTPException(status_code=400, detail="kubeconfig inválido (YAML não pôde ser lido).")
    if not kubeconfig or not isinstance(kubeconfig, dict) or "clusters" not in kubeconfig:
        raise HTTPException(status_code=400, detail="kubeconfig inválido ou incompleto.")

    svc = K8sService(kubeconfig=kubeconfig)
    conn = await _run(svc.test_connection)

    enc = encrypt_for_org(db, member.organization_id, {"kubeconfig": kubeconfig})
    cluster = K8sCluster(
        id=uuid.uuid4(),
        workspace_id=member.workspace_id,
        name=body.name,
        source="manual",
        distribution="vanilla",
        k8s_version=conn.get("version") if conn.get("success") else None,
        encrypted_kubeconfig=enc,
        status="connected" if conn.get("success") else "unreachable",
        last_synced_at=datetime.utcnow() if conn.get("success") else None,
        created_by=member.user.id,
    )
    db.add(cluster)
    db.commit()
    db.refresh(cluster)
    log_activity(db, member.user, 'k8s.cluster.import', 'K8sCluster',
                 resource_name=body.name, organization_id=member.organization_id,
                 workspace_id=member.workspace_id)
    return _cluster_to_dict(cluster)


@ws_router.post("/clusters/discover")
async def discover_clusters(
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Auto-descobre clusters AKS (contas Azure) e EKS (contas AWS) e registra os novos."""
    _gate(member, db)

    # (discovered_dict, source_account) para cada cluster encontrado
    found: list[tuple[dict, CloudAccount]] = []

    # ── Azure / AKS ───────────────────────────────────────────────────────────
    azure_accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.provider == "azure",
        CloudAccount.is_active == True,
    ).all()
    for account in azure_accounts:
        data = decrypt_for_account(db, account)
        if not all([data.get("subscription_id"), data.get("tenant_id"),
                    data.get("client_id"), data.get("client_secret")]):
            continue
        azsvc = AzureService(
            subscription_id=data["subscription_id"], tenant_id=data["tenant_id"],
            client_id=data["client_id"], client_secret=data["client_secret"],
        )
        for d in await _run(k8s_discovery.discover_aks, azsvc, _timeout=120):
            found.append((d, account))

    # ── AWS / EKS ─────────────────────────────────────────────────────────────
    aws_accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.provider == "aws",
        CloudAccount.is_active == True,
    ).all()
    for account in aws_accounts:
        data = decrypt_for_account(db, account)
        if not data.get("access_key_id") or not data.get("secret_access_key"):
            continue
        from app.services import AWSService
        aws = AWSService(
            access_key=data["access_key_id"], secret_key=data["secret_access_key"],
            region=data.get("region", "us-east-1"),
        )
        for d in await _run(k8s_discovery.discover_eks, aws, _timeout=120):
            found.append((d, account))

    if not azure_accounts and not aws_accounts:
        raise HTTPException(status_code=400, detail="Nenhuma conta Azure ou AWS configurada neste workspace.")

    added, skipped, seen = [], [], set()
    for d, account in found:
        # Dedup dentro do próprio lote — múltiplas contas da mesma subscription
        # descobrem o mesmo cluster (viola uq_k8s_cluster_ws_name).
        if d["name"] in seen:
            skipped.append(d["name"])
            continue
        existing = db.query(K8sCluster).filter(
            K8sCluster.workspace_id == member.workspace_id,
            K8sCluster.name == d["name"],
            K8sCluster.is_active == True,
        ).first()
        # AKS precisa de kubeconfig; EKS precisa de eks_ref
        payload = None
        if d.get("kubeconfig"):
            payload = {"kubeconfig": d["kubeconfig"]}
        elif d.get("eks_ref"):
            payload = {"eks_ref": d["eks_ref"]}
        if existing or payload is None:
            skipped.append(d["name"])
            continue
        seen.add(d["name"])
        enc = encrypt_for_org(db, member.organization_id, payload)
        cluster = K8sCluster(
            id=uuid.uuid4(),
            workspace_id=member.workspace_id,
            name=d["name"],
            source=d["source"],
            cloud_account_id=account.id,
            provider_cluster_id=d.get("provider_cluster_id"),
            region=d.get("region"),
            distribution=d.get("distribution"),
            k8s_version=d.get("k8s_version"),
            endpoint=d.get("endpoint"),
            node_count=d.get("node_count"),
            encrypted_kubeconfig=enc,
            status="unknown",
            created_by=member.user.id,
        )
        db.add(cluster)
        added.append(d["name"])
    db.commit()
    return {"discovered": len(found), "added": added, "skipped": skipped}


@ws_router.post("/clusters/{cluster_id}/test")
async def test_cluster(
    cluster_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    result = await _run(svc.test_connection)
    cluster.status = "connected" if result.get("success") else "unreachable"
    cluster.last_synced_at = datetime.utcnow()
    if result.get("version"):
        cluster.k8s_version = result["version"]
    db.commit()
    return result


@ws_router.delete("/clusters/{cluster_id}", status_code=204)
async def delete_cluster(
    cluster_id: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    db.delete(cluster)
    db.commit()
    log_activity(db, member.user, 'k8s.cluster.delete', 'K8sCluster',
                 resource_name=cluster.name, organization_id=member.organization_id,
                 workspace_id=member.workspace_id)
    return None


# ── Read-only cluster data ────────────────────────────────────────────────────

@ws_router.get("/clusters/{cluster_id}/overview")
async def cluster_overview(
    cluster_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    return await _run(svc.get_overview)


@ws_router.get("/clusters/{cluster_id}/namespaces")
async def cluster_namespaces(
    cluster_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    return await _run(svc.list_namespaces)


@ws_router.get("/clusters/{cluster_id}/workloads")
async def cluster_workloads(
    cluster_id: str,
    namespace: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    pods, deps, svcs, jobs, cronjobs = await asyncio.gather(
        _run(svc.list_pods, namespace),
        _run(svc.list_deployments, namespace),
        _run(svc.list_services, namespace),
        _run(svc.list_jobs, namespace),
        _run(svc.list_cronjobs, namespace),
    )
    return {
        "pods": pods.get("pods", []),
        "deployments": deps.get("deployments", []),
        "services": svcs.get("services", []),
        "jobs": jobs.get("jobs", []),
        "cronjobs": cronjobs.get("cronjobs", []),
    }


@ws_router.get("/clusters/{cluster_id}/ingresses")
async def cluster_ingresses(
    cluster_id: str,
    namespace: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    return await _run(svc.list_ingresses, namespace)


@ws_router.get("/clusters/{cluster_id}/topology")
async def cluster_topology(
    cluster_id: str,
    namespace: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    return await _run(svc.build_topology, namespace)


@ws_router.get("/clusters/{cluster_id}/events")
async def cluster_events(
    cluster_id: str,
    namespace: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    return await _run(svc.list_events, namespace)


@ws_router.get("/clusters/{cluster_id}/nodes")
async def cluster_nodes(
    cluster_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    return await _run(svc.list_nodes)


@ws_router.get("/clusters/{cluster_id}/pods/{namespace}/{pod}/logs")
async def pod_logs(
    cluster_id: str,
    namespace: str,
    pod: str,
    container: Optional[str] = Query(None),
    tail: int = Query(500, le=5000),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    return await _run(svc.get_pod_logs, namespace, pod, container, tail)


@ws_router.get("/clusters/{cluster_id}/findings")
async def cluster_findings(
    cluster_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    return await _run(svc.get_findings)


# ── Ações de escrita (V1 — gate k8s.manage) ────────────────────────────────────

@ws_router.post("/clusters/{cluster_id}/deployments/{namespace}/{name}/scale")
async def scale_deployment(
    cluster_id: str,
    namespace: str,
    name: str,
    body: ScaleRequest,
    member: MemberContext = Depends(require_permission("k8s.manage")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    if body.replicas < 0 or body.replicas > 1000:
        raise HTTPException(status_code=400, detail="Número de réplicas inválido (0–1000).")
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    result = await _run(svc.scale_deployment, namespace, name, body.replicas)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Falha ao escalar deployment."))
    log_activity(db, member.user, 'k8s.scale', 'K8sDeployment',
                 resource_name=f"{namespace}/{name}",
                 detail=f"replicas={body.replicas} cluster={cluster.name}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/clusters/{cluster_id}/deployments/{namespace}/{name}/restart")
async def restart_deployment(
    cluster_id: str,
    namespace: str,
    name: str,
    member: MemberContext = Depends(require_permission("k8s.manage")),
    db: Session = Depends(get_db),
):
    _gate(member, db)
    cluster = _get_cluster_or_404(db, member, cluster_id)
    svc = _build_k8s_service(db, member, cluster)
    result = await _run(svc.restart_deployment, namespace, name)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Falha ao reiniciar deployment."))
    log_activity(db, member.user, 'k8s.restart', 'K8sDeployment',
                 resource_name=f"{namespace}/{name}",
                 detail=f"cluster={cluster.name}",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result
