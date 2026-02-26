"""
FinOps REST API — waste detection, recommendations, budgets, and actions.

Routes are workspace-scoped (org_slug + workspace_id in the path).
"""
import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import (
    CloudAccount,
    FinOpsAction,
    FinOpsAnomaly,
    FinOpsBudget,
    FinOpsRecommendation,
    FinOpsScanSchedule,
    Organization,
    ReportSchedule,
    ScheduledAction,
    Workspace,
)
from app.services.auth_service import decrypt_credential
from app.services.finops_service import AWSFinOpsScanner, AzureFinOpsScanner
from app.services.log_service import log_activity

logger = logging.getLogger(__name__)

# ── Schemas ───────────────────────────────────────────────────────────────────


class BudgetCreate(BaseModel):
    name: str
    provider: str = "all"          # aws | azure | all
    amount: float
    period: str = "monthly"        # monthly | quarterly | annual
    alert_threshold: float = 0.8   # 0.0–1.0


class BudgetUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    alert_threshold: Optional[float] = None
    is_active: Optional[bool] = None


class DismissRequest(BaseModel):
    reason: Optional[str] = None


class ReportScheduleUpsert(BaseModel):
    name: str
    schedule_type: str              # weekly | monthly
    send_day: int                   # 0-6 (mon=0) for weekly; 1-28 for monthly
    send_time: str                  # HH:MM
    timezone: str = "America/Sao_Paulo"
    recipients: List[str] = []     # list of email addresses
    include_budgets: bool = True
    include_finops: bool = True
    include_costs: bool = True
    is_enabled: bool = True


# ── Helpers ───────────────────────────────────────────────────────────────────


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


def _get_aws_scanner(member: MemberContext, db: Session,
                     account_id: Optional[str] = None) -> Optional[AWSFinOpsScanner]:
    q = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.provider == "aws",
        CloudAccount.is_active == True,
    )
    if account_id:
        q = q.filter(CloudAccount.id == account_id)
    account = q.order_by(CloudAccount.created_at.desc()).first()
    if not account:
        return None
    data = decrypt_credential(account.encrypted_data)
    access_key = data.get("access_key_id", "")
    secret_key = data.get("secret_access_key", "")
    region = data.get("region", "us-east-1")
    if not access_key or not secret_key:
        return None
    scanner = AWSFinOpsScanner(access_key=access_key, secret_key=secret_key, region=region)
    scanner._account_id = account.id  # stash for DB writes
    return scanner


def _get_azure_scanner(member: MemberContext, db: Session,
                       account_id: Optional[str] = None) -> Optional[AzureFinOpsScanner]:
    q = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.provider == "azure",
        CloudAccount.is_active == True,
    )
    if account_id:
        q = q.filter(CloudAccount.id == account_id)
    account = q.order_by(CloudAccount.created_at.desc()).first()
    if not account:
        return None
    data = decrypt_credential(account.encrypted_data)
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


# ── Apply helpers (AWS) ────────────────────────────────────────────────────────


def _apply_aws(rec: FinOpsRecommendation, scanner: AWSFinOpsScanner) -> dict:
    """
    Execute the AWS action for a recommendation.
    Returns rollback_data dict (can be empty if non-reversible).
    """
    ec2 = scanner._client("ec2")
    rtype = rec.recommendation_type
    rrestype = rec.resource_type

    if rrestype == "ebs" and rtype == "delete":
        ec2.delete_volume(VolumeId=rec.resource_id)
        return {}  # non-reversible

    elif rrestype == "elastic_ip" and rtype == "delete":
        allocation_id = (rec.current_spec or {}).get("allocation_id", "")
        if allocation_id:
            ec2.release_address(AllocationId=allocation_id)
        else:
            ec2.release_address(PublicIp=rec.resource_id)
        return {}

    elif rrestype == "snapshot" and rtype == "delete":
        ec2.delete_snapshot(SnapshotId=rec.resource_id)
        return {}

    elif rrestype == "ec2" and rtype in ("stop", "right_size"):
        if rtype == "stop":
            ec2.stop_instances(InstanceIds=[rec.resource_id])
            return {"action": "start", "instance_ids": [rec.resource_id]}
        else:
            # right_size: change instance type (requires stop first)
            rec_spec = rec.recommended_spec or {}
            new_type = rec_spec.get("instance_type")
            if not new_type:
                raise HTTPException(status_code=400, detail="Tipo de instância recomendado não definido.")
            current_spec = rec.current_spec or {}
            old_type = current_spec.get("instance_type", "unknown")
            # stop → change → start
            ec2.stop_instances(InstanceIds=[rec.resource_id])
            import time; time.sleep(15)
            ec2.modify_instance_attribute(
                InstanceId=rec.resource_id,
                InstanceType={"Value": new_type},
            )
            ec2.start_instances(InstanceIds=[rec.resource_id])
            return {"action": "restore_type", "instance_id": rec.resource_id, "original_type": old_type}

    elif rrestype == "rds" and rtype == "stop":
        rds = scanner._client("rds")
        rds.stop_db_instance(DBInstanceIdentifier=rec.resource_id)
        return {"action": "start_rds", "db_id": rec.resource_id}

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Ação '{rtype}' para recurso '{rrestype}' não suportada ainda."
        )


def _rollback_aws(action: FinOpsAction, scanner: AWSFinOpsScanner):
    data = action.rollback_data or {}
    ec2 = scanner._client("ec2")
    act = data.get("action", "")

    if act == "start":
        ec2.start_instances(InstanceIds=data.get("instance_ids", []))
    elif act == "restore_type":
        ec2.stop_instances(InstanceIds=[data["instance_id"]])
        import time; time.sleep(15)
        ec2.modify_instance_attribute(
            InstanceId=data["instance_id"],
            InstanceType={"Value": data["original_type"]},
        )
        ec2.start_instances(InstanceIds=[data["instance_id"]])
    elif act == "start_rds":
        rds = scanner._client("rds")
        rds.start_db_instance(DBInstanceIdentifier=data["db_id"])
    else:
        raise HTTPException(status_code=400, detail="Rollback não disponível para esta ação.")


def _apply_azure(rec: FinOpsRecommendation, scanner: AzureFinOpsScanner) -> dict:
    rtype = rec.recommendation_type
    rrestype = rec.resource_type
    spec = rec.current_spec or {}

    compute = scanner._compute()
    network = scanner._network()

    if rrestype == "managed_disk" and rtype == "delete":
        rg = spec.get("resource_group", "")
        compute.disks.begin_delete(rg, rec.resource_name).result()
        return {}

    elif rrestype == "public_ip" and rtype == "delete":
        rg = spec.get("resource_group", "")
        network.public_ip_addresses.begin_delete(rg, rec.resource_name).result()
        return {}

    elif rrestype == "vm" and rtype in ("stop", "right_size"):
        rg = spec.get("resource_group", "")
        if rtype == "stop":
            compute.virtual_machines.begin_deallocate(rg, rec.resource_name).result()
            return {"action": "start_vm", "resource_group": rg, "vm_name": rec.resource_name}
        else:
            rec_spec = rec.recommended_spec or {}
            new_size = rec_spec.get("vm_size")
            if not new_size:
                raise HTTPException(status_code=400, detail="Tamanho de VM recomendado não definido.")
            old_size = spec.get("vm_size", "unknown")
            from azure.mgmt.compute.models import HardwareProfile
            vm_obj = compute.virtual_machines.get(rg, rec.resource_name)
            vm_obj.hardware_profile = HardwareProfile(vm_size=new_size)
            compute.virtual_machines.begin_create_or_update(rg, rec.resource_name, vm_obj).result()
            return {"action": "restore_vm_size", "resource_group": rg, "vm_name": rec.resource_name, "original_size": old_size}
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Ação '{rtype}' para recurso '{rrestype}' não suportada ainda."
        )


def _rollback_azure(action: FinOpsAction, scanner: AzureFinOpsScanner):
    data = action.rollback_data or {}
    act = data.get("action", "")
    compute = scanner._compute()

    if act == "start_vm":
        compute.virtual_machines.begin_start(data["resource_group"], data["vm_name"]).result()
    elif act == "restore_vm_size":
        from azure.mgmt.compute.models import HardwareProfile
        rg, name = data["resource_group"], data["vm_name"]
        vm_obj = compute.virtual_machines.get(rg, name)
        vm_obj.hardware_profile = HardwareProfile(vm_size=data["original_size"])
        compute.virtual_machines.begin_create_or_update(rg, name, vm_obj).result()
    else:
        raise HTTPException(status_code=400, detail="Rollback não disponível para esta ação.")


# ═══════════════════════════════════════════════════════════════════════════════
# Router
# ═══════════════════════════════════════════════════════════════════════════════

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/finops",
    tags=["FinOps (workspace)"],
)


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


# ── Recommendations ───────────────────────────────────────────────────────────


@ws_router.get("/recommendations")
async def list_recommendations(
    status: Optional[str] = Query(None, description="pending|applied|dismissed|failed"),
    provider: Optional[str] = Query(None, description="aws|azure"),
    severity: Optional[str] = Query(None),
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)

    q = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.workspace_id == member.workspace_id,
    )
    if status:
        q = q.filter(FinOpsRecommendation.status == status)
    if provider:
        q = q.filter(FinOpsRecommendation.provider == provider)
    if severity:
        q = q.filter(FinOpsRecommendation.severity == severity)

    q = q.order_by(FinOpsRecommendation.estimated_saving_monthly.desc())
    recs = q.all()

    data = [_rec_to_dict(r) for r in recs]

    # Plan gate: free plan sees top 3 only
    if plan == "free" and (not status or status == "pending"):
        for i, item in enumerate(data):
            if i >= 3:
                item["_locked"] = True
                item["reasoning"] = ""
                item["current_spec"] = None
                item["recommended_spec"] = None

    return data


@ws_router.post("/recommendations/{rec_id}/apply", status_code=200)
async def apply_recommendation(
    rec_id: UUID,
    member: MemberContext = Depends(require_permission("finops.execute")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Aplicar recomendações")

    rec = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.id == rec_id,
        FinOpsRecommendation.workspace_id == member.workspace_id,
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recomendação não encontrada.")
    if rec.status != "pending":
        raise HTTPException(status_code=400, detail=f"Status atual é '{rec.status}', não pode ser aplicada.")

    # Handle schedule type separately (no cloud API call needed — just create ScheduledActions)
    if rec.recommendation_type == "schedule":
        from app.services.scheduler_service import register_schedule
        spec = rec.recommended_spec or {}
        created_ids = []
        for action in ("start", "stop"):
            time_key = "suggested_start" if action == "start" else "suggested_stop"
            schedule_time = spec.get(time_key, "08:00" if action == "start" else "19:00")
            s = ScheduledAction(
                workspace_id=member.workspace_id,
                provider=rec.provider,
                resource_id=rec.resource_id,
                resource_name=rec.resource_name,
                resource_type=rec.resource_type,
                action=action,
                schedule_type=spec.get("schedule_type", "weekdays"),
                schedule_time=schedule_time,
                timezone=spec.get("timezone", "America/Sao_Paulo"),
                is_enabled=True,
                created_by=member.user.id,
                created_at=datetime.utcnow(),
            )
            db.add(s)
            db.flush()
            register_schedule(s)
            created_ids.append(str(s.id))

        rec.status = "applied"
        rec.applied_at = datetime.utcnow()
        rec.applied_by = member.user.id

        finops_action = FinOpsAction(
            workspace_id=member.workspace_id,
            recommendation_id=rec.id,
            action_type="schedule",
            provider=rec.provider,
            resource_id=rec.resource_id,
            resource_name=rec.resource_name,
            resource_type=rec.resource_type,
            estimated_saving=rec.estimated_saving_monthly,
            status="executed",
            executed_by=member.user.id,
            rollback_data={"scheduled_action_ids": created_ids},
        )
        db.add(finops_action)
        db.commit()
        db.refresh(finops_action)

        log_activity(
            db=db, user=member.user,
            action="finops.schedule_recommendation",
            resource_type=rec.resource_type,
            resource_id=rec.resource_id,
            resource_name=rec.resource_name,
            provider=rec.provider,
            status="executed",
            detail=json.dumps({"saving_monthly": rec.estimated_saving_monthly, "schedules": created_ids}),
            organization_id=member.organization_id,
            workspace_id=member.workspace_id,
        )
        return {"action": _action_to_dict(finops_action), "recommendation": _rec_to_dict(rec)}

    # Build scanner for the right provider
    rollback_data: dict = {}
    error_msg: Optional[str] = None
    action_status = "executed"

    try:
        if rec.provider == "aws":
            scanner = _get_aws_scanner(
                member, db,
                account_id=str(rec.cloud_account_id) if rec.cloud_account_id else None,
            )
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta AWS configurada.")
            rollback_data = _apply_aws(rec, scanner)

        elif rec.provider == "azure":
            scanner = _get_azure_scanner(
                member, db,
                account_id=str(rec.cloud_account_id) if rec.cloud_account_id else None,
            )
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta Azure configurada.")
            rollback_data = _apply_azure(rec, scanner)

        else:
            raise HTTPException(status_code=400, detail=f"Provider '{rec.provider}' não suportado.")

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error applying finops rec {rec_id}: {exc}")
        error_msg = str(exc)
        action_status = "failed"
        rec.status = "failed"
        db.commit()

    if action_status == "executed":
        rec.status = "applied"
        rec.applied_at = datetime.utcnow()
        rec.applied_by = member.user.id

    # Record action
    finops_action = FinOpsAction(
        workspace_id=member.workspace_id,
        recommendation_id=rec.id,
        action_type=rec.recommendation_type,
        provider=rec.provider,
        resource_id=rec.resource_id,
        resource_name=rec.resource_name,
        resource_type=rec.resource_type,
        estimated_saving=rec.estimated_saving_monthly,
        status=action_status,
        executed_by=member.user.id,
        rollback_data=rollback_data if rollback_data else None,
        error_message=error_msg,
    )
    db.add(finops_action)
    db.commit()
    db.refresh(finops_action)

    log_activity(
        db=db, user=member.user,
        action="finops.apply_recommendation",
        resource_type=rec.resource_type,
        resource_id=rec.resource_id,
        resource_name=rec.resource_name,
        provider=rec.provider,
        status=action_status,
        detail=json.dumps({
            "saving_monthly": rec.estimated_saving_monthly,
            "type": rec.recommendation_type,
            "severity": rec.severity,
            "error": error_msg,
        }),
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )

    return {
        "action": _action_to_dict(finops_action),
        "recommendation": _rec_to_dict(rec),
    }


@ws_router.post("/recommendations/{rec_id}/dismiss", status_code=200)
async def dismiss_recommendation(
    rec_id: UUID,
    payload: DismissRequest = None,
    member: MemberContext = Depends(require_permission("finops.recommend")),
    db: Session = Depends(get_db),
):
    rec = db.query(FinOpsRecommendation).filter(
        FinOpsRecommendation.id == rec_id,
        FinOpsRecommendation.workspace_id == member.workspace_id,
        FinOpsRecommendation.status == "pending",
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recomendação não encontrada ou já processada.")

    rec.status = "dismissed"
    db.commit()

    log_activity(
        db=db, user=member.user,
        action="finops.dismiss_recommendation",
        resource_type=rec.resource_type,
        resource_id=rec.resource_id,
        resource_name=rec.resource_name,
        provider=rec.provider,
        status="success",
        detail=payload.reason if payload else None,
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    return _rec_to_dict(rec)


# ── Scan ──────────────────────────────────────────────────────────────────────


@ws_router.post("/scan", status_code=200)
async def trigger_scan(
    provider: Optional[str] = Query(None, description="aws|azure — omit for both"),
    member: MemberContext = Depends(require_permission("finops.recommend")),
    db: Session = Depends(get_db),
):
    """Trigger a waste detection scan. Returns number of new findings."""
    new_total = 0
    results: dict = {}

    if not provider or provider == "aws":
        scanner = _get_aws_scanner(member, db)
        if scanner:
            try:
                findings = scanner.scan_all()
                new_count = _persist_findings(
                    findings, member.workspace_id, scanner._account_id, db
                )
                new_total += new_count
                results["aws"] = {"findings": len(findings), "new": new_count}
            except Exception as exc:
                logger.warning(f"AWS scan failed: {exc}")
                results["aws"] = {"error": str(exc)}
        else:
            results["aws"] = {"skipped": "Nenhuma conta AWS configurada."}

    if not provider or provider == "azure":
        scanner = _get_azure_scanner(member, db)
        if scanner:
            try:
                findings = scanner.scan_all()
                new_count = _persist_findings(
                    findings, member.workspace_id, scanner._account_id, db
                )
                new_total += new_count
                results["azure"] = {"findings": len(findings), "new": new_count}
            except Exception as exc:
                logger.warning(f"Azure scan failed: {exc}")
                results["azure"] = {"error": str(exc)}
        else:
            results["azure"] = {"skipped": "Nenhuma conta Azure configurada."}

    log_activity(
        db=db, user=member.user,
        action="finops.scan",
        resource_type="workspace",
        provider=provider or "all",
        status="success",
        detail=json.dumps({"new_findings": new_total, "results": results}),
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    return {"new_findings": new_total, "results": results}


# ── Actions ───────────────────────────────────────────────────────────────────


@ws_router.get("/actions")
async def list_actions(
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    actions = (
        db.query(FinOpsAction)
        .filter(FinOpsAction.workspace_id == member.workspace_id)
        .order_by(FinOpsAction.executed_at.desc())
        .limit(100)
        .all()
    )
    return [_action_to_dict(a) for a in actions]


@ws_router.post("/actions/{action_id}/rollback", status_code=200)
async def rollback_action(
    action_id: UUID,
    member: MemberContext = Depends(require_permission("finops.execute")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Desfazer ação")

    action = db.query(FinOpsAction).filter(
        FinOpsAction.id == action_id,
        FinOpsAction.workspace_id == member.workspace_id,
        FinOpsAction.status == "executed",
    ).first()
    if not action:
        raise HTTPException(status_code=404, detail="Ação não encontrada ou não pode ser desfeita.")

    if not action.rollback_data:
        raise HTTPException(status_code=400, detail="Esta ação não possui rollback disponível.")

    if action.executed_at and (datetime.utcnow() - action.executed_at) >= timedelta(hours=24):
        raise HTTPException(status_code=400, detail="Janela de rollback de 24h expirada.")

    try:
        if action.provider == "aws":
            scanner = _get_aws_scanner(member, db)
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta AWS configurada.")
            _rollback_aws(action, scanner)
        elif action.provider == "azure":
            scanner = _get_azure_scanner(member, db)
            if not scanner:
                raise HTTPException(status_code=400, detail="Nenhuma conta Azure configurada.")
            _rollback_azure(action, scanner)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Rollback falhou: {exc}")

    action.status = "rolled_back"
    # mark rec back to pending so it shows up again
    if action.recommendation_id:
        rec = db.query(FinOpsRecommendation).filter(
            FinOpsRecommendation.id == action.recommendation_id
        ).first()
        if rec:
            rec.status = "pending"
            rec.applied_at = None
            rec.applied_by = None

    db.commit()

    log_activity(
        db=db, user=member.user,
        action="finops.rollback",
        resource_type=action.resource_type,
        resource_id=action.resource_id,
        resource_name=action.resource_name,
        provider=action.provider,
        status="success",
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    return _action_to_dict(action)


# ── Budgets ───────────────────────────────────────────────────────────────────


@ws_router.get("/budgets")
async def list_budgets(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    budgets = (
        db.query(FinOpsBudget)
        .filter(
            FinOpsBudget.workspace_id == member.workspace_id,
            FinOpsBudget.is_active == True,
        )
        .order_by(FinOpsBudget.created_at.desc())
        .all()
    )
    return [_budget_to_dict(b) for b in budgets]


@ws_router.post("/budgets", status_code=201)
async def create_budget(
    payload: BudgetCreate,
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    # Pro plan: max 5 budgets
    if plan == "pro":
        count = db.query(FinOpsBudget).filter(
            FinOpsBudget.workspace_id == member.workspace_id,
            FinOpsBudget.is_active == True,
        ).count()
        if count >= 5:
            raise HTTPException(
                status_code=403,
                detail="Limite de 5 orçamentos atingido no plano Pro. Faça upgrade para Enterprise."
            )

    budget = FinOpsBudget(
        workspace_id=member.workspace_id,
        created_by=member.user.id,
        name=payload.name,
        provider=payload.provider,
        amount=payload.amount,
        period=payload.period,
        alert_threshold=payload.alert_threshold,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return _budget_to_dict(budget)


@ws_router.patch("/budgets/{budget_id}", status_code=200)
async def update_budget(
    budget_id: UUID,
    payload: BudgetUpdate,
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    budget = db.query(FinOpsBudget).filter(
        FinOpsBudget.id == budget_id,
        FinOpsBudget.workspace_id == member.workspace_id,
    ).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")

    if payload.name is not None:
        budget.name = payload.name
    if payload.amount is not None:
        budget.amount = payload.amount
    if payload.alert_threshold is not None:
        budget.alert_threshold = payload.alert_threshold
    if payload.is_active is not None:
        budget.is_active = payload.is_active

    db.commit()
    db.refresh(budget)
    return _budget_to_dict(budget)


@ws_router.delete("/budgets/{budget_id}", status_code=204)
async def delete_budget(
    budget_id: UUID,
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    budget = db.query(FinOpsBudget).filter(
        FinOpsBudget.id == budget_id,
        FinOpsBudget.workspace_id == member.workspace_id,
    ).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")

    budget.is_active = False
    db.commit()


# ── Anomalies ─────────────────────────────────────────────────────────────────


@ws_router.get("/anomalies")
async def list_anomalies(
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Detecção de anomalias")

    anomalies = (
        db.query(FinOpsAnomaly)
        .filter(FinOpsAnomaly.workspace_id == member.workspace_id)
        .order_by(FinOpsAnomaly.created_at.desc())
        .limit(50)
        .all()
    )
    return [_anomaly_to_dict(a) for a in anomalies]


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


# ── FinOps Scan Schedule ──────────────────────────────────────────────────────


class ScanScheduleRequest(BaseModel):
    schedule_type: str = "daily"   # "daily"|"weekdays"|"weekends"
    schedule_time: str             # "HH:MM"
    timezone: str = "America/Sao_Paulo"
    provider: str = "all"          # "all"|"aws"|"azure"
    is_enabled: bool = True


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


@ws_router.get("/scan-schedule")
def get_scan_schedule(
    member: MemberContext = Depends(require_permission("finops.view")),
    db: Session = Depends(get_db),
):
    """Return the current FinOps auto-scan schedule for this workspace."""
    sched = db.query(FinOpsScanSchedule).filter(
        FinOpsScanSchedule.workspace_id == member.workspace_id,
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Nenhum agendamento de scan configurado.")
    from app.services.scheduler_service import get_finops_scan_next_run
    next_run = get_finops_scan_next_run(str(member.workspace_id))
    return _scan_schedule_to_dict(sched, next_run)


@ws_router.post("/scan-schedule", status_code=200)
def upsert_scan_schedule(
    payload: ScanScheduleRequest,
    member: MemberContext = Depends(require_permission("finops.recommend")),
    db: Session = Depends(get_db),
):
    """Create or update the FinOps auto-scan schedule. Pro-only."""
    _require_plan(_get_org_plan(member, db), "pro", "Análise automática agendada")

    import re
    if not re.match(r"^\d{2}:\d{2}$", payload.schedule_time):
        raise HTTPException(status_code=422, detail="schedule_time must be HH:MM format")
    if payload.schedule_type not in ("daily", "weekdays", "weekends"):
        raise HTTPException(status_code=422, detail="schedule_type must be daily, weekdays or weekends")
    if payload.provider not in ("all", "aws", "azure"):
        raise HTTPException(status_code=422, detail="provider must be all, aws or azure")

    sched = db.query(FinOpsScanSchedule).filter(
        FinOpsScanSchedule.workspace_id == member.workspace_id,
    ).first()

    if sched:
        sched.is_enabled = payload.is_enabled
        sched.schedule_type = payload.schedule_type
        sched.schedule_time = payload.schedule_time
        sched.timezone = payload.timezone
        sched.provider = payload.provider
    else:
        sched = FinOpsScanSchedule(
            workspace_id=member.workspace_id,
            is_enabled=payload.is_enabled,
            schedule_type=payload.schedule_type,
            schedule_time=payload.schedule_time,
            timezone=payload.timezone,
            provider=payload.provider,
            created_by=member.user.id,
        )
        db.add(sched)

    db.commit()
    db.refresh(sched)

    from app.services.scheduler_service import register_finops_scan, unregister_finops_scan, get_finops_scan_next_run
    if payload.is_enabled:
        register_finops_scan(sched)
    else:
        unregister_finops_scan(str(member.workspace_id))

    next_run = get_finops_scan_next_run(str(member.workspace_id)) if payload.is_enabled else None
    log_activity(
        db, member.user, "finops.scan_schedule.upsert", "FinOpsScanSchedule",
        resource_id=str(sched.id),
        detail=f"type={payload.schedule_type} time={payload.schedule_time} provider={payload.provider} enabled={payload.is_enabled}",
        provider="system",
    )
    return _scan_schedule_to_dict(sched, next_run)


@ws_router.delete("/scan-schedule", status_code=204)
def delete_scan_schedule(
    member: MemberContext = Depends(require_permission("finops.recommend")),
    db: Session = Depends(get_db),
):
    """Remove the FinOps auto-scan schedule. Pro-only."""
    _require_plan(_get_org_plan(member, db), "pro", "Análise automática agendada")

    sched = db.query(FinOpsScanSchedule).filter(
        FinOpsScanSchedule.workspace_id == member.workspace_id,
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Nenhum agendamento de scan configurado.")

    from app.services.scheduler_service import unregister_finops_scan
    unregister_finops_scan(str(member.workspace_id))
    db.delete(sched)
    db.commit()
    log_activity(db, member.user, "finops.scan_schedule.delete", "FinOpsScanSchedule", str(sched.id), {})
    return None


# ── Budget Evaluation ─────────────────────────────────────────────────────────


@ws_router.post("/budgets/evaluate", status_code=200)
async def evaluate_budgets(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """
    Fetch current MTD spend for each active budget and update last_spend / pct.
    Fires email + webhook alert when the configured threshold is crossed.
    Returns the updated list of budgets.  Pro-only.
    """
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Orçamentos")

    from datetime import date
    from app.services.email_service import send_budget_alert_email
    from app.services.webhook_service import fire_event as _fire

    budgets = (
        db.query(FinOpsBudget)
        .filter(
            FinOpsBudget.workspace_id == member.workspace_id,
            FinOpsBudget.is_active == True,
        )
        .all()
    )

    if not budgets:
        return []

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.is_active == True,
    ).all()

    # Pre-fetch spend per provider for this workspace
    provider_spend: dict = {}
    for account in accounts:
        try:
            from app.services.auth_service import decrypt_credential
            creds = decrypt_credential(account.encrypted_data)
            spend = _fetch_provider_spend(account.provider, creds)
            if spend is not None:
                provider_spend[account.provider] = (
                    provider_spend.get(account.provider, 0.0) + spend
                )
        except Exception as exc:
            logger.warning(f"Spend fetch failed for account {account.id}: {exc}")

    now = datetime.utcnow()
    cooldown = timedelta(hours=24)

    for budget in budgets:
        if budget.provider == "all":
            spend = sum(provider_spend.values())
        else:
            spend = provider_spend.get(budget.provider, 0.0)

        budget.last_spend = spend
        budget.last_evaluated_at = now

        pct = spend / budget.amount if budget.amount else 0.0
        already_alerted = (
            budget.alert_sent_at is not None and
            (now - budget.alert_sent_at) < cooldown
        )

        if pct >= budget.alert_threshold and not already_alerted:
            from app.models.db_models import User
            creator = db.query(User).filter(User.id == budget.created_by).first()
            if creator:
                send_budget_alert_email(
                    to_email=creator.email,
                    user_name=creator.name,
                    budget_name=budget.name,
                    provider=budget.provider,
                    current_spend=spend,
                    budget_amount=budget.amount,
                    pct=pct,
                )
            _fire(db, member.workspace_id, "budget.threshold_crossed", {
                "budget_id":     str(budget.id),
                "budget_name":   budget.name,
                "provider":      budget.provider,
                "current_spend": spend,
                "budget_amount": budget.amount,
                "pct":           round(pct, 4),
            })
            budget.alert_sent_at = now

    db.commit()
    for b in budgets:
        db.refresh(b)

    return [_budget_to_dict(b) for b in budgets]


def _fetch_provider_spend(provider: str, creds: dict) -> Optional[float]:
    """Fetch current MTD spend for a given provider using stored credentials."""
    try:
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
            result = client.get_cost_and_usage(
                TimePeriod={
                    "Start": today.replace(day=1).isoformat(),
                    "End": today.isoformat(),
                },
                Granularity="MONTHLY",
                Metrics=["UnblendedCost"],
            )
            return sum(
                float(r["Total"]["UnblendedCost"]["Amount"])
                for r in result.get("ResultsByTime", [])
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
            return float(rows[0][0]) if rows else 0.0

    except Exception as exc:
        logger.warning(f"_fetch_provider_spend({provider}) failed: {exc}")
    return None


# ── Report Schedule ───────────────────────────────────────────────────────────


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


@ws_router.get("/report-schedule")
def get_report_schedule(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """Return the current report schedule for this workspace, or null."""
    sched = db.query(ReportSchedule).filter(
        ReportSchedule.workspace_id == member.workspace_id,
    ).first()
    if not sched:
        return {"schedule": None}
    from app.services.scheduler_service import get_report_next_run
    next_run = get_report_next_run(str(sched.id))
    return {"schedule": _report_schedule_to_dict(sched, next_run)}


@ws_router.post("/report-schedule", status_code=200)
def upsert_report_schedule(
    payload: ReportScheduleUpsert,
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """Create or update the report schedule for this workspace. Pro-only."""
    import re
    plan = _get_org_plan(member, db)
    _require_plan(plan, "pro", "Relatórios automáticos")

    if payload.schedule_type not in ("weekly", "monthly"):
        raise HTTPException(status_code=422, detail="schedule_type must be 'weekly' or 'monthly'")
    if not re.match(r"^\d{2}:\d{2}$", payload.send_time):
        raise HTTPException(status_code=422, detail="send_time must be HH:MM format")
    if payload.schedule_type == "weekly" and not (0 <= payload.send_day <= 6):
        raise HTTPException(status_code=422, detail="For weekly schedules, send_day must be 0 (Mon) to 6 (Sun)")
    if payload.schedule_type == "monthly" and not (1 <= payload.send_day <= 28):
        raise HTTPException(status_code=422, detail="For monthly schedules, send_day must be 1-28")
    if not payload.recipients:
        raise HTTPException(status_code=422, detail="At least one recipient email is required")

    sched = db.query(ReportSchedule).filter(
        ReportSchedule.workspace_id == member.workspace_id,
    ).first()

    if sched:
        sched.name = payload.name
        sched.schedule_type = payload.schedule_type
        sched.send_day = payload.send_day
        sched.send_time = payload.send_time
        sched.timezone = payload.timezone
        sched.recipients = payload.recipients
        sched.include_budgets = payload.include_budgets
        sched.include_finops = payload.include_finops
        sched.include_costs = payload.include_costs
        sched.is_enabled = payload.is_enabled
    else:
        sched = ReportSchedule(
            workspace_id=member.workspace_id,
            created_by=member.user.id,
            name=payload.name,
            schedule_type=payload.schedule_type,
            send_day=payload.send_day,
            send_time=payload.send_time,
            timezone=payload.timezone,
            recipients=payload.recipients,
            include_budgets=payload.include_budgets,
            include_finops=payload.include_finops,
            include_costs=payload.include_costs,
            is_enabled=payload.is_enabled,
        )
        db.add(sched)

    db.commit()
    db.refresh(sched)

    from app.services.scheduler_service import register_report_schedule, unregister_report_schedule, get_report_next_run
    if payload.is_enabled:
        register_report_schedule(sched)
    else:
        unregister_report_schedule(str(sched.id))

    next_run = get_report_next_run(str(sched.id)) if payload.is_enabled else None
    log_activity(
        db, member.user, "finops.report_schedule.upsert", "ReportSchedule",
        resource_id=str(sched.id),
        detail=f"type={payload.schedule_type} day={payload.send_day} time={payload.send_time} enabled={payload.is_enabled}",
        provider="system",
    )
    return _report_schedule_to_dict(sched, next_run)


@ws_router.delete("/report-schedule", status_code=204)
def delete_report_schedule(
    member: MemberContext = Depends(require_permission("finops.budget")),
    db: Session = Depends(get_db),
):
    """Remove the report schedule for this workspace."""
    sched = db.query(ReportSchedule).filter(
        ReportSchedule.workspace_id == member.workspace_id,
    ).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Nenhum agendamento de relatório configurado.")

    from app.services.scheduler_service import unregister_report_schedule
    unregister_report_schedule(str(sched.id))
    sched_id = str(sched.id)
    db.delete(sched)
    db.commit()
    log_activity(db, member.user, "finops.report_schedule.delete", "ReportSchedule", sched_id, {})
    return None
