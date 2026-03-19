"""FinOps Summary / KPIs and Cost Trend endpoints."""
import logging
from datetime import datetime, timedelta

from fastapi import Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import (
    CloudAccount,
    FinOpsAction,
    FinOpsAnomaly,
    FinOpsRecommendation,
)
from app.services.auth_service import decrypt_credential

from . import ws_router
from ._helpers import (
    _get_cached_trend,
    _linear_forecast,
    _set_cached_trend,
)

logger = logging.getLogger(__name__)


# ── Summary / KPIs ────────────────────────────────────────────────────────────


@ws_router.get("/summary")
async def get_finops_summary(
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    """Return FinOps KPIs for the workspace."""
    ws_id = member.workspace_id

    pending_q = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.workspace_id == ws_id,
        FinOpsRecommendation.status == "pending",
    )
    applied_q = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.workspace_id == ws_id,
        FinOpsRecommendation.status == "applied",
    )
    dismissed_q = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.workspace_id == ws_id,
        FinOpsRecommendation.status == "dismissed",
    )

    pending_count  = pending_q.count()
    applied_count  = applied_q.count()
    dismissed_count = dismissed_q.count()
    total = pending_count + applied_count + dismissed_count

    potential_saving = db.query(
        func.sum(FinOpsRecommendation.estimated_saving_monthly)
    ).filter(
        FinOpsRecommendation.workspace_id == ws_id,
        FinOpsRecommendation.status == "pending",
    ).scalar() or 0.0

    # Savings realized from executed actions (last 30d)
    cutoff = datetime.utcnow() - timedelta(days=30)
    realized_saving = db.query(
        func.sum(FinOpsAction.estimated_saving)
    ).filter(
        FinOpsAction.workspace_id == ws_id,
        FinOpsAction.status == "executed",
        FinOpsAction.executed_at >= cutoff,
    ).scalar() or 0.0

    adoption_rate = (applied_count / total * 100) if total > 0 else 0.0

    # Top waste category
    top_cat_row = db.query(
        FinOpsRecommendation.recommendation_type,
        func.count(FinOpsRecommendation.id).label("cnt"),
    ).filter(
        FinOpsRecommendation.workspace_id == ws_id,
        FinOpsRecommendation.status == "pending",
    ).group_by(FinOpsRecommendation.recommendation_type).order_by(
        func.count(FinOpsRecommendation.id).desc()
    ).first()

    # Open anomalies
    anomaly_count = db.query(FinOpsAnomaly).filter(
        FinOpsAnomaly.workspace_id == ws_id,
        FinOpsAnomaly.status == "open",
    ).count()

    return {
        "potential_saving_monthly": round(potential_saving, 2),
        "realized_saving_30d": round(realized_saving, 2),
        "adoption_rate_pct": round(adoption_rate, 1),
        "recommendations": {
            "pending": pending_count,
            "applied": applied_count,
            "dismissed": dismissed_count,
            "total": total,
        },
        "top_waste_category": top_cat_row[0] if top_cat_row else None,
        "open_anomalies": anomaly_count,
    }


# ── Cost Trend ────────────────────────────────────────────────────────────────


@ws_router.get("/cost-trend")
async def get_cost_trend(
    days: int = Query(30, ge=7, le=90),
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    """
    Returns daily cost totals per provider for the last `days` days.
    Results are cached for 1 hour per workspace.
    GCP daily cost data is not available without BigQuery export — returns zeros.
    """
    from datetime import date, timedelta

    cache_key = f"trend:{member.workspace_id}:{days}"
    cached = _get_cached_trend(cache_key)
    if cached:
        return cached

    today  = date.today()
    labels = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    result = {
        "labels": labels,
        "aws":    [0.0] * days,
        "azure":  [0.0] * days,
        "gcp":    [0.0] * days,
    }

    # Build a date→index map for fast lookups
    date_idx = {d: i for i, d in enumerate(labels)}

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.is_active == True,
    ).all()

    for acct in accounts:
        creds = decrypt_credential(acct.encrypted_data)

        if acct.provider == "aws":
            try:
                import boto3
                session = boto3.Session(
                    aws_access_key_id=creds.get("access_key_id"),
                    aws_secret_access_key=creds.get("secret_access_key"),
                    region_name=creds.get("region", "us-east-1"),
                )
                ce = session.client("ce", region_name="us-east-1")
                start = (today - timedelta(days=days - 1)).isoformat()
                end   = today.isoformat()
                resp  = ce.get_cost_and_usage(
                    TimePeriod={"Start": start, "End": end},
                    Granularity="DAILY",
                    Metrics=["UnblendedCost"],
                )
                for period in resp.get("ResultsByTime", []):
                    day   = period["TimePeriod"]["Start"]
                    cost  = float(period["Total"]["UnblendedCost"]["Amount"])
                    if day in date_idx:
                        result["aws"][date_idx[day]] += cost
            except Exception as e:
                logger.warning(f"AWS daily cost trend error: {e}")

        elif acct.provider == "azure":
            try:
                from datetime import datetime as _dt
                from azure.identity import ClientSecretCredential
                from azure.mgmt.costmanagement import CostManagementClient
                from azure.mgmt.costmanagement.models import (
                    QueryDefinition, QueryDataset, QueryTimePeriod,
                    QueryAggregation,
                )
                credential = ClientSecretCredential(
                    tenant_id=creds.get("tenant_id"),
                    client_id=creds.get("client_id"),
                    client_secret=creds.get("client_secret"),
                )
                client    = CostManagementClient(credential)
                scope     = f"/subscriptions/{creds.get('subscription_id')}"
                start_dt  = today - timedelta(days=days - 1)
                query_res = client.query.usage(
                    scope=scope,
                    parameters=QueryDefinition(
                        type="ActualCost",
                        timeframe="Custom",
                        time_period=QueryTimePeriod(
                            from_property=_dt(start_dt.year, start_dt.month, start_dt.day),
                            to=_dt(today.year, today.month, today.day),
                        ),
                        dataset=QueryDataset(
                            granularity="Daily",
                            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
                        ),
                    ),
                )
                col_names = [c.name for c in query_res.columns]
                cost_idx  = next(i for i, c in enumerate(col_names) if "cost" in c.name.lower())
                date_col  = next(
                    (i for i, c in enumerate(col_names) if "date" in c.name.lower() or "usage" in c.name.lower()),
                    None,
                )
                if date_col is not None:
                    for row in query_res.rows:
                        raw_date = str(row[date_col])          # YYYYMMDD integer
                        if len(raw_date) == 8:
                            day = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
                        else:
                            day = raw_date[:10]
                        cost = float(row[cost_idx])
                        if day in date_idx:
                            result["azure"][date_idx[day]] += cost
            except Exception as e:
                logger.warning(f"Azure daily cost trend error: {e}")

        # GCP: no simple per-day billing API without BigQuery export.
        # Estimate daily cost from the sum of current_monthly_cost on active GCP recommendations.
        elif acct.provider == "gcp":
            try:
                from app.models.db_models import FinOpsRecommendation
                gcp_monthly = db.query(
                    __import__("sqlalchemy", fromlist=["func"]).func.sum(FinOpsRecommendation.current_monthly_cost)
                ).filter(
                    FinOpsRecommendation.workspace_id == member.workspace_id,
                    FinOpsRecommendation.provider == "gcp",
                    FinOpsRecommendation.status == "pending",
                    FinOpsRecommendation.current_monthly_cost.isnot(None),
                ).scalar() or 0.0
                if gcp_monthly > 0:
                    daily_est = round(gcp_monthly / 30, 4)
                    result["gcp"] = [daily_est] * days
            except Exception as e:
                logger.warning(f"GCP estimated cost from recommendations error: {e}")

    # Append 15-day linear forecast
    FORECAST_DAYS = 15
    result["forecast_labels"] = [(today + timedelta(days=i + 1)).isoformat() for i in range(FORECAST_DAYS)]
    result["aws_forecast"]    = _linear_forecast(result["aws"], FORECAST_DAYS)
    result["azure_forecast"]  = _linear_forecast(result["azure"], FORECAST_DAYS)
    result["gcp_forecast"]    = _linear_forecast(result["gcp"], FORECAST_DAYS)

    _set_cached_trend(cache_key, result)
    return result
