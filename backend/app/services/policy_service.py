"""
Policy Engine Service — evaluates workspace policies every 15 minutes
and executes configured actions when conditions are met.

Supported metrics (v1):
  cost_increase_pct   — % increase in daily cost vs previous day
  cost_absolute       — total daily cost above a threshold (USD)
  instance_count      — number of running instances above a threshold
  anomaly_detected    — any open anomaly with deviation_pct > threshold

Supported actions (v1):
  notify              — push notification + optional webhook
  create_approval     — creates an ApprovalRequest for human review
  stop_instance       — stops a specific cloud instance (params.resource_id required)
  disable_schedule    — disables a ScheduledAction by ID
"""
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Condition evaluation ──────────────────────────────────────────────────────


def _get_daily_cost(db: Session, workspace_id: UUID, provider: str, days_ago: int = 0) -> float:
    """Estimate daily cost from FinOpsAnomaly baseline or FinOpsBudget last_spend."""
    from app.models.db_models import FinOpsAnomaly, FinOpsBudget

    target_date = datetime.utcnow().date() - timedelta(days=days_ago)
    target_start = datetime(target_date.year, target_date.month, target_date.day)
    target_end = target_start + timedelta(days=1)

    # Use anomaly records for daily cost (they contain actual_cost per service per day)
    q = db.query(FinOpsAnomaly).filter(
        FinOpsAnomaly.workspace_id == workspace_id,
        FinOpsAnomaly.detected_date >= target_start,
        FinOpsAnomaly.detected_date < target_end,
    )
    if provider != "all":
        q = q.filter(FinOpsAnomaly.provider == provider)

    total = sum(a.actual_cost for a in q.all())
    if total > 0:
        return total

    # Fallback: budget last_spend (less accurate but always available)
    budget_q = db.query(FinOpsBudget).filter(
        FinOpsBudget.workspace_id == workspace_id,
        FinOpsBudget.is_active == True,
    )
    if provider != "all":
        budget_q = budget_q.filter(FinOpsBudget.provider == provider)

    budget = budget_q.first()
    if budget and budget.last_spend:
        # Rough estimate: monthly spend / days elapsed this month
        day_of_month = datetime.utcnow().day or 1
        return budget.last_spend / day_of_month

    return 0.0


def _get_instance_count(db: Session, workspace_id: UUID, provider: str) -> int:
    """Return count of running compute instances from CloudAccount records."""
    from app.models.db_models import CloudAccount
    from app.services.auth_service import decrypt_credential

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == workspace_id,
        CloudAccount.is_active == True,
    )
    if provider != "all":
        accounts = accounts.filter(CloudAccount.provider == provider)

    count = 0
    for account in accounts.all():
        try:
            creds = decrypt_credential(account.encrypted_data)
            if account.provider == "aws":
                import boto3
                ec2 = boto3.client(
                    "ec2",
                    aws_access_key_id=creds.get("access_key_id"),
                    aws_secret_access_key=creds.get("secret_access_key"),
                    region_name=creds.get("region", "us-east-1"),
                )
                resp = ec2.describe_instances(Filters=[{"Name": "instance-state-name", "Values": ["running"]}])
                count += sum(len(r["Instances"]) for r in resp.get("Reservations", []))
            elif account.provider == "azure":
                from app.services.azure_service import AzureService
                svc = AzureService(
                    tenant_id=creds.get("tenant_id", ""),
                    client_id=creds.get("client_id", ""),
                    client_secret=creds.get("client_secret", ""),
                    subscription_id=creds.get("subscription_id", ""),
                )
                vms = svc.list_virtual_machines()
                count += sum(1 for v in vms if v.get("power_state") == "running")
        except Exception as exc:
            logger.warning("Policy engine: could not get instance count for account %s: %s", account.id, exc)

    return count


def _get_open_anomaly_max(db: Session, workspace_id: UUID, provider: str) -> float:
    """Return the maximum deviation_pct among open anomalies for this workspace."""
    from app.models.db_models import FinOpsAnomaly

    q = db.query(FinOpsAnomaly).filter(
        FinOpsAnomaly.workspace_id == workspace_id,
        FinOpsAnomaly.status == "open",
    )
    if provider != "all":
        q = q.filter(FinOpsAnomaly.provider == provider)

    anomalies = q.all()
    if not anomalies:
        return 0.0
    return max(a.deviation_pct for a in anomalies)


def check_condition(db: Session, workspace_id: UUID, conditions: dict, provider: str) -> tuple[bool, dict]:
    """
    Evaluate a policy condition against current workspace data.
    Returns (triggered: bool, snapshot: dict with actual values).
    """
    metric = conditions.get("metric", "")
    operator = conditions.get("operator", "gt")
    threshold = float(conditions.get("threshold", 0))

    actual_value = 0.0
    snapshot = {"metric": metric, "operator": operator, "threshold": threshold}

    try:
        if metric == "cost_increase_pct":
            today_cost = _get_daily_cost(db, workspace_id, provider, days_ago=0)
            yesterday_cost = _get_daily_cost(db, workspace_id, provider, days_ago=1)
            if yesterday_cost > 0:
                actual_value = ((today_cost - yesterday_cost) / yesterday_cost) * 100
            snapshot.update({"today_cost": today_cost, "yesterday_cost": yesterday_cost, "actual_pct": actual_value})

        elif metric == "cost_absolute":
            actual_value = _get_daily_cost(db, workspace_id, provider, days_ago=0)
            snapshot.update({"daily_cost": actual_value})

        elif metric == "instance_count":
            actual_value = float(_get_instance_count(db, workspace_id, provider))
            snapshot.update({"instance_count": int(actual_value)})

        elif metric == "anomaly_detected":
            actual_value = _get_open_anomaly_max(db, workspace_id, provider)
            snapshot.update({"max_deviation_pct": actual_value})

        else:
            logger.warning("Policy engine: unknown metric '%s'", metric)
            return False, snapshot

    except Exception as exc:
        logger.warning("Policy engine: condition check error for metric '%s': %s", metric, exc)
        return False, {**snapshot, "error": str(exc)}

    snapshot["actual_value"] = actual_value

    triggered = False
    if operator == "gt":
        triggered = actual_value > threshold
    elif operator == "gte":
        triggered = actual_value >= threshold
    elif operator == "lt":
        triggered = actual_value < threshold
    elif operator == "lte":
        triggered = actual_value <= threshold
    elif operator == "increase_pct":
        triggered = actual_value > threshold

    return triggered, snapshot


# ── Action execution ──────────────────────────────────────────────────────────


def execute_action(db: Session, workspace_id: UUID, policy, action: dict, snapshot: dict) -> str:
    """
    Execute a policy action. Returns 'success', 'failed', or 'skipped'.
    """
    action_type = action.get("type", "notify")
    params = action.get("params", {})
    also_notify = action.get("also_notify", True)

    try:
        if action_type == "notify" or also_notify:
            from app.services.notification_service import push_notification
            message = (
                f"Política '{policy.name}' disparada: "
                f"{snapshot.get('metric')} = {round(snapshot.get('actual_value', 0), 2)} "
                f"(limite: {snapshot.get('threshold')})"
            )
            push_notification(db, workspace_id, "policy", message, link_to="/schedules")

        if action_type == "notify":
            return "success"

        if action_type == "create_approval":
            from app.services.approval_service import create_approval
            create_approval(
                db=db,
                workspace_id=workspace_id,
                requester_id=None,  # system-generated
                action_type="policy_triggered",
                action_payload={
                    "policy_id": str(policy.id),
                    "policy_name": policy.name,
                    "condition_snapshot": snapshot,
                    "resource_name": f"Política: {policy.name}",
                },
            )
            return "success"

        if action_type == "stop_instance":
            resource_id = params.get("resource_id", "")
            provider = policy.provider
            if not resource_id:
                logger.warning("Policy %s: stop_instance action missing resource_id", policy.id)
                return "skipped"

            from app.models.db_models import CloudAccount
            from app.services.auth_service import decrypt_credential

            account = db.query(CloudAccount).filter(
                CloudAccount.workspace_id == workspace_id,
                CloudAccount.provider == provider,
                CloudAccount.is_active == True,
            ).first()

            if not account:
                return "skipped"

            creds = decrypt_credential(account.encrypted_data)
            if provider == "aws":
                import boto3
                ec2 = boto3.client(
                    "ec2",
                    aws_access_key_id=creds.get("access_key_id"),
                    aws_secret_access_key=creds.get("secret_access_key"),
                    region_name=creds.get("region", "us-east-1"),
                )
                ec2.stop_instances(InstanceIds=[resource_id])
            elif provider == "azure":
                from app.services.azure_service import AzureService
                rg, vm_name = resource_id.split("/", 1) if "/" in resource_id else ("", resource_id)
                svc = AzureService(
                    tenant_id=creds.get("tenant_id", ""),
                    client_id=creds.get("client_id", ""),
                    client_secret=creds.get("client_secret", ""),
                    subscription_id=creds.get("subscription_id", ""),
                )
                svc.stop_virtual_machine(rg, vm_name)
            return "success"

        if action_type == "disable_schedule":
            schedule_id = params.get("schedule_id", "")
            if not schedule_id:
                return "skipped"
            from app.models.db_models import ScheduledAction
            from app.services.scheduler_service import remove_schedule
            s = db.query(ScheduledAction).filter(
                ScheduledAction.id == schedule_id,
                ScheduledAction.workspace_id == workspace_id,
            ).first()
            if s:
                s.is_enabled = False
                db.commit()
                try:
                    remove_schedule(schedule_id)
                except Exception:
                    pass
            return "success"

        return "skipped"

    except Exception as exc:
        logger.exception("Policy engine: action execution error for policy %s: %s", policy.id, exc)
        return "failed"


# ── Main evaluator (called by APScheduler) ────────────────────────────────────


def evaluate_all_policies_job():
    """
    APScheduler entry point — evaluates all active policies across all workspaces.
    """
    from app.database import SessionLocal
    from app.models.db_models import Policy, PolicyLog

    db = SessionLocal()
    try:
        policies = db.query(Policy).filter(Policy.is_active == True).all()
        logger.info("Policy engine: evaluating %d active policies", len(policies))

        for policy in policies:
            try:
                triggered, snapshot = check_condition(
                    db, policy.workspace_id, policy.conditions, policy.provider
                )

                if not triggered:
                    continue

                logger.info("Policy '%s' triggered (workspace %s)", policy.name, policy.workspace_id)

                action_taken = policy.action.get("type", "notify")
                result = execute_action(db, policy.workspace_id, policy, policy.action, snapshot)

                # Update policy stats
                policy.last_triggered_at = datetime.utcnow()
                policy.trigger_count = (policy.trigger_count or 0) + 1

                # Log
                log_entry = PolicyLog(
                    id=uuid.uuid4(),
                    policy_id=policy.id,
                    triggered_at=datetime.utcnow(),
                    condition_snapshot=snapshot,
                    action_taken=action_taken,
                    result=result,
                )
                db.add(log_entry)
                db.commit()

            except Exception as exc:
                logger.exception("Policy engine: error evaluating policy %s: %s", policy.id, exc)
                db.rollback()

    finally:
        db.close()
