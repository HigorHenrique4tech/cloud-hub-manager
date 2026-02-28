import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.db_models import CloudAccount
from app.core.dependencies import require_permission
from app.core.auth_context import MemberContext
from app.database import get_db
from app.services.auth_service import decrypt_credential
from app.services.gcp_service import GCPService
from app.services.log_service import log_activity
from app.services.security_service import GCPSecurityScanner
from datetime import datetime

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/gcp",
    tags=["GCP (workspace)"],
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_gcp_service(account: CloudAccount) -> GCPService:
    data = decrypt_credential(account.encrypted_data)
    project_id = data.get("project_id", "")
    client_email = data.get("client_email", "")
    private_key = data.get("private_key", "")
    private_key_id = data.get("private_key_id", "")
    if not all([project_id, client_email, private_key, private_key_id]):
        raise HTTPException(status_code=400, detail="Credencial GCP incompleta nesta conta cloud.")
    return GCPService(
        project_id=project_id,
        client_email=client_email,
        private_key=private_key,
        private_key_id=private_key_id,
    )


def _get_gcp_account(member: MemberContext, db: Session) -> CloudAccount:
    account = (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.provider == "gcp",
            CloudAccount.is_active == True,
        )
        .order_by(CloudAccount.created_at.desc())
        .first()
    )
    if not account:
        raise HTTPException(status_code=400, detail="Nenhuma conta GCP configurada neste workspace.")
    return account


def _get_gcp_service(member: MemberContext, db: Session) -> GCPService:
    return _build_gcp_service(_get_gcp_account(member, db))


def _wrap(fn, *args, resource_type: str = "GCP", **kwargs):
    """Call a GCPService method and convert exceptions to HTTPException."""
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("GCP error in %s: %s", fn.__name__, exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Pydantic schemas (inline — GCP is lightweight) ───────────────────────────

class CreateBucketRequest(BaseModel):
    name: str
    location: str = "US"
    storage_class: str = "STANDARD"


class CreateNetworkRequest(BaseModel):
    name: str
    auto_create_subnetworks: bool = True


# ── Connection ────────────────────────────────────────────────────────────────

@ws_router.get("/test-connection")
def gcp_test_connection(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    buckets = _wrap(svc.list_buckets)
    return {"success": True, "project_id": svc.project_id, "bucket_count": len(buckets)}


# ── Overview ──────────────────────────────────────────────────────────────────

@ws_router.get("/overview")
def gcp_overview(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    try:
        instances = svc.list_instances()
        running = sum(1 for i in instances if i["status"] == "RUNNING")
    except Exception:
        instances = []
        running = 0
    try:
        buckets = svc.list_buckets()
    except Exception:
        buckets = []
    try:
        sql_instances = svc.list_sql_instances()
    except Exception:
        sql_instances = []
    try:
        networks = svc.list_networks()
    except Exception:
        networks = []
    try:
        functions = svc.list_functions()
    except Exception:
        functions = []

    return {
        "project_id": svc.project_id,
        "compute_instances": len(instances),
        "compute_running": running,
        "storage_buckets": len(buckets),
        "sql_instances": len(sql_instances),
        "networks": len(networks),
        "functions": len(functions),
    }


# ── Compute Engine ─────────────────────────────────────────────────────────────

@ws_router.get("/compute/instances")
def gcp_list_instances(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return _wrap(svc.list_instances)


@ws_router.post("/compute/instances/{zone}/{name}/start")
def gcp_start_instance(
    zone: str,
    name: str,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    _wrap(svc.start_instance, zone, name)
    log_activity(db, member.user, "gcp.compute.start", "Instance", name, {"zone": zone})
    return {"success": True, "instance": name, "zone": zone}


@ws_router.post("/compute/instances/{zone}/{name}/stop")
def gcp_stop_instance(
    zone: str,
    name: str,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    _wrap(svc.stop_instance, zone, name)
    log_activity(db, member.user, "gcp.compute.stop", "Instance", name, {"zone": zone})
    return {"success": True, "instance": name, "zone": zone}


@ws_router.delete("/compute/instances/{zone}/{name}")
def gcp_delete_instance(
    zone: str,
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    _wrap(svc.delete_instance, zone, name)
    log_activity(db, member.user, "gcp.compute.delete", "Instance", name, {"zone": zone})
    return {"success": True, "instance": name, "zone": zone}


@ws_router.get("/compute/zones")
def gcp_list_zones(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return _wrap(svc.list_zones)


@ws_router.get("/compute/machine-types")
def gcp_list_machine_types(
    zone: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return _wrap(svc.list_machine_types, zone)


# ── Cloud Storage ─────────────────────────────────────────────────────────────

@ws_router.get("/storage/buckets")
def gcp_list_buckets(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return _wrap(svc.list_buckets)


@ws_router.post("/storage/buckets")
def gcp_create_bucket(
    payload: CreateBucketRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    result = _wrap(svc.create_bucket, payload.name, payload.location, payload.storage_class)
    log_activity(db, member.user, "gcp.storage.create_bucket", "Bucket", payload.name, {})
    return result


@ws_router.delete("/storage/buckets/{name}")
def gcp_delete_bucket(
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    _wrap(svc.delete_bucket, name)
    log_activity(db, member.user, "gcp.storage.delete_bucket", "Bucket", name, {})
    return {"success": True, "bucket": name}


# ── Cloud SQL ─────────────────────────────────────────────────────────────────

@ws_router.get("/sql/instances")
def gcp_list_sql_instances(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return _wrap(svc.list_sql_instances)


@ws_router.delete("/sql/instances/{name}")
def gcp_delete_sql_instance(
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    _wrap(svc.delete_sql_instance, name)
    log_activity(db, member.user, "gcp.sql.delete", "CloudSQLInstance", name, {})
    return {"success": True, "instance": name}


# ── Cloud Functions ───────────────────────────────────────────────────────────

@ws_router.get("/functions")
def gcp_list_functions(
    region: str = Query("us-central1"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return _wrap(svc.list_functions, region)


@ws_router.delete("/functions/{region}/{name}")
def gcp_delete_function(
    region: str,
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    full_name = f"projects/{svc.project_id}/locations/{region}/functions/{name}"
    _wrap(svc.delete_function, full_name)
    log_activity(db, member.user, "gcp.functions.delete", "CloudFunction", name, {"region": region})
    return {"success": True, "function": name, "region": region}


# ── VPC Networks ──────────────────────────────────────────────────────────────

@ws_router.get("/networks")
def gcp_list_networks(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return _wrap(svc.list_networks)


@ws_router.post("/networks")
def gcp_create_network(
    payload: CreateNetworkRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    result = _wrap(svc.create_network, payload.name, payload.auto_create_subnetworks)
    log_activity(db, member.user, "gcp.network.create", "Network", payload.name, {})
    return result


@ws_router.delete("/networks/{name}")
def gcp_delete_network(
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    _wrap(svc.delete_network, name)
    log_activity(db, member.user, "gcp.network.delete", "Network", name, {})
    return {"success": True, "network": name}


# ── Security Scan ─────────────────────────────────────────────────────────────

@ws_router.get("/security/scan")
async def gcp_security_scan(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """
    Runs basic security checks on the configured GCP project:
    - GCS buckets with allUsers/allAuthenticatedUsers in IAM
    - Firewall rules allowing SSH/RDP from 0.0.0.0/0
    - Project-level IAM bindings with roles/owner for user accounts
    """
    account = _get_gcp_account(member, db)
    creds = decrypt_credential(account.encrypted_data)
    scanner = GCPSecurityScanner(
        project_id=creds.get("project_id", ""),
        client_email=creds.get("client_email", ""),
        private_key=creds.get("private_key", ""),
        private_key_id=creds.get("private_key_id", ""),
    )
    findings = scanner.scan_all()

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: order.get(f.get("severity", "low"), 3))

    return {
        "findings": findings,
        "total": len(findings),
        "scanned_at": datetime.utcnow().isoformat(),
        "provider": "gcp",
    }
