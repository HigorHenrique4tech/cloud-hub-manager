"""
Shared helpers, dict converters, scanner builders, caching, and persist logic
for the FinOps API sub-modules.
"""
import json
import logging
import threading
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.db_models import (
    CloudAccount,
    FinOpsAction,
    FinOpsAnomaly,
    FinOpsBudget,
    FinOpsRecommendation,
    FinOpsScanSchedule,
    Organization,
    ReportSchedule,
)
from app.core.auth_context import MemberContext
from app.services.auth_service import decrypt_credential, decrypt_for_account
from app.services.finops_service import AWSFinOpsScanner, AzureFinOpsScanner, GCPFinOpsScanner

logger = logging.getLogger(__name__)

# ── In-memory scan job tracker ─────────────────────────────────────────────────
# { job_id: {"status": queued|running|done|error, "started_at": ..., "finished_at": ...,
#             "results": {...}, "error": str|None, "workspace_id": UUID} }
_scan_jobs: dict = {}
_scan_jobs_lock = threading.Lock()

_JOB_TTL_SECONDS = 3600  # purge finished jobs after 1 hour


def _purge_old_jobs():
    cutoff = datetime.utcnow().timestamp() - _JOB_TTL_SECONDS
    with _scan_jobs_lock:
        to_delete = [
            jid for jid, j in _scan_jobs.items()
            if j["status"] in ("done", "error")
            and (j.get("finished_at") or 0) < cutoff
        ]
        for jid in to_delete:
            del _scan_jobs[jid]


# ── In-memory spend cache (5-minute TTL) ──────────────────────────────────────
_spend_cache: dict = {}
_spend_cache_lock = threading.Lock()
_SPEND_CACHE_TTL = 300  # seconds


def _get_cached_spend(key: str):
    with _spend_cache_lock:
        entry = _spend_cache.get(key)
        if entry and entry[1] > datetime.utcnow().timestamp():
            return entry[0]
    return None


def _set_cached_spend(key: str, value):
    with _spend_cache_lock:
        _spend_cache[key] = (value, datetime.utcnow().timestamp() + _SPEND_CACHE_TTL)


# ── In-memory cost-trend cache (1-hour TTL) ───────────────────────────────────
_trend_cache: dict = {}
_trend_cache_lock = threading.Lock()
_TREND_CACHE_TTL = 3600  # seconds


def _get_cached_trend(key: str):
    with _trend_cache_lock:
        entry = _trend_cache.get(key)
        if entry and entry[1] > datetime.utcnow().timestamp():
            return entry[0]
    return None


def _set_cached_trend(key: str, value):
    with _trend_cache_lock:
        _trend_cache[key] = (value, datetime.utcnow().timestamp() + _TREND_CACHE_TTL)


# ── Dict converters ───────────────────────────────────────────────────────────


def _rec_to_dict(r: FinOpsRecommendation) -> dict:
    return {
        "id": str(r.id),
        "workspace_id": str(r.workspace_id),
        "cloud_account_id": str(r.cloud_account_id) if r.cloud_account_id else None,
        "provider": r.provider,
        "resource_id": r.resource_id,
        "resource_name": r.resource_name,
        "resource_type": r.resource_type,
        "region": r.region,
        "recommendation_type": r.recommendation_type,
        "severity": r.severity,
        "estimated_saving_monthly": r.estimated_saving_monthly,
        "current_monthly_cost": r.current_monthly_cost,
        "reasoning": r.reasoning,
        "current_spec": r.current_spec,
        "recommended_spec": r.recommended_spec,
        "status": r.status,
        "detected_at": r.detected_at.isoformat() if r.detected_at else None,
        "applied_at": r.applied_at.isoformat() if r.applied_at else None,
        "applied_by": str(r.applied_by) if r.applied_by else None,
    }


def _action_to_dict(a: FinOpsAction) -> dict:
    return {
        "id": str(a.id),
        "workspace_id": str(a.workspace_id),
        "recommendation_id": str(a.recommendation_id) if a.recommendation_id else None,
        "action_type": a.action_type,
        "provider": a.provider,
        "resource_id": a.resource_id,
        "resource_name": a.resource_name,
        "resource_type": a.resource_type,
        "estimated_saving": a.estimated_saving,
        "status": a.status,
        "executed_at": a.executed_at.isoformat() if a.executed_at else None,
        "executed_by": str(a.executed_by) if a.executed_by else None,
        "rollback_data": a.rollback_data,
        "error_message": a.error_message,
        # can_rollback: 24h window
        "can_rollback": (
            a.status == "executed"
            and a.rollback_data is not None
            and (datetime.utcnow() - a.executed_at) < timedelta(hours=24)
        ) if a.executed_at else False,
    }


def _budget_to_dict(b: FinOpsBudget) -> dict:
    last_spend = b.last_spend
    pct = round(last_spend / b.amount, 4) if last_spend is not None and b.amount else 0.0
    return {
        "id": str(b.id),
        "workspace_id": str(b.workspace_id),
        "name": b.name,
        "provider": b.provider,
        "amount": b.amount,
        "period": b.period,
        "start_date": b.start_date.isoformat() if b.start_date else None,
        "alert_threshold": b.alert_threshold,
        "is_active": b.is_active,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "last_spend": last_spend,
        "last_evaluated_at": b.last_evaluated_at.isoformat() if b.last_evaluated_at else None,
        "pct": pct,
        "breakdown": json.loads(b.spend_breakdown) if b.spend_breakdown else None,
    }


def _anomaly_to_dict(a: FinOpsAnomaly) -> dict:
    return {
        "id": str(a.id),
        "workspace_id": str(a.workspace_id),
        "provider": a.provider,
        "service_name": a.service_name,
        "detected_date": a.detected_date.isoformat() if a.detected_date else None,
        "baseline_cost": a.baseline_cost,
        "actual_cost": a.actual_cost,
        "deviation_pct": a.deviation_pct,
        "status": a.status,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _scan_schedule_to_dict(s: FinOpsScanSchedule, next_run: Optional[str] = None) -> dict:
    return {
        "id": str(s.id),
        "workspace_id": str(s.workspace_id),
        "is_enabled": s.is_enabled,
        "schedule_type": s.schedule_type,
        "schedule_time": s.schedule_time,
        "timezone": s.timezone,
        "provider": s.provider,
        "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
        "last_run_status": s.last_run_status,
        "last_run_error": s.last_run_error,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "next_run_at": next_run,
    }


def _report_schedule_to_dict(s: ReportSchedule, next_run: Optional[str] = None) -> dict:
    return {
        "id": str(s.id),
        "workspace_id": str(s.workspace_id),
        "name": s.name,
        "schedule_type": s.schedule_type,
        "send_day": s.send_day,
        "send_time": s.send_time,
        "timezone": s.timezone,
        "recipients": s.recipients or [],
        "include_budgets": s.include_budgets,
        "include_finops": s.include_finops,
        "include_costs": s.include_costs,
        "is_enabled": s.is_enabled,
        "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
        "last_run_status": s.last_run_status,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "next_run_at": next_run,
    }


# ── Plan helpers ──────────────────────────────────────────────────────────────


def _get_org_plan(member: MemberContext, db: Session) -> str:
    """Returns the org's plan_tier (free | pro | enterprise)."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    return (org.plan_tier if org and org.plan_tier else "free").lower()


def _require_plan(plan: str, minimum: str, feature: str):
    """Raises 403 if plan doesn't meet the minimum."""
    order = {"free": 0, "pro": 1, "enterprise": 2}
    if order.get(plan, 0) < order.get(minimum, 0):
        raise HTTPException(
            status_code=403,
            detail=f"Recurso '{feature}' requer plano {minimum.capitalize()} ou superior."
        )


# ── Scanner builders ──────────────────────────────────────────────────────────


def _get_aws_scanner(workspace_id, db: Session,
                     account_id: Optional[str] = None) -> Optional[AWSFinOpsScanner]:
    q = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == workspace_id,
        CloudAccount.provider == "aws",
        CloudAccount.is_active == True,
    )
    if account_id:
        q = q.filter(CloudAccount.id == account_id)
    account = q.order_by(CloudAccount.created_at.desc()).first()
    if not account:
        return None
    data = decrypt_for_account(db, account)
    access_key = data.get("access_key_id", "")
    secret_key = data.get("secret_access_key", "")
    region = data.get("region", "us-east-1")
    if not access_key or not secret_key:
        return None
    scanner = AWSFinOpsScanner(access_key=access_key, secret_key=secret_key, region=region)
    scanner._account_id = account.id  # stash for DB writes
    return scanner


def _get_azure_scanner(workspace_id, db: Session,
                       account_id: Optional[str] = None) -> Optional[AzureFinOpsScanner]:
    q = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == workspace_id,
        CloudAccount.provider == "azure",
        CloudAccount.is_active == True,
    )
    if account_id:
        q = q.filter(CloudAccount.id == account_id)
    account = q.order_by(CloudAccount.created_at.desc()).first()
    if not account:
        return None
    data = decrypt_for_account(db, account)
    sub_id   = data.get("subscription_id", "")
    tenant   = data.get("tenant_id", "")
    client   = data.get("client_id", "")
    secret   = data.get("client_secret", "")
    if not all([sub_id, tenant, client, secret]):
        return None
    scanner = AzureFinOpsScanner(
        subscription_id=sub_id, tenant_id=tenant,
        client_id=client, client_secret=secret,
    )
    scanner._account_id = account.id
    return scanner


def _get_gcp_scanner(workspace_id, db: Session,
                     account_id: Optional[str] = None) -> Optional[GCPFinOpsScanner]:
    q = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == workspace_id,
        CloudAccount.provider == "gcp",
        CloudAccount.is_active == True,
    )
    if account_id:
        q = q.filter(CloudAccount.id == account_id)
    account = q.order_by(CloudAccount.created_at.desc()).first()
    if not account:
        return None
    data = decrypt_for_account(db, account)
    project_id    = data.get("project_id", "")
    client_email  = data.get("client_email", "")
    private_key   = data.get("private_key", "")
    private_key_id = data.get("private_key_id", "")
    if not all([project_id, client_email, private_key]):
        return None
    scanner = GCPFinOpsScanner(
        project_id=project_id,
        client_email=client_email,
        private_key=private_key,
        private_key_id=private_key_id,
    )
    scanner._account_id = account.id
    return scanner


# ── Persist findings ──────────────────────────────────────────────────────────


def _persist_findings(findings: List[dict], workspace_id, cloud_account_id, db: Session):
    """Upsert findings into FinOpsRecommendation (dedup by resource_id + type)."""
    count = 0
    for f in findings:
        existing = db.query(FinOpsRecommendation).filter(
            FinOpsRecommendation.workspace_id == workspace_id,
            FinOpsRecommendation.resource_id == f["resource_id"],
            FinOpsRecommendation.recommendation_type == f["recommendation_type"],
            FinOpsRecommendation.status == "pending",
        ).first()

        if existing:
            # update the numbers
            existing.estimated_saving_monthly = f.get("estimated_saving_monthly", 0)
            existing.current_monthly_cost = f.get("current_monthly_cost", 0)
            existing.reasoning = f.get("reasoning", existing.reasoning)
            existing.detected_at = datetime.utcnow()
        else:
            rec = FinOpsRecommendation(
                workspace_id=workspace_id,
                cloud_account_id=cloud_account_id,
                provider=f.get("provider", "unknown"),
                resource_id=f.get("resource_id", ""),
                resource_name=f.get("resource_name", ""),
                resource_type=f.get("resource_type", ""),
                region=f.get("region"),
                recommendation_type=f.get("recommendation_type", "delete"),
                severity=f.get("severity", "medium"),
                estimated_saving_monthly=f.get("estimated_saving_monthly", 0),
                current_monthly_cost=f.get("current_monthly_cost", 0),
                reasoning=f.get("reasoning", ""),
                current_spec=f.get("current_spec"),
                recommended_spec=f.get("recommended_spec"),
                status="pending",
            )
            db.add(rec)
            count += 1
    db.commit()
    return count


# ── Linear forecast ───────────────────────────────────────────────────────────


def _linear_forecast(values: list, forecast_days: int = 15) -> list:
    """Pure-Python least-squares linear forecast (no scipy/numpy needed)."""
    n = len(values)
    if sum(1 for v in values if v > 0) < 5 or n < 5:
        return [0.0] * forecast_days
    x_mean = (n - 1) / 2.0
    y_mean = sum(values) / n
    denom = sum((i - x_mean) ** 2 for i in range(n))
    if denom == 0:
        return [round(values[-1], 4)] * forecast_days
    slope = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values)) / denom
    intercept = y_mean - slope * x_mean
    return [max(0.0, round(intercept + slope * (n + i), 4)) for i in range(forecast_days)]


# ── Fetch provider spend ─────────────────────────────────────────────────────


def _fetch_provider_spend(provider: str, creds: dict) -> Optional[float]:
    """Fetch current MTD spend for a given provider using stored credentials (5-min cache)."""
    cache_key = f"{provider}:{creds.get('access_key_id') or creds.get('tenant_id', '')}:{creds.get('subscription_id', '')}"
    cached = _get_cached_spend(cache_key)
    if cached is not None:
        return cached

    try:
        spend: Optional[float] = None
        if provider == "aws":
            import boto3
            from datetime import date

            client = boto3.client(
                "ce",
                aws_access_key_id=creds.get("access_key_id", ""),
                aws_secret_access_key=creds.get("secret_access_key", ""),
                region_name=creds.get("region", "us-east-1"),
            )
            today = date.today()
            resp = client.get_cost_and_usage(
                TimePeriod={
                    "Start": today.replace(day=1).isoformat(),
                    "End": today.isoformat(),
                },
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
            )
            spend = sum(
                float(r["Total"]["UnblendedCost"]["Amount"])
                for r in resp.get("ResultsByTime", [])
            )

        elif provider == "azure":
            from azure.identity import ClientSecretCredential
            from azure.mgmt.costmanagement import CostManagementClient
            from azure.mgmt.costmanagement.models import (
                QueryDefinition, QueryTimePeriod, QueryDataset, QueryAggregation,
                TimeframeType, ExportType,
            )
            from datetime import date

            credential = ClientSecretCredential(
                tenant_id=creds.get("tenant_id", ""),
                client_id=creds.get("client_id", ""),
                client_secret=creds.get("client_secret", ""),
            )
            sub_id = creds.get("subscription_id", "")
            client = CostManagementClient(credential)
            today = date.today()
            scope = f"/subscriptions/{sub_id}"
            query = QueryDefinition(
                type=ExportType.ACTUAL_COST,
                timeframe=TimeframeType.CUSTOM,
                time_period=QueryTimePeriod(
                    from_property=f"{today.replace(day=1).isoformat()}T00:00:00Z",
                    to=f"{today.isoformat()}T23:59:59Z",
                ),
                dataset=QueryDataset(
                    granularity="None",
                    aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
                ),
            )
            result = client.query.usage(scope=scope, parameters=query)
            rows = result.rows or []
            spend = float(rows[0][0]) if rows else 0.0

        elif provider == "gcp":
            from app.services.gcp_service import GCPService
            from datetime import date
            svc = GCPService(
                project_id=creds.get("project_id", ""),
                client_email=creds.get("client_email", ""),
                private_key=creds.get("private_key", ""),
                private_key_id=creds.get("private_key_id", ""),
            )
            today = date.today()
            result = svc.get_cost_and_usage(
                start_date=today.replace(day=1).isoformat(),
                end_date=today.isoformat(),
            )
            spend = result.get("total") if result.get("success") else None

        if spend is not None:
            _set_cached_spend(cache_key, spend)
        return spend

    except Exception as exc:
        logger.warning(f"_fetch_provider_spend({provider}) failed: {exc}")
    return None
