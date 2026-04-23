"""FinOps Anomaly Detection endpoints and helpers."""
import logging
import math
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import CloudAccount, FinOpsAnomaly
from app.services.auth_service import decrypt_credential, decrypt_for_account

from . import ws_router
from ._helpers import _anomaly_to_dict, _get_org_plan, _require_plan

logger = logging.getLogger(__name__)


# ── Anomaly Detection Helpers ─────────────────────────────────────────────────


def _fetch_service_costs_aws(ak: str, sk: str, days: int = 32) -> dict:
    """Returns {service_name: [cost_day_0, ..., cost_day_n]} for the last `days` days."""
    from datetime import date as _date, timedelta
    import boto3

    today = _date.today()
    labels = [(_date.today() - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    date_idx = {d: i for i, d in enumerate(labels)}
    service_costs: dict = {}
    try:
        ce = boto3.client(
            "ce",
            aws_access_key_id=ak,
            aws_secret_access_key=sk,
            region_name="us-east-1",
        )
        resp = ce.get_cost_and_usage(
            TimePeriod={
                "Start": (today - timedelta(days=days - 1)).isoformat(),
                "End": today.isoformat(),
            },
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )
        for period in resp.get("ResultsByTime", []):
            day = period["TimePeriod"]["Start"]
            if day not in date_idx:
                continue
            idx = date_idx[day]
            for group in period.get("Groups", []):
                svc = group["Keys"][0]
                cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
                if cost == 0.0:
                    continue
                if svc not in service_costs:
                    service_costs[svc] = [0.0] * days
                service_costs[svc][idx] += cost
    except Exception as exc:
        logger.warning(f"AWS service cost fetch (anomaly): {exc}")
    return service_costs


def _fetch_service_costs_azure(creds: dict, days: int = 32) -> dict:
    """Returns {service_name: [cost_day_0, ..., cost_day_n]} for the last `days` days."""
    from datetime import date as _date, timedelta, datetime as _dt
    today = _date.today()
    labels = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    date_idx = {d: i for i, d in enumerate(labels)}
    service_costs: dict = {}
    try:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.costmanagement import CostManagementClient
        from azure.mgmt.costmanagement.models import (
            QueryDefinition, QueryDataset, QueryTimePeriod,
            QueryAggregation, QueryGrouping,
        )
        credential = ClientSecretCredential(
            tenant_id=creds.get("tenant_id"),
            client_id=creds.get("client_id"),
            client_secret=creds.get("client_secret"),
        )
        client = CostManagementClient(credential)
        scope = f"/subscriptions/{creds.get('subscription_id')}"
        start = today - timedelta(days=days - 1)
        result = client.query.usage(
            scope=scope,
            parameters=QueryDefinition(
                type="ActualCost",
                timeframe="Custom",
                time_period=QueryTimePeriod(
                    from_property=_dt(start.year, start.month, start.day),
                    to=_dt(today.year, today.month, today.day),
                ),
                dataset=QueryDataset(
                    granularity="Daily",
                    aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")},
                    grouping=[QueryGrouping(type="Dimension", name="ServiceName")],
                ),
            ),
        )
        col_names = [c.name for c in result.columns]
        cost_idx = next((i for i, c in enumerate(col_names) if "cost" in c.name.lower()), None)
        date_col = next((i for i, c in enumerate(col_names) if "date" in c.name.lower() or "usage" in c.name.lower()), None)
        svc_col = next((i for i, c in enumerate(col_names) if "service" in c.name.lower()), None)
        if cost_idx is not None and date_col is not None and svc_col is not None:
            for row in result.rows:
                raw_date = str(row[date_col])
                day = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}" if len(raw_date) == 8 else raw_date[:10]
                svc = str(row[svc_col])
                cost = float(row[cost_idx])
                if cost == 0.0 or day not in date_idx:
                    continue
                idx = date_idx[day]
                if svc not in service_costs:
                    service_costs[svc] = [0.0] * days
                service_costs[svc][idx] += cost
    except Exception as exc:
        logger.warning(f"Azure service cost fetch (anomaly): {exc}")
    return service_costs


def detect_and_save_anomalies(workspace_id, db: Session) -> int:
    """
    Fetch per-service daily costs for all cloud accounts in a workspace,
    run statistical anomaly detection (3-sigma), and persist new FinOpsAnomaly rows.
    Deduplicates: skips if an open anomaly already exists for the same service.
    Returns count of new anomalies created.
    """
    from datetime import date as _date
    from app.services.finops_service import detect_cost_anomalies
    from app.services.notification_service import push_notification

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == workspace_id,
        CloudAccount.is_active == True,
        CloudAccount.provider.in_(["aws", "azure"]),
    ).all()

    DAYS = 32  # 30-day baseline + 2 detection days
    new_count = 0

    for acct in accounts:
        creds = decrypt_for_account(db, acct)

        if acct.provider == "aws":
            ak = creds.get("access_key_id", "")
            sk = creds.get("secret_access_key", "")
            if not ak or not sk:
                continue
            service_costs = _fetch_service_costs_aws(ak, sk, days=DAYS)
        else:  # azure
            service_costs = _fetch_service_costs_azure(creds, days=DAYS)

        for service_name, daily_costs in service_costs.items():
            result = detect_cost_anomalies(daily_costs, service_name, acct.provider)
            if not result:
                continue

            # Dedup: skip if an open anomaly already exists for this service
            already_open = db.query(FinOpsAnomaly).filter(
                FinOpsAnomaly.workspace_id == workspace_id,
                FinOpsAnomaly.provider == acct.provider,
                FinOpsAnomaly.service_name == service_name,
                FinOpsAnomaly.status == "open",
            ).first()
            if already_open:
                continue

            anomaly = FinOpsAnomaly(
                workspace_id=workspace_id,
                provider=acct.provider,
                service_name=service_name,
                detected_date=datetime.utcnow(),
                baseline_cost=result["baseline_cost"],
                actual_cost=result["actual_cost"],
                deviation_pct=result["deviation_pct"],
                status="open",
            )
            db.add(anomaly)
            new_count += 1

            push_notification(
                db, workspace_id, "anomaly",
                f"Anomalia detectada: {service_name} ({acct.provider.upper()}) "
                f"custou {result['deviation_pct']:.0f}% acima do normal.",
                "/finops",
            )

    if new_count > 0:
        db.commit()

    return new_count


def _run_anomaly_scan_bg(workspace_id) -> None:
    """Background task wrapper — opens its own DB session."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        count = detect_and_save_anomalies(workspace_id, db)
        logger.info(f"Anomaly scan done for workspace {workspace_id}: {count} new anomalies")
    except Exception as exc:
        logger.warning(f"Anomaly scan bg task failed: {exc}")
    finally:
        db.close()


# ── Anomaly endpoints ─────────────────────────────────────────────────────────


@ws_router.post("/anomalies/scan", status_code=202)
async def trigger_anomaly_scan(
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    """On-demand anomaly scan for the current workspace."""
    plan = _get_org_plan(member, db)
    _require_plan(plan, "standard", "Scan de anomalias")
    background_tasks.add_task(_run_anomaly_scan_bg, member.workspace_id)
    return {"message": "Scan de anomalias iniciado.", "status": "queued"}


@ws_router.get("/anomalies")
async def list_anomalies(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    provider: Optional[str] = Query(None, description="aws|azure|gcp"),
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "standard", "Detecção de anomalias")

    q = db.query(FinOpsAnomaly).filter(FinOpsAnomaly.workspace_id == member.workspace_id)
    if provider:
        q = q.filter(FinOpsAnomaly.provider == provider)
    total = q.count()
    anomalies = q.order_by(FinOpsAnomaly.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [_anomaly_to_dict(a) for a in anomalies],
        "total": total,
        "page": page,
        "pages": math.ceil(total / page_size) if total else 1,
        "page_size": page_size,
    }


@ws_router.post("/anomalies/{anomaly_id}/acknowledge", status_code=200)
async def acknowledge_anomaly(
    anomaly_id: UUID,
    member: MemberContext = Depends(require_permission("finops.recommend")),
    db: Session = Depends(get_db),
):
    anomaly = db.query(FinOpsAnomaly).filter(
        FinOpsAnomaly.id == anomaly_id,
        FinOpsAnomaly.workspace_id == member.workspace_id,
    ).first()
    if not anomaly:
        raise HTTPException(status_code=404, detail="Anomalia não encontrada.")
    anomaly.status = "acknowledged"
    db.commit()
    return _anomaly_to_dict(anomaly)
