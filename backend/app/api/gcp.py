import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.db_models import CloudAccount
from app.core.dependencies import require_permission
from app.core.auth_context import MemberContext
from app.database import get_db
from app.services.auth_service import decrypt_credential, decrypt_for_account
from app.services.gcp_service import GCPService
from app.services.log_service import log_activity
from app.services.security_service import GCPSecurityScanner
from app.models.create_schemas import CreateGCPSubnetRequest, CreateGCPPeeringRequest
from app.core.cache import cache_get, cache_set, cache_delete
from datetime import datetime

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/gcp",
    tags=["GCP (workspace)"],
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_gcp_service(account: CloudAccount, db: Session) -> GCPService:
    data = decrypt_for_account(db, account)
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
    return _build_gcp_service(_get_gcp_account(member, db), db)


async def _run(fn, *args, **kwargs):
    """Run a synchronous GCP SDK call in a thread pool, freeing the event loop."""
    try:
        return await asyncio.to_thread(fn, *args, **kwargs)
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
async def gcp_test_connection(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    buckets = await _run(svc.list_buckets)
    return {"success": True, "project_id": svc.project_id, "bucket_count": len(buckets)}


# ── Overview ──────────────────────────────────────────────────────────────────

@ws_router.get("/overview")
async def gcp_overview(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cache_key = f"gcp:{member.workspace_id}:overview"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_gcp_service(member, db)
    try:
        instances = await _run(svc.list_instances)
        running = sum(1 for i in instances if i["status"] == "RUNNING")
    except Exception:
        instances = []
        running = 0
    try:
        buckets = await _run(svc.list_buckets)
    except Exception:
        buckets = []
    try:
        sql_instances = await _run(svc.list_sql_instances)
    except Exception:
        sql_instances = []
    try:
        networks = await _run(svc.list_networks)
    except Exception:
        networks = []
    try:
        functions = await _run(svc.list_functions)
    except Exception:
        functions = []

    result = {
        "project_id": svc.project_id,
        "compute_instances": len(instances),
        "compute_running": running,
        "storage_buckets": len(buckets),
        "sql_instances": len(sql_instances),
        "networks": len(networks),
        "functions": len(functions),
    }
    cache_set(cache_key, result, ttl=120)
    return result


# ── Compute Engine ─────────────────────────────────────────────────────────────

@ws_router.get("/compute/instances")
async def gcp_list_instances(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cache_key = f"gcp:{member.workspace_id}:compute"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_gcp_service(member, db)
    result = await _run(svc.list_instances)
    cache_set(cache_key, result, ttl=180)
    return result


@ws_router.post("/compute/instances/{zone}/{name}/start")
async def gcp_start_instance(
    zone: str,
    name: str,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    await _run(svc.start_instance, zone, name)
    cache_delete(f"gcp:{member.workspace_id}:compute")
    cache_delete(f"gcp:{member.workspace_id}:overview")
    log_activity(db, member.user, "gcp.compute.start", "Instance", name, {"zone": zone})
    from app.services.notification_channel_service import fire_event as _fire
    _fire(db, member.workspace_id, "resource.started", {
        "resource_name": name, "resource_type": "instance",
        "provider": "gcp", "action": "start", "zone": zone,
    })
    return {"success": True, "instance": name, "zone": zone}


@ws_router.post("/compute/instances/{zone}/{name}/stop")
async def gcp_stop_instance(
    zone: str,
    name: str,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    await _run(svc.stop_instance, zone, name)
    cache_delete(f"gcp:{member.workspace_id}:compute")
    cache_delete(f"gcp:{member.workspace_id}:overview")
    log_activity(db, member.user, "gcp.compute.stop", "Instance", name, {"zone": zone})
    from app.services.notification_channel_service import fire_event as _fire
    _fire(db, member.workspace_id, "resource.stopped", {
        "resource_name": name, "resource_type": "instance",
        "provider": "gcp", "action": "stop", "zone": zone,
    })
    return {"success": True, "instance": name, "zone": zone}


@ws_router.delete("/compute/instances/{zone}/{name}")
async def gcp_delete_instance(
    zone: str,
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    await _run(svc.delete_instance, zone, name)
    cache_delete(f"gcp:{member.workspace_id}:compute")
    cache_delete(f"gcp:{member.workspace_id}:overview")
    log_activity(db, member.user, "gcp.compute.delete", "Instance", name, {"zone": zone})
    return {"success": True, "instance": name, "zone": zone}


@ws_router.get("/compute/zones")
async def gcp_list_zones(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return await _run(svc.list_zones)


@ws_router.get("/compute/machine-types")
async def gcp_list_machine_types(
    zone: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return await _run(svc.list_machine_types, zone)


# ── Cloud Storage ─────────────────────────────────────────────────────────────

@ws_router.get("/storage/buckets")
async def gcp_list_buckets(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cache_key = f"gcp:{member.workspace_id}:storage"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_gcp_service(member, db)
    result = await _run(svc.list_buckets)
    cache_set(cache_key, result, ttl=300)
    return result


@ws_router.post("/storage/buckets")
async def gcp_create_bucket(
    payload: CreateBucketRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    result = await _run(svc.create_bucket, payload.name, payload.location, payload.storage_class)
    cache_delete(f"gcp:{member.workspace_id}:storage")
    cache_delete(f"gcp:{member.workspace_id}:overview")
    log_activity(db, member.user, "gcp.storage.create_bucket", "Bucket", payload.name, {})
    return result


@ws_router.delete("/storage/buckets/{name}")
async def gcp_delete_bucket(
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    await _run(svc.delete_bucket, name)
    cache_delete(f"gcp:{member.workspace_id}:storage")
    cache_delete(f"gcp:{member.workspace_id}:overview")
    log_activity(db, member.user, "gcp.storage.delete_bucket", "Bucket", name, {})
    return {"success": True, "bucket": name}


# ── Cloud SQL ─────────────────────────────────────────────────────────────────

@ws_router.get("/sql/instances")
async def gcp_list_sql_instances(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cache_key = f"gcp:{member.workspace_id}:sql"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_gcp_service(member, db)
    result = await _run(svc.list_sql_instances)
    cache_set(cache_key, result, ttl=180)
    return result


@ws_router.delete("/sql/instances/{name}")
async def gcp_delete_sql_instance(
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    await _run(svc.delete_sql_instance, name)
    cache_delete(f"gcp:{member.workspace_id}:sql")
    cache_delete(f"gcp:{member.workspace_id}:overview")
    log_activity(db, member.user, "gcp.sql.delete", "CloudSQLInstance", name, {})
    return {"success": True, "instance": name}


# ── Cloud Functions ───────────────────────────────────────────────────────────

@ws_router.get("/functions")
async def gcp_list_functions(
    region: str = Query("us-central1"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cache_key = f"gcp:{member.workspace_id}:functions:{region}"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_gcp_service(member, db)
    result = await _run(svc.list_functions, region)
    cache_set(cache_key, result, ttl=300)
    return result


@ws_router.delete("/functions/{region}/{name}")
async def gcp_delete_function(
    region: str,
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    full_name = f"projects/{svc.project_id}/locations/{region}/functions/{name}"
    await _run(svc.delete_function, full_name)
    cache_delete(f"gcp:{member.workspace_id}:functions:{region}")
    cache_delete(f"gcp:{member.workspace_id}:overview")
    log_activity(db, member.user, "gcp.functions.delete", "CloudFunction", name, {"region": region})
    return {"success": True, "function": name, "region": region}


# ── VPC Networks ──────────────────────────────────────────────────────────────

@ws_router.get("/networks")
async def gcp_list_networks(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cache_key = f"gcp:{member.workspace_id}:networks"
    if cached := cache_get(cache_key):
        return cached
    svc = _get_gcp_service(member, db)
    result = await _run(svc.list_networks)
    cache_set(cache_key, result, ttl=300)
    return result


@ws_router.post("/networks")
async def gcp_create_network(
    payload: CreateNetworkRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    result = await _run(svc.create_network, payload.name, payload.auto_create_subnetworks)
    cache_delete(f"gcp:{member.workspace_id}:networks")
    cache_delete(f"gcp:{member.workspace_id}:overview")
    log_activity(db, member.user, "gcp.network.create", "Network", payload.name, {})
    return result


@ws_router.delete("/networks/{name}")
async def gcp_delete_network(
    name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    await _run(svc.delete_network, name)
    cache_delete(f"gcp:{member.workspace_id}:networks")
    cache_delete(f"gcp:{member.workspace_id}:overview")
    log_activity(db, member.user, "gcp.network.delete", "Network", name, {})
    return {"success": True, "network": name}


@ws_router.get("/networks/{name}/detail")
async def gcp_get_network_detail(
    name: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return await _run(svc.get_network_detail, name)


# ── Network Subnets ──────────────────────────────────────────────────────

@ws_router.post("/networks/{name}/subnets")
async def gcp_create_subnet(
    name: str,
    payload: CreateGCPSubnetRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    result = await _run(svc.create_subnetwork, name, payload.name, payload.region, payload.ip_cidr_range)
    cache_delete(f"gcp:{member.workspace_id}:networks")
    log_activity(db, member.user, "gcp.subnet.create", "Subnet", payload.name, {"network": name, "region": payload.region})
    return {"success": True, **result}


@ws_router.delete("/networks/{network_name}/subnets/{region}/{subnet_name}")
async def gcp_delete_subnet(
    network_name: str,
    region: str,
    subnet_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    await _run(svc.delete_subnetwork, region, subnet_name)
    cache_delete(f"gcp:{member.workspace_id}:networks")
    log_activity(db, member.user, "gcp.subnet.delete", "Subnet", subnet_name, {"network": network_name, "region": region})
    return {"success": True, "subnet": subnet_name}


# ── Network Peerings ─────────────────────────────────────────────────────

@ws_router.post("/networks/{name}/peerings")
async def gcp_create_peering(
    name: str,
    payload: CreateGCPPeeringRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    result = await _run(svc.create_network_peering, name, payload.peering_name, payload.peer_network)
    cache_delete(f"gcp:{member.workspace_id}:networks")
    log_activity(db, member.user, "gcp.peering.create", "Peering", payload.peering_name, {"network": name, "peer": payload.peer_network})
    return {"success": True, **result}


@ws_router.delete("/networks/{network_name}/peerings/{peering_name}")
async def gcp_delete_peering(
    network_name: str,
    peering_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    await _run(svc.delete_network_peering, network_name, peering_name)
    cache_delete(f"gcp:{member.workspace_id}:networks")
    log_activity(db, member.user, "gcp.peering.delete", "Peering", peering_name, {"network": network_name})
    return {"success": True, "peering": peering_name}


@ws_router.get("/compute/regions")
async def gcp_list_regions(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    svc = _get_gcp_service(member, db)
    return await _run(svc.list_regions)


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
    creds = decrypt_for_account(db, account)
    scanner = GCPSecurityScanner(
        project_id=creds.get("project_id", ""),
        client_email=creds.get("client_email", ""),
        private_key=creds.get("private_key", ""),
        private_key_id=creds.get("private_key_id", ""),
    )
    findings = await _run(scanner.scan_all)

    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: order.get(f.get("severity", "low"), 3))

    return {
        "findings": findings,
        "total": len(findings),
        "scanned_at": datetime.utcnow().isoformat(),
        "provider": "gcp",
    }


# ── Costs ─────────────────────────────────────────────────────────────────────

@ws_router.get("/costs")
async def ws_get_gcp_costs(
    start_date: str = Query(...),
    end_date: str = Query(...),
    granularity: str = Query("DAILY"),
    member: MemberContext = Depends(require_permission("costs.view")),
    db: Session = Depends(get_db),
):
    """
    Returns estimated GCP costs for the given period.
    Costs are estimated from active resources (Compute, SQL, Functions).
    Results are marked `estimated: true`.
    """
    try:
        account = _get_gcp_account(member, db)
        svc = _build_gcp_service(account, db)
        result = await _run(svc.get_cost_and_usage, start_date, end_date)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Erro ao estimar custos GCP"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@ws_router.get("/costs/resources")
async def ws_get_gcp_cost_resources(
    service: str = Query(..., description="GCP service name (e.g. 'Compute Engine')"),
    start_date: str = Query(...),
    end_date: str = Query(...),
    member: MemberContext = Depends(require_permission("costs.view")),
    db: Session = Depends(get_db),
):
    """Returns estimated cost breakdown by resource for a GCP service."""
    try:
        account = _get_gcp_account(member, db)
        svc = _build_gcp_service(account, db)
        result = await _run(svc.get_cost_by_resource, service, start_date, end_date)
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Erro ao obter custos por recurso GCP"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@ws_router.get("/metrics")
async def ws_get_gcp_metrics(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Returns CPU metrics for running GCE instances (last 1 hour)."""
    try:
        account = _get_gcp_account(member, db)
        svc = _build_gcp_service(account, db)
        return await _run(svc.get_metrics)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Backup (Persistent Disk Snapshots) ────────────────────────────────────────

class CreateGCPSnapshotRequest(BaseModel):
    zone: str
    disk_name: str
    snapshot_name: str
    description: str = ""


@ws_router.get("/backups/snapshots")
async def ws_list_gcp_snapshots(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List persistent disk snapshots for this GCP project."""
    account = _get_gcp_account(member, db)
    svc = _build_gcp_service(account, db)
    try:
        from google.cloud import compute_v1

        def _fetch():
            client = compute_v1.SnapshotsClient(credentials=svc.credentials)
            snapshots = []
            for s in client.list(project=svc.project_id):
                snapshots.append({
                    "name": s.name,
                    "status": s.status,
                    "disk_size_gb": s.disk_size_gb,
                    "source_disk": s.source_disk or "",
                    "creation_timestamp": s.creation_timestamp,
                    "storage_bytes": s.storage_bytes,
                    "description": s.description or "",
                    "labels": dict(s.labels) if s.labels else {},
                })
            snapshots.sort(key=lambda x: x["creation_timestamp"] or "", reverse=True)
            return {"snapshots": snapshots}

        return await _run(_fetch)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/backups/snapshots")
async def ws_create_gcp_snapshot(
    body: CreateGCPSnapshotRequest,
    member: MemberContext = Depends(require_permission("resources.create")),
    db: Session = Depends(get_db),
):
    """Create a persistent disk snapshot."""
    account = _get_gcp_account(member, db)
    svc = _build_gcp_service(account, db)
    try:
        from google.cloud import compute_v1

        def _create():
            disks_client = compute_v1.DisksClient(credentials=svc.credentials)
            snapshot_resource = compute_v1.Snapshot(
                name=body.snapshot_name,
                description=body.description,
            )
            operation = disks_client.create_snapshot(
                project=svc.project_id,
                zone=body.zone,
                disk=body.disk_name,
                snapshot_resource=snapshot_resource,
            )
            operation.result()

        await _run(_create)
        log_activity(db, member.user, "backup.create", "GCP_SNAPSHOT",
                     resource_id=body.snapshot_name, resource_name=body.snapshot_name,
                     provider="gcp", organization_id=member.org_id, workspace_id=member.workspace_id)
        return {"name": body.snapshot_name, "status": "CREATING"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/backups/snapshots/{snapshot_name}")
async def ws_delete_gcp_snapshot(
    snapshot_name: str,
    member: MemberContext = Depends(require_permission("resources.delete")),
    db: Session = Depends(get_db),
):
    """Delete a persistent disk snapshot."""
    account = _get_gcp_account(member, db)
    svc = _build_gcp_service(account, db)
    try:
        from google.cloud import compute_v1

        def _delete():
            client = compute_v1.SnapshotsClient(credentials=svc.credentials)
            operation = client.delete(project=svc.project_id, snapshot=snapshot_name)
            operation.result()

        await _run(_delete)
        log_activity(db, member.user, "backup.delete", "GCP_SNAPSHOT",
                     resource_id=snapshot_name, resource_name=snapshot_name,
                     provider="gcp", organization_id=member.org_id, workspace_id=member.workspace_id)
        return {"deleted": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
