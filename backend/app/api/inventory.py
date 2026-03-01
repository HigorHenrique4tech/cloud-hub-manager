"""
Inventory API — aggregates all cloud resources across AWS, Azure, and GCP
for a given workspace into a single paginated list with CSV export.
"""
import csv
import io
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from threading import Lock
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.core.config import settings
from app.database import get_db
from app.models.db_models import CloudAccount
from app.services.auth_service import decrypt_credential

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/inventory",
    tags=["Inventory (workspace)"],
)

# ── In-memory cache (5 min TTL) ───────────────────────────────────────────────

_inv_cache: dict = {}
_inv_cache_lock = Lock()
_INV_CACHE_TTL = 300  # seconds


def _cache_key(workspace_id) -> str:
    return f"inv:{workspace_id}"


def _get_cached(workspace_id):
    key = _cache_key(workspace_id)
    with _inv_cache_lock:
        entry = _inv_cache.get(key)
    if entry and (time.time() - entry["ts"]) < _INV_CACHE_TTL:
        return entry["data"]
    return None


def _set_cached(workspace_id, data):
    key = _cache_key(workspace_id)
    with _inv_cache_lock:
        _inv_cache[key] = {"ts": time.time(), "data": data}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_accounts(db: Session, workspace_id, provider: Optional[str] = None):
    q = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == workspace_id,
        CloudAccount.is_active == True,
    )
    if provider:
        q = q.filter(CloudAccount.provider == provider)
    return q.all()


def _fetch_aws(account: CloudAccount) -> list:
    try:
        import boto3
        creds = decrypt_credential(account.encrypted_data)
        ak = creds.get("access_key_id", "")
        sk = creds.get("secret_access_key", "")
        default_region = creds.get("region", getattr(settings, "AWS_DEFAULT_REGION", "us-east-1"))
        if not ak or not sk:
            return []

        # Discover all opted-in regions
        def get_regions() -> list:
            try:
                ec2 = boto3.client("ec2", aws_access_key_id=ak, aws_secret_access_key=sk, region_name="us-east-1")
                resp = ec2.describe_regions(Filters=[
                    {"Name": "opt-in-status", "Values": ["opted-in", "opt-in-not-required"]}
                ])
                return [r["RegionName"] for r in resp.get("Regions", [])][:15]
            except Exception:
                return [default_region]

        regions = get_regions()
        items = []

        # S3 is global — fetch once
        try:
            s3 = boto3.client("s3", aws_access_key_id=ak, aws_secret_access_key=sk)
            buckets = s3.list_buckets().get("Buckets", [])
            for b in buckets:
                items.append({
                    "provider": "aws", "resource_type": "s3",
                    "name": b["Name"], "resource_id": b["Name"],
                    "status": "available", "region": "global",
                    "created_at": b.get("CreationDate", "").isoformat() if b.get("CreationDate") else None,
                    "tags": {}, "cost_hint": None,
                })
        except Exception as e:
            logger.warning("AWS S3 inventory error: %s", e)

        # Per-region fetch helper
        def fetch_region(region: str) -> list:
            region_items = []
            # EC2
            try:
                ec2 = boto3.client("ec2", aws_access_key_id=ak, aws_secret_access_key=sk, region_name=region)
                resp = ec2.describe_instances()
                for res in resp.get("Reservations", []):
                    for inst in res.get("Instances", []):
                        name = next((t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), inst["InstanceId"])
                        region_items.append({
                            "provider": "aws", "resource_type": "ec2",
                            "name": name, "resource_id": inst["InstanceId"],
                            "status": inst.get("State", {}).get("Name", ""),
                            "region": region,
                            "created_at": inst.get("LaunchTime", "").isoformat() if inst.get("LaunchTime") else None,
                            "tags": {t["Key"]: t["Value"] for t in inst.get("Tags", [])},
                            "cost_hint": inst.get("InstanceType"),
                        })
            except Exception as e:
                logger.warning("AWS EC2 inventory error (region=%s): %s", region, e)
            # RDS
            try:
                rds = boto3.client("rds", aws_access_key_id=ak, aws_secret_access_key=sk, region_name=region)
                for db_inst in rds.describe_db_instances().get("DBInstances", []):
                    region_items.append({
                        "provider": "aws", "resource_type": "rds",
                        "name": db_inst.get("DBInstanceIdentifier", ""),
                        "resource_id": db_inst.get("DBInstanceIdentifier", ""),
                        "status": db_inst.get("DBInstanceStatus", ""),
                        "region": region,
                        "created_at": db_inst.get("InstanceCreateTime", "").isoformat() if db_inst.get("InstanceCreateTime") else None,
                        "tags": {t["Key"]: t["Value"] for t in db_inst.get("TagList", [])},
                        "cost_hint": db_inst.get("DBInstanceClass"),
                    })
            except Exception as e:
                logger.warning("AWS RDS inventory error (region=%s): %s", region, e)
            # Lambda
            try:
                lmb = boto3.client("lambda", aws_access_key_id=ak, aws_secret_access_key=sk, region_name=region)
                for fn in lmb.list_functions().get("Functions", []):
                    region_items.append({
                        "provider": "aws", "resource_type": "lambda",
                        "name": fn.get("FunctionName", ""),
                        "resource_id": fn.get("FunctionArn", ""),
                        "status": fn.get("State", "active"),
                        "region": region,
                        "created_at": fn.get("LastModified"),
                        "tags": fn.get("Tags") or {},
                        "cost_hint": fn.get("Runtime"),
                    })
            except Exception as e:
                logger.warning("AWS Lambda inventory error (region=%s): %s", region, e)
            return region_items

        with ThreadPoolExecutor(max_workers=5) as ex:
            futures = {ex.submit(fetch_region, r): r for r in regions}
            for future in as_completed(futures):
                try:
                    items.extend(future.result())
                except Exception as e:
                    logger.warning("AWS region fetch failed (%s): %s", futures[future], e)

        return items
    except Exception as e:
        logger.warning("AWS inventory fetch failed: %s", e)
        return []


def _fetch_azure(account: CloudAccount) -> list:
    try:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.compute import ComputeManagementClient
        from azure.mgmt.storage import StorageManagementClient
        from azure.mgmt.sql import SqlManagementClient
        from azure.mgmt.web import WebSiteManagementClient

        creds = decrypt_credential(account.encrypted_data)
        tenant_id = creds.get("tenant_id", "")
        client_id = creds.get("client_id", "")
        client_secret = creds.get("client_secret", "")
        subscription_id = creds.get("subscription_id", "")
        if not all([tenant_id, client_id, client_secret, subscription_id]):
            return []

        credential = ClientSecretCredential(tenant_id, client_id, client_secret)
        items = []

        # VMs
        try:
            compute = ComputeManagementClient(credential, subscription_id)
            for vm in compute.virtual_machines.list_all():
                loc = vm.location or ""
                items.append({
                    "provider": "azure", "resource_type": "vm",
                    "name": vm.name, "resource_id": vm.id or vm.name,
                    "status": "running", "region": loc,
                    "created_at": None,
                    "tags": dict(vm.tags or {}),
                    "cost_hint": (vm.hardware_profile.vm_size if vm.hardware_profile else None),
                })
        except Exception as e:
            logger.warning("Azure VM inventory error: %s", e)

        # Storage
        try:
            storage = StorageManagementClient(credential, subscription_id)
            for acc in storage.storage_accounts.list():
                items.append({
                    "provider": "azure", "resource_type": "storage",
                    "name": acc.name, "resource_id": acc.id or acc.name,
                    "status": acc.status_of_primary or "available",
                    "region": acc.location or "",
                    "created_at": acc.creation_time.isoformat() if acc.creation_time else None,
                    "tags": dict(acc.tags or {}),
                    "cost_hint": (acc.sku.name if acc.sku else None),
                })
        except Exception as e:
            logger.warning("Azure Storage inventory error: %s", e)

        # SQL
        try:
            sql = SqlManagementClient(credential, subscription_id)
            for srv in sql.servers.list():
                items.append({
                    "provider": "azure", "resource_type": "database",
                    "name": srv.name, "resource_id": srv.id or srv.name,
                    "status": srv.state or "ready",
                    "region": srv.location or "",
                    "created_at": None,
                    "tags": dict(srv.tags or {}),
                    "cost_hint": None,
                })
        except Exception as e:
            logger.warning("Azure SQL inventory error: %s", e)

        # App Services
        try:
            web = WebSiteManagementClient(credential, subscription_id)
            for app in web.web_apps.list():
                items.append({
                    "provider": "azure", "resource_type": "appservice",
                    "name": app.name, "resource_id": app.id or app.name,
                    "status": app.state or "running",
                    "region": app.location or "",
                    "created_at": None,
                    "tags": dict(app.tags or {}),
                    "cost_hint": None,
                })
        except Exception as e:
            logger.warning("Azure App Services inventory error: %s", e)

        return items
    except Exception as e:
        logger.warning("Azure inventory fetch failed: %s", e)
        return []


def _fetch_gcp(account: CloudAccount) -> list:
    try:
        from app.services.gcp_service import GCPService
        creds = decrypt_credential(account.encrypted_data)
        project_id = creds.get("project_id", "")
        client_email = creds.get("client_email", "")
        private_key = creds.get("private_key", "")
        private_key_id = creds.get("private_key_id", "")
        if not all([project_id, client_email, private_key, private_key_id]):
            return []

        svc = GCPService(
            project_id=project_id,
            client_email=client_email,
            private_key=private_key,
            private_key_id=private_key_id,
        )
        items = []

        # Compute
        try:
            for inst in svc.list_instances():
                items.append({
                    "provider": "gcp", "resource_type": "compute",
                    "name": inst.get("name", ""),
                    "resource_id": inst.get("id") or inst.get("name", ""),
                    "status": inst.get("status", "").lower(),
                    "region": inst.get("zone", "").split("/")[-1] if inst.get("zone") else "",
                    "created_at": inst.get("creationTimestamp"),
                    "tags": inst.get("labels") or {},
                    "cost_hint": inst.get("machineType", "").split("/")[-1],
                })
        except Exception as e:
            logger.warning("GCP Compute inventory error: %s", e)

        # Storage
        try:
            for b in svc.list_buckets():
                items.append({
                    "provider": "gcp", "resource_type": "bucket",
                    "name": b.get("name", ""),
                    "resource_id": b.get("id") or b.get("name", ""),
                    "status": "available",
                    "region": b.get("location", "").lower(),
                    "created_at": b.get("timeCreated"),
                    "tags": b.get("labels") or {},
                    "cost_hint": b.get("storageClass"),
                })
        except Exception as e:
            logger.warning("GCP Storage inventory error: %s", e)

        # Cloud SQL
        try:
            for inst in svc.list_sql_instances():
                items.append({
                    "provider": "gcp", "resource_type": "sql",
                    "name": inst.get("name", ""),
                    "resource_id": inst.get("name", ""),
                    "status": inst.get("state", "").lower(),
                    "region": inst.get("region", ""),
                    "created_at": inst.get("createTime"),
                    "tags": inst.get("userLabels") or {},
                    "cost_hint": inst.get("settings", {}).get("tier"),
                })
        except Exception as e:
            logger.warning("GCP SQL inventory error: %s", e)

        # Cloud Functions
        try:
            for fn in svc.list_functions():
                items.append({
                    "provider": "gcp", "resource_type": "function",
                    "name": fn.get("name", "").split("/")[-1],
                    "resource_id": fn.get("name", ""),
                    "status": fn.get("status", "").lower(),
                    "region": fn.get("region", ""),
                    "created_at": fn.get("updateTime"),
                    "tags": fn.get("labels") or {},
                    "cost_hint": fn.get("runtime"),
                })
        except Exception as e:
            logger.warning("GCP Functions inventory error: %s", e)

        return items
    except Exception as e:
        logger.warning("GCP inventory fetch failed: %s", e)
        return []


def _collect_all(db: Session, workspace_id, provider_filter: str = "all") -> list:
    cached = _get_cached(workspace_id)
    if cached is not None and provider_filter == "all":
        return cached

    accounts = _get_accounts(db, workspace_id)
    items = []

    for account in accounts:
        p = account.provider
        if provider_filter not in ("all", p):
            continue
        if p == "aws":
            items.extend(_fetch_aws(account))
        elif p == "azure":
            items.extend(_fetch_azure(account))
        elif p == "gcp":
            items.extend(_fetch_gcp(account))

    if provider_filter == "all":
        _set_cached(workspace_id, items)

    return items


# ── Endpoints ─────────────────────────────────────────────────────────────────

@ws_router.get("")
async def list_inventory(
    provider: str = Query("all"),
    resource_type: str = Query("all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List all cloud resources in this workspace (paginated)."""
    items = _collect_all(db, member.workspace_id, provider)

    # Filter by resource type
    if resource_type != "all":
        items = [i for i in items if i["resource_type"] == resource_type]

    # Filter by provider (when cache was all)
    if provider != "all":
        items = [i for i in items if i["provider"] == provider]

    total = len(items)
    pages = max(1, (total + page_size - 1) // page_size)
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "items": items[start:end],
        "total": total,
        "page": page,
        "pages": pages,
        "page_size": page_size,
        "fetched_at": datetime.utcnow().isoformat(),
    }


@ws_router.get("/export")
async def export_inventory(
    provider: str = Query("all"),
    resource_type: str = Query("all"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Export all cloud resources as CSV download."""
    items = _collect_all(db, member.workspace_id, provider)

    if resource_type != "all":
        items = [i for i in items if i["resource_type"] == resource_type]
    if provider != "all":
        items = [i for i in items if i["provider"] == provider]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Provider", "Tipo", "Nome", "ID", "Status", "Região", "Criado", "Tags", "Spec"])

    for item in items:
        tags_str = "; ".join(f"{k}={v}" for k, v in (item.get("tags") or {}).items())
        writer.writerow([
            item.get("provider", ""),
            item.get("resource_type", ""),
            item.get("name", ""),
            item.get("resource_id", ""),
            item.get("status", ""),
            item.get("region", ""),
            item.get("created_at", ""),
            tags_str,
            item.get("cost_hint", ""),
        ])

    output.seek(0)
    filename = f"inventory_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
