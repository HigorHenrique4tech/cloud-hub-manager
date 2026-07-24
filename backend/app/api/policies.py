"""
Policy Engine API — workspace-scoped endpoints for managing automation policies.

Policies are evaluated every 15 minutes by APScheduler.
Each policy has:
  - conditions: what metric + operator + threshold triggers it
  - action: what to do when triggered (notify, create_approval, stop_instance, disable_schedule)
"""
import logging
import uuid
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import Policy, PolicyLog
from app.services.log_service import log_activity

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/policies",
    tags=["Policy Engine (workspace)"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────


class ConditionSchema(BaseModel):
    metric: str                  # cost_increase_pct | cost_absolute | instance_count | anomaly_detected | cpu_usage_pct | memory_usage_pct
    operator: str = "gt"         # gt | gte | lt | lte | increase_pct
    threshold: float
    window_hours: int = 24
    resource_id: Optional[str] = None    # required for cpu_usage_pct / memory_usage_pct
    resource_name: Optional[str] = None  # display name, stored for reference


class ActionSchema(BaseModel):
    type: str                    # notify | create_approval | stop_instance | disable_schedule
    params: dict = {}
    also_notify: bool = True


class PolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    provider: str = "all"        # aws | azure | gcp | all
    conditions: ConditionSchema
    action: ActionSchema


class PolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    provider: Optional[str] = None
    conditions: Optional[ConditionSchema] = None
    action: Optional[ActionSchema] = None
    is_active: Optional[bool] = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _policy_to_dict(p: Policy) -> dict:
    return {
        "id": str(p.id),
        "workspace_id": str(p.workspace_id),
        "name": p.name,
        "description": p.description,
        "provider": p.provider,
        "conditions": p.conditions,
        "action": p.action,
        "is_active": p.is_active,
        "last_triggered_at": p.last_triggered_at.isoformat() if p.last_triggered_at else None,
        "trigger_count": p.trigger_count,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _log_to_dict(log: PolicyLog) -> dict:
    return {
        "id": str(log.id),
        "policy_id": str(log.policy_id),
        "triggered_at": log.triggered_at.isoformat() if log.triggered_at else None,
        "condition_snapshot": log.condition_snapshot,
        "action_taken": log.action_taken,
        "result": log.result,
        "error": log.error,
    }


# ── Endpoints ────────────────────────────────────────────────────────────────


@ws_router.get("/resources")
def list_policy_resources(
    provider: str = Query(...),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """List available compute resources (VMs/instances) that can be targeted by a policy."""
    from app.models.db_models import CloudAccount
    from app.services.auth_service import decrypt_credential, decrypt_for_account

    if provider not in ("aws", "azure", "gcp"):
        raise HTTPException(status_code=400, detail="provider must be aws, azure or gcp")

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == member.workspace_id,
        CloudAccount.provider == provider,
        CloudAccount.is_active == True,
    ).all()

    resources = []
    for account in accounts:
        try:
            creds = decrypt_for_account(db, account)
            if provider == "aws":
                import boto3
                ec2 = boto3.client(
                    "ec2",
                    aws_access_key_id=creds.get("access_key_id"),
                    aws_secret_access_key=creds.get("secret_access_key"),
                    region_name=creds.get("region", "us-east-1"),
                )
                resp = ec2.describe_instances()
                for reservation in resp.get("Reservations", []):
                    for inst in reservation.get("Instances", []):
                        name = next(
                            (t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"),
                            inst["InstanceId"],
                        )
                        resources.append({
                            "id": inst["InstanceId"],
                            "name": name,
                            "state": inst["State"]["Name"],
                            "type": inst.get("InstanceType", ""),
                        })
            elif provider == "azure":
                from app.services.azure_service import AzureService
                svc = AzureService(
                    tenant_id=creds.get("tenant_id", ""),
                    client_id=creds.get("client_id", ""),
                    client_secret=creds.get("client_secret", ""),
                    subscription_id=creds.get("subscription_id", ""),
                )
                vm_data = svc.list_virtual_machines()
                for vm in vm_data.get("virtual_machines", []):
                    resources.append({
                        "id": f"{vm['resource_group']}/{vm['name']}",
                        "name": vm["name"],
                        "state": vm.get("power_state", "unknown"),
                        "type": vm.get("size", ""),
                    })
            elif provider == "gcp":
                from app.services.gcp_service import GCPService
                svc = GCPService(
                    project_id=creds.get("project_id", ""),
                    client_email=creds.get("client_email", ""),
                    private_key=creds.get("private_key", ""),
                    private_key_id=creds.get("private_key_id", ""),
                )
                for inst in svc.list_instances():
                    resources.append({
                        "id": inst.get("name", ""),
                        "name": inst.get("name", ""),
                        "state": inst.get("status", "unknown"),
                        "type": inst.get("machine_type", ""),
                    })
        except Exception as exc:
            logger.warning("list_policy_resources: account %s error: %s", account.id, exc)

    return {"resources": resources, "total": len(resources)}


@ws_router.get("")
def list_policies(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    policies = (
        db.query(Policy)
        .filter(Policy.workspace_id == member.workspace_id)
        .order_by(Policy.created_at.desc())
        .all()
    )
    return {"policies": [_policy_to_dict(p) for p in policies], "total": len(policies)}


@ws_router.post("", status_code=201)
def create_policy(
    body: PolicyCreate,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    policy = Policy(
        id=uuid.uuid4(),
        workspace_id=member.workspace_id,
        created_by=member.user.id,
        name=body.name,
        description=body.description,
        provider=body.provider,
        conditions=body.conditions.model_dump(),
        action=body.action.model_dump(),
        is_active=True,
        trigger_count=0,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)

    log_activity(db=db, user=member.user, action="policy.create",
                 resource_type="Policy", resource_id=str(policy.id), resource_name=body.name)

    return _policy_to_dict(policy)


@ws_router.get("/{policy_id}")
def get_policy(
    policy_id: UUID,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.workspace_id == member.workspace_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Política não encontrada.")
    return _policy_to_dict(policy)


@ws_router.patch("/{policy_id}")
def update_policy(
    policy_id: UUID,
    body: PolicyUpdate,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.workspace_id == member.workspace_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Política não encontrada.")

    if body.name is not None:
        policy.name = body.name
    if body.description is not None:
        policy.description = body.description
    if body.provider is not None:
        policy.provider = body.provider
    if body.conditions is not None:
        policy.conditions = body.conditions.model_dump()
    if body.action is not None:
        policy.action = body.action.model_dump()
    if body.is_active is not None:
        policy.is_active = body.is_active

    db.commit()
    db.refresh(policy)
    return _policy_to_dict(policy)


@ws_router.delete("/{policy_id}", status_code=204)
def delete_policy(
    policy_id: UUID,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.workspace_id == member.workspace_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Política não encontrada.")

    log_activity(db=db, user=member.user, action="policy.delete",
                 resource_type="Policy", resource_id=str(policy_id), resource_name=policy.name)
    db.delete(policy)
    db.commit()


@ws_router.post("/{policy_id}/toggle")
def toggle_policy(
    policy_id: UUID,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.workspace_id == member.workspace_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Política não encontrada.")

    policy.is_active = not policy.is_active
    db.commit()
    return {"id": str(policy_id), "is_active": policy.is_active}


@ws_router.get("/{policy_id}/logs")
def get_policy_logs(
    policy_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.workspace_id == member.workspace_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Política não encontrada.")

    total = db.query(PolicyLog).filter(PolicyLog.policy_id == policy_id).count()
    logs = (
        db.query(PolicyLog)
        .filter(PolicyLog.policy_id == policy_id)
        .order_by(PolicyLog.triggered_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {"logs": [_log_to_dict(l) for l in logs], "total": total}
