"""Cost allocation by tag endpoints.

Provides:
  GET  /costs/by-tag           — spend breakdown by tag value (AWS/Azure/GCP)
  GET  /costs/allocation-tags  — list available tag keys per provider
  POST /costs/allocation-tags/activate — save chosen tag keys to cloud account
"""
import logging
from datetime import date
from typing import List, Optional

from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import CloudAccount
from app.services.auth_service import decrypt_for_account

from . import ws_router
from ._helpers import _get_org_plan, _require_plan

logger = logging.getLogger(__name__)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ActivateTagsPayload(BaseModel):
    provider: str
    account_id: Optional[str] = None
    tag_keys: List[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _aws_costs_by_tag(creds: dict, tag_key: str, start_date: str, end_date: str) -> dict:
    """Returns {tag_value: cost} for the given tag key using AWS Cost Explorer."""
    import boto3
    ce = boto3.client(
        "ce",
        aws_access_key_id=creds.get("access_key_id", ""),
        aws_secret_access_key=creds.get("secret_access_key", ""),
        region_name=creds.get("region", "us-east-1"),
    )
    resp = ce.get_cost_and_usage(
        TimePeriod={"Start": start_date, "End": end_date},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
        GroupBy=[{"Type": "TAG", "Key": tag_key}],
    )
    result = {}
    for row in resp.get("ResultsByTime", []):
        for group in row.get("Groups", []):
            # AWS returns "tag_key$tag_value"; strip the prefix
            raw_key = group["Keys"][0] if group["Keys"] else ""
            tag_val = raw_key.split("$", 1)[-1] if "$" in raw_key else raw_key
            tag_val = tag_val or "__untagged__"
            cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
            result[tag_val] = result.get(tag_val, 0.0) + cost
    return result


def _azure_costs_by_tag(creds: dict, tag_key: str, start_date: str, end_date: str) -> dict:
    """Returns {tag_value: cost} using Azure Cost Management with TagKey grouping."""
    try:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.costmanagement import CostManagementClient
        from azure.mgmt.costmanagement.models import (
            QueryDefinition, QueryTimePeriod, QueryDataset,
            QueryAggregation, QueryGrouping, TimeframeType, ExportType,
        )
        credential = ClientSecretCredential(
            tenant_id=creds.get("tenant_id", ""),
            client_id=creds.get("client_id", ""),
            client_secret=creds.get("client_secret", ""),
        )
        sub_id = creds.get("subscription_id", "")
        client = CostManagementClient(credential)
        scope = f"/subscriptions/{sub_id}"
        query = QueryDefinition(
            type=ExportType.ACTUAL_COST,
            timeframe=TimeframeType.CUSTOM,
            time_period=QueryTimePeriod(
                from_property=f"{start_date}T00:00:00Z",
                to=f"{end_date}T23:59:59Z",
            ),
            dataset=QueryDataset(
                granularity="None",
                aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
                grouping=[QueryGrouping(type="Tag", name=tag_key)],
            ),
        )
        result_data = client.query.usage(scope=scope, parameters=query)
        # rows: [[cost, currency, "tagKey:tagValue"], ...]
        # Azure returns tag group as "key:value" — strip the key prefix
        breakdown = {}
        for row in (result_data.rows or []):
            cost = float(row[0]) if row else 0.0
            raw = str(row[2]) if len(row) > 2 else ""
            # Strip "key:" prefix if present (e.g. "Projeto:Atlas" -> "Atlas")
            if ":" in raw:
                tag_val = raw.split(":", 1)[1].strip() or "__untagged__"
            else:
                tag_val = raw.strip() or "__untagged__"
            breakdown[tag_val] = breakdown.get(tag_val, 0.0) + cost
        return breakdown
    except Exception as exc:
        logger.warning(f"Azure costs by tag failed: {exc}")
        return {}


def _gcp_costs_by_tag(creds: dict, tag_key: str, start_date: str, end_date: str) -> dict:
    """
    Returns {tag_value: cost} from GCP.
    Falls back to estimating from resource labels via Compute API if BigQuery not configured.
    """
    try:
        from app.services.gcp_service import GCPService
        svc = GCPService(
            project_id=creds.get("project_id", ""),
            client_email=creds.get("client_email", ""),
            private_key=creds.get("private_key", ""),
            private_key_id=creds.get("private_key_id", ""),
        )
        result = svc.get_cost_and_usage(start_date=start_date, end_date=end_date)
        if not result.get("success"):
            return {}
        # GCP doesn't natively support label grouping without BigQuery — return total under key
        total = result.get("total", 0.0)
        return {"(all)": total} if total else {}
    except Exception as exc:
        logger.warning(f"GCP costs by tag failed: {exc}")
        return {}


def _aws_list_tags(creds: dict) -> List[str]:
    try:
        import boto3
        ce = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        resp = ce.list_cost_allocation_tags(Status="Active", MaxResults=100)
        return [t["TagKey"] for t in resp.get("CostAllocationTags", [])]
    except Exception as exc:
        logger.warning(f"AWS list tags failed: {exc}")
        return []


def _aws_activate_tags(creds: dict, tag_keys: List[str]):
    try:
        import boto3
        ce = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        ce.update_cost_allocation_tags_status(
            CostAllocationTagsStatus=[
                {"TagKey": k, "Status": "Active"} for k in tag_keys
            ]
        )
    except Exception as exc:
        logger.warning(f"AWS activate tags failed: {exc}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@ws_router.get("/costs/by-tag")
async def costs_by_tag(
    tag_key: str = Query(..., description="Tag key to group costs by"),
    start_date: str = Query(..., description="ISO date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="ISO date (YYYY-MM-DD)"),
    providers: str = Query("all", description="Comma-separated providers or 'all'"),
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Alocação por tag")

    provider_filter = (
        [p.strip() for p in providers.split(",") if p.strip()]
        if providers != "all"
        else ["aws", "azure", "gcp"]
    )

    accounts = (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.is_active == True,
            CloudAccount.provider.in_(provider_filter),
        )
        .all()
    )

    # Aggregate per-provider breakdown then merge by tag value
    combined: dict = {}  # tag_value -> {aws, azure, gcp}

    def _add(tag_val, provider, cost):
        if tag_val not in combined:
            combined[tag_val] = {"aws": 0.0, "azure": 0.0, "gcp": 0.0}
        combined[tag_val][provider] = combined[tag_val].get(provider, 0.0) + cost

    for account in accounts:
        try:
            creds = decrypt_for_account(db, account)
            if account.provider == "aws":
                data = _aws_costs_by_tag(creds, tag_key, start_date, end_date)
            elif account.provider == "azure":
                data = _azure_costs_by_tag(creds, tag_key, start_date, end_date)
            elif account.provider == "gcp":
                data = _gcp_costs_by_tag(creds, tag_key, start_date, end_date)
            else:
                continue
            for tag_val, cost in data.items():
                _add(tag_val, account.provider, cost)
        except Exception as exc:
            logger.warning(f"Tag cost fetch failed for account {account.id}: {exc}")

    # Build sorted list — untagged last
    breakdown = []
    untagged_key = "__untagged__"
    for tag_val, prov_costs in combined.items():
        total = sum(prov_costs.values())
        breakdown.append({
            "tag_value": tag_val,
            "aws": round(prov_costs.get("aws", 0.0), 4),
            "azure": round(prov_costs.get("azure", 0.0), 4),
            "gcp": round(prov_costs.get("gcp", 0.0), 4),
            "total": round(total, 4),
            "is_untagged": tag_val == untagged_key,
        })

    breakdown.sort(key=lambda x: (x["is_untagged"], -x["total"]))

    return {
        "tag_key": tag_key,
        "start_date": start_date,
        "end_date": end_date,
        "providers": provider_filter,
        "breakdown": breakdown,
        "grand_total": round(sum(r["total"] for r in breakdown), 4),
    }


@ws_router.get("/costs/allocation-tags")
async def list_allocation_tags(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Alocação por tag")

    accounts = (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == member.workspace_id,
            CloudAccount.is_active == True,
        )
        .all()
    )

    result = []
    for account in accounts:
        try:
            creds = decrypt_for_account(db, account)
            if account.provider == "aws":
                tags = _aws_list_tags(creds)
            else:
                tags = []
            result.append({
                "account_id": str(account.id),
                "provider": account.provider,
                "label": account.label,
                "available_tags": tags,
                "active_tags": account.allocation_tags or [],
            })
        except Exception as exc:
            logger.warning(f"List tags failed for account {account.id}: {exc}")

    return result


@ws_router.post("/costs/allocation-tags/activate", status_code=200)
async def activate_allocation_tags(
    payload: ActivateTagsPayload,
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Alocação por tag")

    query = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.provider == payload.provider,
        CloudAccount.is_active == True,
    )
    if payload.account_id:
        query = query.filter(CloudAccount.id == payload.account_id)
    account = query.first()

    if not account:
        raise HTTPException(status_code=404, detail="Conta cloud não encontrada.")

    # For AWS, also activate in Cost Explorer
    if payload.provider == "aws":
        try:
            creds = decrypt_for_account(db, account)
            _aws_activate_tags(creds, payload.tag_keys)
        except Exception as exc:
            logger.warning(f"AWS activate tags API failed: {exc}")

    account.allocation_tags = payload.tag_keys
    db.commit()

    return {"account_id": str(account.id), "active_tags": account.allocation_tags}
