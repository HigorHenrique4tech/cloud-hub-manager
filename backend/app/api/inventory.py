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


def _extract_resource_group(resource_id: str) -> str:
    """Extract resource group name from an Azure resource ID."""
    if not resource_id:
        return ""
    parts = resource_id.split("/")
    for i, part in enumerate(parts):
        if part.lower() == "resourcegroups" and i + 1 < len(parts):
            return parts[i + 1]
    return ""


def _fetch_azure(account: CloudAccount) -> list:
    """Fetch ALL resources from an Azure subscription using the generic Resources API."""
    try:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.resource import ResourceManagementClient

        creds = decrypt_credential(account.encrypted_data)
        tenant_id = creds.get("tenant_id", "")
        client_id = creds.get("client_id", "")
        client_secret = creds.get("client_secret", "")
        subscription_id = creds.get("subscription_id", "")
        if not all([tenant_id, client_id, client_secret, subscription_id]):
            return []

        credential = ClientSecretCredential(tenant_id, client_id, client_secret)
        resource_client = ResourceManagementClient(credential, subscription_id)
        items = []

        try:
            for resource in resource_client.resources.list(expand="provisioningState,createdTime"):
                resource_id = resource.id or resource.name or ""
                resource_group = _extract_resource_group(resource_id)

                # Normalize resource type — e.g. "Microsoft.Compute/virtualMachines" → "virtualMachines"
                raw_type = resource.type or ""
                rtype = raw_type.split("/")[-1].lower() if "/" in raw_type else raw_type.lower()

                # Provisioning / power state
                status = "available"
                if hasattr(resource, "properties") and resource.properties:
                    ps = None
                    if isinstance(resource.properties, dict):
                        ps = resource.properties.get("provisioningState") or resource.properties.get("state")
                    else:
                        ps = getattr(resource.properties, "provisioning_state", None)
                    if ps:
                        status = ps.lower()

                # Creation time
                created_at = None
                if hasattr(resource, "created_time") and resource.created_time:
                    try:
                        created_at = resource.created_time.isoformat()
                    except Exception:
                        pass

                items.append({
                    "provider": "azure",
                    "resource_type": rtype,
                    "name": resource.name or "",
                    "resource_id": resource_id,
                    "resource_group": resource_group,
                    "status": status,
                    "region": resource.location or "",
                    "created_at": created_at,
                    "tags": dict(resource.tags or {}),
                    "cost_hint": (resource.sku.name if resource.sku else None),
                })
        except Exception as e:
            logger.warning("Azure resources.list() error: %s", e)

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
    refresh: bool = Query(False, description="Bypass cache and re-fetch from cloud providers"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List all cloud resources in this workspace (paginated)."""
    if refresh:
        # Invalidate cache for this workspace so _collect_all re-fetches
        key = _cache_key(member.workspace_id)
        with _inv_cache_lock:
            _inv_cache.pop(key, None)
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
    writer.writerow(["Provider", "Tipo", "Nome", "Grupo de Recurso", "ID", "Status", "Região", "Criado", "Tags", "Spec"])

    for item in items:
        tags_str = "; ".join(f"{k}={v}" for k, v in (item.get("tags") or {}).items())
        writer.writerow([
            item.get("provider", ""),
            item.get("resource_type", ""),
            item.get("name", ""),
            item.get("resource_group", ""),
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
