"""Automatic cost alert evaluation engine.

Evaluates all active CostAlerts for a workspace, fires email + webhook + push
notification when a threshold is crossed. Respects 24-hour cooldown per alert.
"""
import logging
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import CloudAccount, CostAlert, AlertEvent, User
from app.services.log_service import log_activity

from . import ws_router
from ._helpers import (
    _fetch_provider_spend,
    _get_org_plan,
    _require_plan,
)

logger = logging.getLogger(__name__)

_ALERT_COOLDOWN = timedelta(hours=24)


def _evaluate_alerts(db: Session, workspace_id) -> list:
    """
    Core evaluation engine — call from endpoint or scheduler.
    Returns list of evaluated alert dicts.
    """
    from app.services.auth_service import decrypt_for_account
    from app.services.email_service import send_cost_alert_email
    from app.services.notification_channel_service import fire_event as _fire
    from app.services.notification_service import push_notification as _push
    from app.services.branding_service import get_branding_for_workspace as _gbw

    alerts = (
        db.query(CostAlert)
        .filter(
            CostAlert.workspace_id == workspace_id,
            CostAlert.is_active == True,
        )
        .all()
    )
    if not alerts:
        return []

    accounts = (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == workspace_id,
            CloudAccount.is_active == True,
        )
        .all()
    )

    _brand = _gbw(db, workspace_id)
    now = datetime.utcnow()

    # Cache spend per (provider, period) to avoid duplicate API calls
    _spend_cache: dict = {}

    def _get_spend(provider: str, period: str) -> float:
        key = (provider, period)
        if key in _spend_cache:
            return _spend_cache[key]
        total = 0.0
        for account in accounts:
            if account.provider != provider:
                continue
            try:
                creds = decrypt_for_account(db, account)
                spend = _fetch_provider_spend(account.provider, creds, period=period)
                if spend is not None:
                    total += spend
            except Exception as exc:
                logger.warning(f"spend fetch failed for account {account.id}: {exc}")
        _spend_cache[key] = total
        return total

    def _get_prev_spend(provider: str, period: str) -> float:
        """Fetch previous-period spend for percentage-type alerts."""
        prev_period = "prev_" + period
        key = (provider, prev_period)
        if key in _spend_cache:
            return _spend_cache[key]
        from datetime import date
        today = date.today()
        if period == "daily":
            from datetime import timedelta as td
            yesterday = today - td(days=1)
            prev_start = yesterday.isoformat()
            prev_end = yesterday.isoformat()
        else:  # monthly
            first_this = today.replace(day=1)
            from datetime import timedelta as td
            last_prev = first_this - td(days=1)
            prev_start = last_prev.replace(day=1).isoformat()
            prev_end = last_prev.isoformat()

        total = 0.0
        for account in accounts:
            if account.provider != provider:
                continue
            try:
                creds = decrypt_for_account(db, account)
                import boto3
                if provider == "aws":
                    ce = boto3.client(
                        "ce",
                        aws_access_key_id=creds.get("access_key_id", ""),
                        aws_secret_access_key=creds.get("secret_access_key", ""),
                        region_name=creds.get("region", "us-east-1"),
                    )
                    resp = ce.get_cost_and_usage(
                        TimePeriod={"Start": prev_start, "End": prev_end},
                        Granularity="MONTHLY" if period == "monthly" else "DAILY",
                        Metrics=["UnblendedCost"],
                    )
                    total += sum(
                        float(r["Total"]["UnblendedCost"]["Amount"])
                        for r in resp.get("ResultsByTime", [])
                    )
                elif provider == "azure":
                    from azure.identity import ClientSecretCredential
                    from azure.mgmt.costmanagement import CostManagementClient
                    from azure.mgmt.costmanagement.models import (
                        QueryDefinition, QueryTimePeriod, QueryDataset,
                        QueryAggregation, TimeframeType, ExportType,
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
                            from_property=f"{prev_start}T00:00:00Z",
                            to=f"{prev_end}T23:59:59Z",
                        ),
                        dataset=QueryDataset(
                            granularity="None",
                            aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
                        ),
                    )
                    result = client.query.usage(scope=scope, parameters=query)
                    rows = result.rows or []
                    total += float(rows[0][0]) if rows else 0.0
                elif provider == "gcp":
                    from app.services.gcp_service import GCPService
                    svc = GCPService(
                        project_id=creds.get("project_id", ""),
                        client_email=creds.get("client_email", ""),
                        private_key=creds.get("private_key", ""),
                        private_key_id=creds.get("private_key_id", ""),
                    )
                    result = svc.get_cost_and_usage(
                        start_date=prev_start,
                        end_date=prev_end,
                    )
                    total += result.get("total", 0.0) if result.get("success") else 0.0
            except Exception as exc:
                logger.warning(f"prev spend fetch failed for account {account.id}: {exc}")
        _spend_cache[key] = total
        return total

    results = []
    for alert in alerts:
        period = alert.period or "monthly"
        provider = alert.provider

        if provider == "all":
            providers_in_ws = {a.provider for a in accounts}
            current = sum(_get_spend(p, period) for p in providers_in_ws)
        else:
            current = _get_spend(provider, period)

        alert.last_evaluated_at = now
        triggered = False

        if alert.threshold_type == "fixed":
            triggered = current >= alert.threshold_value
        elif alert.threshold_type == "percentage":
            prev_provider = provider if provider != "all" else "all"
            if provider == "all":
                providers_in_ws = {a.provider for a in accounts}
                prev = sum(_get_prev_spend(p, period) for p in providers_in_ws)
            else:
                prev = _get_prev_spend(provider, period)
            if prev > 0:
                variation_pct = ((current - prev) / prev) * 100
                triggered = variation_pct >= alert.threshold_value
            else:
                triggered = False

        already_alerted = (
            alert.last_triggered_at is not None
            and (now - alert.last_triggered_at) < _ALERT_COOLDOWN
        )

        if triggered and not already_alerted:
            # Record event
            msg = _build_alert_message(alert, current)
            event = AlertEvent(
                alert_id=alert.id,
                workspace_id=workspace_id,
                triggered_at=now,
                current_value=current,
                threshold_value=alert.threshold_value,
                message=msg,
                notification_type="cost_alert",
                link_to="/costs",
            )
            db.add(event)

            # Email
            creator = db.query(User).filter(User.id == (alert.created_by or alert.user_id)).first()
            if creator:
                send_cost_alert_email(
                    to_email=creator.email,
                    user_name=creator.name or creator.email,
                    alert_name=alert.name,
                    provider=alert.provider,
                    service=alert.service,
                    current_value=current,
                    threshold_value=alert.threshold_value,
                    threshold_type=alert.threshold_type,
                    period=period,
                    branding=_brand,
                )

            # Webhook
            _fire(db, workspace_id, "alert.triggered", {
                "alert_id": str(alert.id),
                "alert_name": alert.name,
                "provider": alert.provider,
                "service": alert.service,
                "current_value": round(current, 4),
                "threshold_value": alert.threshold_value,
                "threshold_type": alert.threshold_type,
                "period": period,
            })

            # Push notification
            _push(db, workspace_id, "cost_alert", msg, "/costs")

            alert.last_triggered_at = now

        results.append(_alert_to_dict(alert, triggered=triggered, current_value=current))

    db.commit()
    for alert in alerts:
        db.refresh(alert)

    return results


def _build_alert_message(alert: CostAlert, current: float) -> str:
    if alert.threshold_type == "fixed":
        return (
            f"Alerta '{alert.name}': gasto atual ${current:,.2f} atingiu o limite "
            f"de ${alert.threshold_value:,.2f} ({alert.period})"
        )
    return (
        f"Alerta '{alert.name}': variação de {alert.threshold_value:.1f}% atingida. "
        f"Gasto atual: ${current:,.2f}"
    )


def _alert_to_dict(alert: CostAlert, triggered: bool = False, current_value: float = None) -> dict:
    return {
        "id": str(alert.id),
        "name": alert.name,
        "provider": alert.provider,
        "service": alert.service,
        "threshold_type": alert.threshold_type,
        "threshold_value": alert.threshold_value,
        "period": alert.period,
        "is_active": alert.is_active,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
        "last_evaluated_at": alert.last_evaluated_at.isoformat() if alert.last_evaluated_at else None,
        "last_triggered_at": alert.last_triggered_at.isoformat() if alert.last_triggered_at else None,
        "triggered": triggered,
        "current_value": current_value,
    }


# ── Endpoint ──────────────────────────────────────────────────────────────────


@ws_router.post("/alerts/evaluate", status_code=200)
async def evaluate_alerts(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """Manually trigger alert evaluation for all active alerts in this workspace."""
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Alertas automáticos")

    try:
        results = _evaluate_alerts(db, member.workspace_id)
    except Exception as exc:
        logger.error(f"evaluate_alerts failed for workspace {member.workspace_id}: {exc}")
        raise HTTPException(status_code=500, detail="Erro ao avaliar alertas.")

    return {"evaluated": len(results), "alerts": results}
