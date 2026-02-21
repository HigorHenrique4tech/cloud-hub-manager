"""
Scheduler Service — APScheduler with PostgreSQL-backed job store.

Handles scheduled start/stop actions for EC2, Azure VM, and App Service.
SQLAlchemyJobStore ensures a single execution per job across multiple
gunicorn workers (coalesce=True, max_instances=1).
"""
import logging
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Scheduler singleton ───────────────────────────────────────────────────────

scheduler = BackgroundScheduler(
    jobstores={
        "default": SQLAlchemyJobStore(url=settings.DATABASE_URL, tablename="apscheduler_jobs"),
    },
    job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 300},
    timezone="UTC",
)


# ── Trigger helpers ───────────────────────────────────────────────────────────

def _day_of_week(schedule_type: str) -> str:
    return {"daily": "*", "weekdays": "mon-fri", "weekends": "sat,sun"}.get(schedule_type, "*")


def _build_trigger(schedule_type: str, schedule_time: str, timezone: str) -> CronTrigger:
    h, m = map(int, schedule_time.split(":"))
    return CronTrigger(
        hour=h, minute=m,
        day_of_week=_day_of_week(schedule_type),
        timezone=timezone,
    )


# ── Job executor ──────────────────────────────────────────────────────────────

def execute_scheduled_action(schedule_id: str) -> None:
    """
    Called by APScheduler at the configured cron time.
    Fetches the ScheduledAction from DB and performs start/stop on the cloud resource.
    """
    from app.database import SessionLocal
    from app.models.db_models import ScheduledAction, CloudAccount
    from app.services.auth_service import decrypt_credential

    db = SessionLocal()
    try:
        s = db.query(ScheduledAction).filter(ScheduledAction.id == schedule_id).first()
        if not s or not s.is_enabled:
            return

        # Fetch the cloud account for this workspace + provider
        account = db.query(CloudAccount).filter(
            CloudAccount.workspace_id == s.workspace_id,
            CloudAccount.provider == s.provider,
            CloudAccount.is_active == True,
        ).order_by(CloudAccount.created_at.desc()).first()

        if not account:
            _record_run(db, s, "failed", f"No active {s.provider} account found for workspace")
            return

        creds = decrypt_credential(account.encrypted_data)
        try:
            if s.provider == "aws":
                _exec_aws(s, creds)
            elif s.provider == "azure":
                _exec_azure(s, creds)
            else:
                raise ValueError(f"Unsupported provider: {s.provider}")

            _record_run(db, s, "success", None)
        except Exception as exc:
            logger.exception(f"Scheduled action {schedule_id} failed: {exc}")
            _record_run(db, s, "failed", str(exc)[:500])

    except Exception as exc:
        logger.exception(f"Unexpected error in scheduler job {schedule_id}: {exc}")
    finally:
        db.close()


def _record_run(db, s, status: str, error: Optional[str]) -> None:
    s.last_run_at = datetime.utcnow()
    s.last_run_status = status
    s.last_run_error = error
    db.commit()


def _exec_aws(s, creds: dict) -> None:
    import boto3

    access_key = creds.get("access_key_id", "")
    secret_key = creds.get("secret_access_key", "")
    region = creds.get("region", "us-east-1")

    if not access_key or not secret_key:
        raise ValueError("AWS credentials missing")

    ec2 = boto3.client(
        "ec2",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
    )

    if s.resource_type == "ec2":
        if s.action == "start":
            ec2.start_instances(InstanceIds=[s.resource_id])
        elif s.action == "stop":
            ec2.stop_instances(InstanceIds=[s.resource_id])
    else:
        raise ValueError(f"AWS resource type '{s.resource_type}' not supported for scheduling")


def _exec_azure(s, creds: dict) -> None:
    from azure.identity import ClientSecretCredential
    from azure.mgmt.compute import ComputeManagementClient
    from azure.mgmt.web import WebSiteManagementClient

    sub_id = creds.get("subscription_id", "")
    tenant = creds.get("tenant_id", "")
    client_id = creds.get("client_id", "")
    client_secret = creds.get("client_secret", "")

    if not all([sub_id, tenant, client_id, client_secret]):
        raise ValueError("Azure credentials missing")

    credential = ClientSecretCredential(
        tenant_id=tenant, client_id=client_id, client_secret=client_secret
    )

    # resource_id format: "resource_group/resource_name"
    parts = s.resource_id.split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Azure resource_id must be 'resource_group/name', got: {s.resource_id}")
    rg, name = parts

    if s.resource_type == "vm":
        compute = ComputeManagementClient(credential, sub_id)
        if s.action == "start":
            compute.virtual_machines.begin_start(rg, name).result()
        elif s.action == "stop":
            compute.virtual_machines.begin_deallocate(rg, name).result()

    elif s.resource_type == "app_service":
        web = WebSiteManagementClient(credential, sub_id)
        if s.action == "start":
            web.web_apps.start(rg, name)
        elif s.action == "stop":
            web.web_apps.stop(rg, name)

    else:
        raise ValueError(f"Azure resource type '{s.resource_type}' not supported for scheduling")


# ── Registration helpers ──────────────────────────────────────────────────────

def register_schedule(s) -> None:
    """Add or replace a job in APScheduler for the given ScheduledAction."""
    try:
        scheduler.add_job(
            execute_scheduled_action,
            trigger=_build_trigger(s.schedule_type, s.schedule_time, s.timezone),
            args=[str(s.id)],
            id=str(s.id),
            replace_existing=True,
        )
        logger.info(f"Scheduled action registered: {s.id} ({s.action} {s.resource_name} at {s.schedule_time})")
    except Exception as exc:
        logger.error(f"Failed to register schedule {s.id}: {exc}")


def unregister_schedule(schedule_id: str) -> None:
    """Remove a job from APScheduler (silently if it doesn't exist)."""
    try:
        scheduler.remove_job(str(schedule_id))
        logger.info(f"Scheduled action unregistered: {schedule_id}")
    except Exception:
        pass  # job may not be registered (e.g. was disabled)


def load_all_schedules(db) -> int:
    """Load all enabled ScheduledActions from DB into APScheduler. Returns count."""
    from app.models.db_models import ScheduledAction

    schedules = db.query(ScheduledAction).filter(ScheduledAction.is_enabled == True).all()
    count = 0
    for s in schedules:
        try:
            register_schedule(s)
            count += 1
        except Exception as exc:
            logger.warning(f"Could not register schedule {s.id}: {exc}")
    logger.info(f"Loaded {count} scheduled actions into APScheduler")
    return count


def get_next_run(schedule_id: str) -> Optional[str]:
    """Return the next run time as ISO string, or None."""
    try:
        job = scheduler.get_job(str(schedule_id))
        if job and job.next_run_time:
            return job.next_run_time.isoformat()
    except Exception:
        pass
    return None
