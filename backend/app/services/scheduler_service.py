"""
Scheduler Service — APScheduler with PostgreSQL-backed job store.

Handles scheduled start/stop actions for EC2, Azure VM, and App Service.
SQLAlchemyJobStore ensures a single execution per job across multiple
gunicorn workers (coalesce=True, max_instances=1).
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

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

def _day_of_week(schedule_type: str, custom_days=None) -> str:
    if schedule_type == "custom" and custom_days:
        return ",".join(custom_days)
    return {"daily": "*", "weekdays": "mon-fri", "weekends": "sat,sun"}.get(schedule_type, "*")


def _build_trigger(schedule_type: str, schedule_time: str, timezone: str,
                   custom_days=None, monthly_days=None) -> CronTrigger:
    h, m = map(int, schedule_time.split(":"))
    if schedule_type == "monthly":
        days_str = ",".join(str(d) for d in (monthly_days or [1]))
        return CronTrigger(hour=h, minute=m, day=days_str, timezone=timezone)
    return CronTrigger(
        hour=h, minute=m,
        day_of_week=_day_of_week(schedule_type, custom_days),
        timezone=timezone,
    )


# ── Job executor ──────────────────────────────────────────────────────────────

def execute_scheduled_action(schedule_id: str, trigger_type: str = "scheduled") -> None:
    """
    Called by APScheduler at the configured cron time or manually via "Run Now".
    Fetches the ScheduledAction from DB and performs start/stop on the cloud resource.
    """
    from app.database import SessionLocal
    from app.models.db_models import ScheduledAction, CloudAccount
    from app.services.auth_service import decrypt_credential, decrypt_for_account

    db = SessionLocal()
    try:
        s = db.query(ScheduledAction).filter(ScheduledAction.id == schedule_id).first()
        if not s:
            return
        # For scheduled triggers, respect is_enabled; manual triggers always run
        if trigger_type == "scheduled" and not s.is_enabled:
            return

        # Fetch the cloud account for this workspace + provider
        account = db.query(CloudAccount).filter(
            CloudAccount.workspace_id == s.workspace_id,
            CloudAccount.provider == s.provider,
            CloudAccount.is_active == True,
        ).order_by(CloudAccount.created_at.desc()).first()

        if not account:
            _record_run(db, s, "failed", f"No active {s.provider} account found for workspace", trigger_type)
            return

        creds = decrypt_for_account(db, account)
        try:
            if s.provider == "aws":
                _exec_aws(s, creds)
            elif s.provider == "azure":
                _exec_azure(s, creds)
            elif s.provider == "gcp":
                _exec_gcp(s, creds)
            else:
                raise ValueError(f"Unsupported provider: {s.provider}")

            _record_run(db, s, "success", None, trigger_type)
            from app.services.notification_channel_service import fire_event as _fire
            _action_payload = {
                "resource_id":   s.resource_id,
                "resource_name": s.resource_name,
                "resource_type": s.resource_type,
                "provider":      s.provider,
                "action":        s.action,
            }
            _fire(db, s.workspace_id, f"resource.{s.action}ed", _action_payload)
            _fire(db, s.workspace_id, "schedule.executed", _action_payload)
            from app.services.notification_service import push_notification as _push
            _push(db, s.workspace_id, "schedule",
                  f"Agendamento executado: {s.resource_name} ({s.action})",
                  "/schedules")
        except Exception as exc:
            logger.exception(f"Scheduled action {schedule_id} failed: {exc}")
            _record_run(db, s, "failed", str(exc)[:500], trigger_type)
            from app.services.notification_channel_service import fire_event as _fire
            _fail_payload = {
                "resource_id":   s.resource_id,
                "resource_name": s.resource_name,
                "resource_type": s.resource_type,
                "provider":      s.provider,
                "action":        s.action,
                "error":         str(exc)[:200],
            }
            _fire(db, s.workspace_id, "resource.failed", _fail_payload)
            _fire(db, s.workspace_id, "schedule.failed", _fail_payload)
            from app.services.notification_service import push_notification as _push
            _push(db, s.workspace_id, "schedule",
                  f"Falha no agendamento: {s.resource_name} — {str(exc)[:100]}",
                  "/schedules")
            # Email the schedule creator about the failure
            try:
                from app.models.db_models import User
                from app.services.email_service import send_schedule_failed_email
                from app.services.branding_service import get_branding_for_workspace as _gbw
                creator = db.query(User).filter(User.id == s.created_by).first() if s.created_by else None
                if creator:
                    _branding = _gbw(db, s.workspace_id)
                    send_schedule_failed_email(
                        to_email=creator.email,
                        user_name=creator.name or creator.email,
                        resource_name=s.resource_name,
                        action=s.action,
                        provider=s.provider,
                        error_message=str(exc)[:200],
                        branding=_branding,
                    )
            except Exception as email_exc:
                logger.warning("Could not send schedule failure email: %s", email_exc)

    except Exception as exc:
        logger.exception(f"Unexpected error in scheduler job {schedule_id}: {exc}")
    finally:
        db.close()


def _record_run(db, s, status: str, error: Optional[str], trigger_type: str = "scheduled") -> None:
    from app.models.db_models import ScheduleRun
    now = datetime.utcnow()
    s.last_run_at = now
    s.last_run_status = status
    s.last_run_error = error
    run = ScheduleRun(
        schedule_id=s.id,
        triggered_at=now,
        completed_at=now if status != "running" else None,
        status=status,
        error=error,
        trigger_type=trigger_type,
    )
    db.add(run)
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


def _exec_gcp(s, creds: dict) -> None:
    from googleapiclient.discovery import build
    from google.oauth2.service_account import Credentials

    project_id = creds.get("project_id", "")
    client_email = creds.get("client_email", "")
    private_key = creds.get("private_key", "")

    if not all([project_id, client_email, private_key]):
        raise ValueError("GCP credentials missing")

    creds_info = {
        "type": "service_account",
        "project_id": project_id,
        "client_email": client_email,
        "private_key": private_key,
        "private_key_id": creds.get("private_key_id", ""),
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    credentials = Credentials.from_service_account_info(
        creds_info, scopes=["https://www.googleapis.com/auth/compute"]
    )
    compute = build("compute", "v1", credentials=credentials, cache_discovery=False)

    # resource_id format: "zone/instance_name" (e.g. "us-central1-a/my-vm")
    parts = s.resource_id.split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"GCP resource_id must be 'zone/name', got: {s.resource_id}")
    zone, name = parts

    if s.action == "start":
        compute.instances().start(project=project_id, zone=zone, instance=name).execute()
    elif s.action == "stop":
        compute.instances().stop(project=project_id, zone=zone, instance=name).execute()


# ── Registration helpers ──────────────────────────────────────────────────────

def register_schedule(s) -> None:
    """Add or replace a job in APScheduler for the given ScheduledAction."""
    try:
        scheduler.add_job(
            execute_scheduled_action,
            trigger=_build_trigger(s.schedule_type, s.schedule_time, s.timezone,
                                   custom_days=s.custom_days, monthly_days=s.monthly_days),
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


# ── FinOps Scan Schedule ──────────────────────────────────────────────────────

def execute_finops_scan(workspace_id: str) -> None:
    """
    Called by APScheduler at the configured cron time.
    Runs FinOps scan for all active cloud accounts in the workspace.
    """
    from app.database import SessionLocal
    from app.models.db_models import FinOpsScanSchedule, CloudAccount
    from app.services.auth_service import decrypt_credential, decrypt_for_account
    from app.services.finops_service import AWSFinOpsScanner, AzureFinOpsScanner

    db = SessionLocal()
    sched = None
    try:
        sched = db.query(FinOpsScanSchedule).filter(
            FinOpsScanSchedule.workspace_id == workspace_id,
            FinOpsScanSchedule.is_enabled == True,
        ).first()
        if not sched:
            return

        accounts = db.query(CloudAccount).filter(
            CloudAccount.workspace_id == workspace_id,
            CloudAccount.is_active == True,
        ).all()

        findings = []
        for account in accounts:
            if sched.provider != "all" and account.provider != sched.provider:
                continue
            creds = decrypt_for_account(db, account)
            try:
                if account.provider == "aws":
                    scanner = AWSFinOpsScanner(
                        access_key=creds.get("access_key_id", ""),
                        secret_key=creds.get("secret_access_key", ""),
                        region=creds.get("region", "us-east-1"),
                    )
                    findings.extend(scanner.scan_all())
                elif account.provider == "azure":
                    scanner = AzureFinOpsScanner(
                        subscription_id=creds.get("subscription_id", ""),
                        tenant_id=creds.get("tenant_id", ""),
                        client_id=creds.get("client_id", ""),
                        client_secret=creds.get("client_secret", ""),
                    )
                    findings.extend(scanner.scan_all())
            except Exception as exc:
                logger.error(f"FinOps scan error for account {account.id}: {exc}")

        from app.api.finops import _persist_findings
        _persist_findings(db, str(workspace_id), findings)

        _record_finops_scan_run(db, sched, "success", None)
        logger.info(f"FinOps auto-scan: {len(findings)} findings for workspace {workspace_id}")
        from app.services.notification_channel_service import fire_event as _fire
        _fire(db, workspace_id, "finops.scan.completed", {
            "findings_count": len(findings),
            "provider":       sched.provider,
        })

        # Email scan results to the schedule creator
        if findings:
            try:
                from app.models.db_models import User
                from app.services.email_service import send_finops_scan_email
                from app.services.branding_service import get_branding_for_workspace as _gbw2
                creator = db.query(User).filter(User.id == sched.created_by).first() if sched.created_by else None
                if creator:
                    total_savings = sum(f.get("estimated_savings", 0) for f in findings)
                    top_5 = sorted(findings, key=lambda f: f.get("estimated_savings", 0), reverse=True)[:5]
                    _branding = _gbw2(db, workspace_id)
                    send_finops_scan_email(
                        to_email=creator.email,
                        user_name=creator.name or creator.email,
                        findings_count=len(findings),
                        total_savings=total_savings,
                        top_findings=top_5,
                        branding=_branding,
                    )
            except Exception as email_exc:
                logger.warning("Could not send FinOps scan email: %s", email_exc)

    except Exception as exc:
        logger.error(f"execute_finops_scan failed for workspace {workspace_id}: {exc}")
        if sched:
            try:
                _record_finops_scan_run(db, sched, "failed", str(exc)[:500])
            except Exception:
                pass
    finally:
        db.close()


def _record_finops_scan_run(db, sched, status: str, error: Optional[str]) -> None:
    sched.last_run_at = datetime.utcnow()
    sched.last_run_status = status
    sched.last_run_error = error
    db.commit()


def register_finops_scan(sched) -> None:
    """Add or replace APScheduler job for a FinOpsScanSchedule."""
    try:
        scheduler.add_job(
            execute_finops_scan,
            trigger=_build_trigger(sched.schedule_type, sched.schedule_time, sched.timezone),
            id=f"finops_scan_{sched.workspace_id}",
            args=[str(sched.workspace_id)],
            replace_existing=True,
        )
        logger.info(f"FinOps scan schedule registered for workspace {sched.workspace_id} at {sched.schedule_time}")
    except Exception as exc:
        logger.error(f"Failed to register finops scan schedule: {exc}")


def unregister_finops_scan(workspace_id: str) -> None:
    """Remove APScheduler job for a FinOps scan schedule (silently if not found)."""
    try:
        scheduler.remove_job(f"finops_scan_{workspace_id}")
        logger.info(f"FinOps scan schedule unregistered for workspace {workspace_id}")
    except Exception:
        pass


def load_finops_scan_schedules(db) -> int:
    """Load all enabled FinOpsScanSchedule rows into APScheduler. Returns count."""
    from app.models.db_models import FinOpsScanSchedule

    schedules = db.query(FinOpsScanSchedule).filter(FinOpsScanSchedule.is_enabled == True).all()
    count = 0
    for s in schedules:
        try:
            register_finops_scan(s)
            count += 1
        except Exception as exc:
            logger.warning(f"Could not register finops scan schedule {s.id}: {exc}")
    return count


def get_finops_scan_next_run(workspace_id: str) -> Optional[str]:
    """Return the next finops scan run time as ISO string, or None."""
    try:
        job = scheduler.get_job(f"finops_scan_{workspace_id}")
        if job and job.next_run_time:
            return job.next_run_time.isoformat()
    except Exception:
        pass
    return None


# ── Budget Evaluation ─────────────────────────────────────────────────────────

def execute_budget_eval() -> None:
    """
    Daily job (08:00 UTC) — evaluates all active budgets across all workspaces.
    Fetches current MTD spend and fires email/webhook if threshold is crossed.
    Deduplicates alerts using alert_sent_at (24h cooldown).
    """
    from datetime import timedelta
    from app.database import SessionLocal
    from app.models.db_models import FinOpsBudget, CloudAccount, Workspace, Organization
    from app.services.auth_service import decrypt_credential, decrypt_for_account
    from app.services.email_service import send_budget_alert_email
    from app.services.notification_channel_service import fire_event as _fire

    db = SessionLocal()
    try:
        budgets = db.query(FinOpsBudget).filter(FinOpsBudget.is_active == True).all()
        logger.info(f"Budget eval: checking {len(budgets)} active budgets")

        for budget in budgets:
            try:
                spend = _fetch_budget_spend(db, budget)
                if spend is None:
                    continue

                budget.last_spend = spend
                budget.last_evaluated_at = datetime.utcnow()

                pct = spend / budget.amount if budget.amount else 0.0
                already_alerted = (
                    budget.alert_sent_at and
                    (datetime.utcnow() - budget.alert_sent_at) < timedelta(hours=24)
                )

                if pct >= budget.alert_threshold and not already_alerted:
                    # Resolve branding for white-label emails
                    from app.services.branding_service import get_branding_for_workspace as _gbw
                    _b = _gbw(db, budget.workspace_id)

                    # Get creator email for alert
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
                            branding=_b,
                        )
                    _fire(db, budget.workspace_id, "budget.threshold_crossed", {
                        "budget_id":    str(budget.id),
                        "budget_name":  budget.name,
                        "provider":     budget.provider,
                        "current_spend": spend,
                        "budget_amount": budget.amount,
                        "pct":          round(pct, 4),
                    })
                    from app.services.notification_service import push_notification as _push
                    _push(db, budget.workspace_id, "budget",
                          f"Orçamento '{budget.name}' atingiu {round(pct * 100, 1)}% do limite "
                          f"(${spend:,.2f} / ${budget.amount:,.2f})",
                          "/finops")
                    budget.alert_sent_at = datetime.utcnow()

                db.commit()

            except Exception as exc:
                logger.error(f"Budget eval failed for budget {budget.id}: {exc}")
                db.rollback()

    except Exception as exc:
        logger.error(f"execute_budget_eval failed: {exc}")
    finally:
        db.close()


# ── Anomaly Detection Job ──────────────────────────────────────────────────────


def execute_anomaly_detection() -> None:
    """
    Daily job (09:00 UTC) — runs statistical cost anomaly detection (3σ baseline)
    across all workspaces that have active AWS or Azure cloud accounts.
    """
    from app.database import SessionLocal
    from app.models.db_models import CloudAccount
    from app.api.finops import detect_and_save_anomalies

    db = SessionLocal()
    try:
        # Distinct workspaces with active AWS or Azure accounts
        rows = (
            db.query(CloudAccount.workspace_id)
            .filter(
                CloudAccount.is_active == True,
                CloudAccount.provider.in_(["aws", "azure"]),
            )
            .distinct()
            .all()
        )
        workspace_ids = [r[0] for r in rows]
        total_new = 0
        for ws_id in workspace_ids:
            try:
                count = detect_and_save_anomalies(ws_id, db)
                total_new += count
            except Exception as exc:
                logger.error(f"Anomaly detection failed for workspace {ws_id}: {exc}")
                db.rollback()
        logger.info(f"Anomaly detection complete: {total_new} new anomalies across {len(workspace_ids)} workspaces")
    except Exception as exc:
        logger.error(f"execute_anomaly_detection failed: {exc}")
    finally:
        db.close()


def _fetch_budget_spend(db, budget) -> Optional[float]:
    """Fetch current month-to-date spend for a budget's provider in a workspace."""
    from app.models.db_models import CloudAccount
    from app.services.auth_service import decrypt_credential, decrypt_for_account

    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == budget.workspace_id,
        CloudAccount.is_active == True,
    ).all()

    total_spend = 0.0
    found_any = False

    for account in accounts:
        if budget.provider != "all" and account.provider != budget.provider:
            continue
        try:
            creds = decrypt_for_account(db, account)
            if account.provider == "aws":
                spend = _fetch_aws_spend(creds)
            elif account.provider == "azure":
                spend = _fetch_azure_spend(creds)
            else:
                continue
            if spend is not None:
                total_spend += spend
                found_any = True
        except Exception as exc:
            logger.warning(f"Could not fetch spend for account {account.id}: {exc}")

    return total_spend if found_any else None


def _fetch_aws_spend(creds: dict) -> Optional[float]:
    """Fetch current month-to-date cost from AWS Cost Explorer."""
    try:
        import boto3
        from datetime import date

        client = boto3.client(
            "ce",
            aws_access_key_id=creds.get("access_key_id", ""),
            aws_secret_access_key=creds.get("secret_access_key", ""),
            region_name=creds.get("region", "us-east-1"),
        )
        today = date.today()
        start = today.replace(day=1).isoformat()
        end = today.isoformat()
        result = client.get_cost_and_usage(
            TimePeriod={"Start": start, "End": end},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
        )
        total = sum(
            float(r["Total"]["UnblendedCost"]["Amount"])
            for r in result.get("ResultsByTime", [])
        )
        return total
    except Exception as exc:
        logger.warning(f"AWS spend fetch failed: {exc}")
        return None


def _fetch_azure_spend(creds: dict) -> Optional[float]:
    """Fetch current month-to-date cost from Azure Cost Management."""
    try:
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
        start = today.replace(day=1).isoformat()

        scope = f"/subscriptions/{sub_id}"
        query = QueryDefinition(
            type=ExportType.ACTUAL_COST,
            timeframe=TimeframeType.CUSTOM,
            time_period=QueryTimePeriod(from_property=f"{start}T00:00:00Z",
                                        to=f"{today.isoformat()}T23:59:59Z"),
            dataset=QueryDataset(
                granularity="None",
                aggregation={"totalCost": QueryAggregation(name="Cost", function="Sum")}
            ),
        )
        result = client.query.usage(scope=scope, parameters=query)
        rows = result.rows or []
        return float(rows[0][0]) if rows else 0.0
    except Exception as exc:
        logger.warning(f"Azure spend fetch failed: {exc}")
        return None


# ── Report Schedules ──────────────────────────────────────────────────────────

def execute_report(report_schedule_id: str) -> None:
    """
    Called by APScheduler at the configured cron time for a ReportSchedule.
    Collects cost/budget/FinOps data and sends email to all recipients.
    """
    from app.database import SessionLocal
    from app.models.db_models import (
        ReportSchedule, FinOpsBudget, FinOpsRecommendation, CloudAccount,
        Organization, Workspace,
    )
    from app.services.email_service import send_report_email
    from app.services.auth_service import decrypt_credential, decrypt_for_account

    db = SessionLocal()
    try:
        sched = db.query(ReportSchedule).filter(ReportSchedule.id == report_schedule_id).first()
        if not sched or not sched.is_enabled:
            return

        ws = db.query(Workspace).filter(Workspace.id == sched.workspace_id).first()
        org = db.query(Organization).filter(Organization.id == ws.org_id).first() if ws else None
        org_name = org.name if org else "Organização"
        ws_name = ws.name if ws else "Workspace"

        # Build period label
        from datetime import date
        today = date.today()
        if sched.schedule_type == "weekly":
            period_label = f"Semana de {today.strftime('%d/%m/%Y')}"
        else:
            period_label = today.strftime("%B %Y")

        report_data: dict = {}

        # Costs per provider
        if sched.include_costs:
            accounts = db.query(CloudAccount).filter(
                CloudAccount.workspace_id == sched.workspace_id,
                CloudAccount.is_active == True,
            ).all()
            costs: dict = {}
            for account in accounts:
                try:
                    creds = decrypt_for_account(db, account)
                    if account.provider == "aws":
                        spend = _fetch_aws_spend(creds)
                    elif account.provider == "azure":
                        spend = _fetch_azure_spend(creds)
                    else:
                        spend = None
                    if spend is not None:
                        costs[account.provider] = costs.get(account.provider, 0.0) + spend
                except Exception as exc:
                    logger.warning(f"Cost fetch for report failed (account {account.id}): {exc}")
            report_data["costs"] = costs

        # Budgets
        if sched.include_budgets:
            budgets = db.query(FinOpsBudget).filter(
                FinOpsBudget.workspace_id == sched.workspace_id,
                FinOpsBudget.is_active == True,
            ).all()
            report_data["budgets"] = [
                {
                    "name": b.name,
                    "amount": b.amount,
                    "period": b.period,
                    "last_spend": b.last_spend,
                    "pct": round((b.last_spend or 0) / b.amount, 4) if b.amount else 0.0,
                }
                for b in budgets
            ]

        # FinOps recommendations
        if sched.include_finops:
            recs = (
                db.query(FinOpsRecommendation)
                .filter(
                    FinOpsRecommendation.workspace_id == sched.workspace_id,
                    FinOpsRecommendation.status == "open",
                )
                .order_by(FinOpsRecommendation.estimated_saving.desc())
                .limit(5)
                .all()
            )
            total_savings = sum(r.estimated_saving for r in recs)
            report_data["finops_savings"] = total_savings
            report_data["top_recs"] = [
                {"title": r.title, "saving": r.estimated_saving}
                for r in recs[:3]
            ]

        # Resolve branding for white-label
        _branding = None
        if org:
            from app.services.branding_service import get_branding as _get_brand
            _branding = _get_brand(org, db)

        # Send to all recipients
        success_count = 0
        for email in (sched.recipients or []):
            try:
                send_report_email(
                    to_email=email,
                    org_name=org_name,
                    ws_name=ws_name,
                    period_label=period_label,
                    report_data=report_data,
                    branding=_branding,
                )
                success_count += 1
            except Exception as exc:
                logger.error(f"Failed to send report to {email}: {exc}")

        sched.last_run_at = datetime.utcnow()
        sched.last_run_status = "success" if success_count > 0 else "error"
        db.commit()
        logger.info(f"Report sent to {success_count}/{len(sched.recipients or [])} recipients for schedule {report_schedule_id}")

    except Exception as exc:
        logger.error(f"execute_report failed for schedule {report_schedule_id}: {exc}")
        try:
            if sched:
                sched.last_run_at = datetime.utcnow()
                sched.last_run_status = "error"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def register_report_schedule(sched) -> None:
    """Add or replace APScheduler cron job for a ReportSchedule."""
    try:
        h, m = map(int, sched.send_time.split(":"))
        if sched.schedule_type == "weekly":
            # send_day: 0=Monday, 6=Sunday
            trigger = CronTrigger(
                day_of_week=sched.send_day, hour=h, minute=m,
                timezone=sched.timezone,
            )
        else:  # monthly
            trigger = CronTrigger(
                day=sched.send_day, hour=h, minute=m,
                timezone=sched.timezone,
            )
        scheduler.add_job(
            execute_report,
            trigger=trigger,
            args=[str(sched.id)],
            id=f"report_{sched.id}",
            replace_existing=True,
        )
        logger.info(f"Report schedule registered: {sched.id} ({sched.schedule_type} at {sched.send_time})")
    except Exception as exc:
        logger.error(f"Failed to register report schedule {sched.id}: {exc}")


def unregister_report_schedule(schedule_id: str) -> None:
    """Remove APScheduler job for a report schedule (silently if not found)."""
    try:
        scheduler.remove_job(f"report_{schedule_id}")
        logger.info(f"Report schedule unregistered: {schedule_id}")
    except Exception:
        pass


def execute_billing_overdue_check() -> None:
    """
    Daily job (07:00 UTC) — marks pending billing records as overdue
    where due_date < today. Records status change in billing_status_history.
    """
    from app.database import SessionLocal
    from app.models.db_models import BillingRecord, BillingStatusHistory

    db = SessionLocal()
    try:
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        records = (
            db.query(BillingRecord)
            .filter(BillingRecord.status == "pending", BillingRecord.due_date < today)
            .all()
        )
        count = 0
        for record in records:
            history = BillingStatusHistory(
                billing_id=record.id,
                old_status="pending",
                new_status="overdue",
                changed_by_id=None,
                notes="Auto: vencimento ultrapassado",
            )
            record.status = "overdue"
            db.add(history)
            count += 1
        db.commit()
        logger.info(f"Billing overdue check: {count} records marked overdue")
    except Exception as exc:
        logger.error(f"execute_billing_overdue_check failed: {exc}")
        db.rollback()
    finally:
        db.close()


def execute_trial_reminders() -> None:
    """Send trial expiry reminder emails for orgs expiring in 1, 3, or 7 days."""
    from app.database import SessionLocal
    from app.models.db_models import Organization, OrganizationMember, User, Workspace, FinOpsRecommendation
    from app.services.email_service import send_trial_reminder_email
    from app.services.notification_service import push_notification
    from sqlalchemy import func

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        target_days = [1, 3, 7]
        sent = 0

        for days in target_days:
            # Window: target day ± 12h to avoid missing due to timing
            target = now + timedelta(days=days)
            window_start = target - timedelta(hours=12)
            window_end = target + timedelta(hours=12)

            orgs = (
                db.query(Organization)
                .filter(
                    Organization.plan_tier == "free",
                    Organization.is_active == True,
                    Organization.trial_ends_at >= window_start,
                    Organization.trial_ends_at <= window_end,
                )
                .all()
            )

            for org in orgs:
                # Find owner
                owner_member = (
                    db.query(OrganizationMember)
                    .filter(
                        OrganizationMember.organization_id == org.id,
                        OrganizationMember.role == "owner",
                        OrganizationMember.is_active == True,
                    )
                    .first()
                )
                if not owner_member:
                    continue
                user = db.query(User).filter(User.id == owner_member.user_id).first()
                if not user or not user.email:
                    continue

                # Total savings from FinOps recommendations
                savings = (
                    db.query(func.sum(FinOpsRecommendation.estimated_saving_monthly))
                    .join(Workspace, FinOpsRecommendation.workspace_id == Workspace.id)
                    .filter(
                        Workspace.organization_id == org.id,
                        FinOpsRecommendation.status == "pending",
                    )
                    .scalar()
                ) or 0.0

                trial_end_str = org.trial_ends_at.strftime("%d/%m/%Y") if org.trial_ends_at else ""

                # Resolve branding for white-label
                from app.services.branding_service import get_branding as _gb_trial
                _trial_brand = _gb_trial(org, db)

                send_trial_reminder_email(
                    to_email=user.email,
                    user_name=user.name or user.email,
                    days_remaining=days,
                    savings_found=savings if savings > 0 else None,
                    trial_end_date=trial_end_str,
                    branding=_trial_brand,
                )

                # In-app notification for the first workspace
                first_ws = db.query(Workspace).filter(Workspace.organization_id == org.id).first()
                if first_ws:
                    push_notification(
                        db, first_ws.id, "trial",
                        f"Seu trial Pro termina em {days} dia{'s' if days != 1 else ''}",
                        "/billing",
                    )

                sent += 1

        db.commit()
        logger.info(f"Trial reminders sent: {sent}")
    except Exception as exc:
        logger.error(f"execute_trial_reminders failed: {exc}")
        db.rollback()
    finally:
        db.close()


def load_report_schedules(db) -> int:
    """Load all enabled ReportSchedule rows into APScheduler. Returns count."""
    from app.models.db_models import ReportSchedule

    schedules = db.query(ReportSchedule).filter(ReportSchedule.is_enabled == True).all()
    count = 0
    for s in schedules:
        try:
            register_report_schedule(s)
            count += 1
        except Exception as exc:
            logger.warning(f"Could not register report schedule {s.id}: {exc}")

    # Register daily billing overdue check (07:00 UTC — before budget eval)
    try:
        scheduler.add_job(
            execute_billing_overdue_check,
            CronTrigger(hour=7, minute=0),
            id="billing_overdue_daily",
            replace_existing=True,
        )
        logger.info("Daily billing overdue check job registered")
    except Exception as exc:
        logger.error(f"Failed to register billing_overdue_daily job: {exc}")

    # Also register the daily budget eval job
    try:
        scheduler.add_job(
            execute_budget_eval,
            CronTrigger(hour=8, minute=0),
            id="budget_eval_daily",
            replace_existing=True,
        )
        logger.info("Daily budget evaluation job registered")
    except Exception as exc:
        logger.error(f"Failed to register budget_eval_daily job: {exc}")

    # Register daily anomaly detection job (09:00 UTC — after budget eval)
    try:
        scheduler.add_job(
            execute_anomaly_detection,
            CronTrigger(hour=9, minute=0),
            id="anomaly_detection_daily",
            replace_existing=True,
        )
        logger.info("Daily anomaly detection job registered")
    except Exception as exc:
        logger.error(f"Failed to register anomaly_detection_daily job: {exc}")

    # Register Policy Engine job (every 15 minutes)
    try:
        from app.services.policy_service import evaluate_all_policies_job
        scheduler.add_job(
            evaluate_all_policies_job,
            "interval",
            minutes=15,
            id="policy_engine",
            replace_existing=True,
        )
        logger.info("Policy engine job registered (every 15 min)")
    except Exception as exc:
        logger.error(f"Failed to register policy_engine job: {exc}")

    # Register Monthly Executive Reports job (1st of each month at 08:00 UTC)
    try:
        from app.services.report_service import monthly_reports_job
        scheduler.add_job(
            monthly_reports_job,
            CronTrigger(day=1, hour=8, minute=0),
            id="executive_reports_monthly",
            replace_existing=True,
        )
        logger.info("Monthly executive reports job registered")
    except Exception as exc:
        logger.error(f"Failed to register executive_reports_monthly job: {exc}")

    # Register daily trial reminder check (10:00 UTC)
    try:
        scheduler.add_job(
            execute_trial_reminders,
            CronTrigger(hour=10, minute=0),
            id="trial_reminder_daily",
            replace_existing=True,
        )
        logger.info("Daily trial reminder job registered")
    except Exception as exc:
        logger.error(f"Failed to register trial_reminder_daily job: {exc}")

    # Register webhook retry job (every 30 seconds)
    try:
        from app.services.webhook_service import retry_failed_deliveries as _wh_retry

        def _webhook_retry_job():
            from app.database import SessionLocal
            _db = SessionLocal()
            try:
                retried = _wh_retry(_db)
                if retried:
                    logger.info(f"Webhook retry: {retried} deliveries retried")
            except Exception as e:
                logger.error(f"Webhook retry job failed: {e}")
                _db.rollback()
            finally:
                _db.close()

        scheduler.add_job(
            _webhook_retry_job,
            IntervalTrigger(seconds=30),
            id="webhook_retry",
            replace_existing=True,
        )
        logger.info("Webhook retry job registered (every 30s)")
    except Exception as exc:
        logger.error(f"Failed to register webhook_retry job: {exc}")

    logger.info(f"Loaded {count} report schedules into APScheduler")
    return count


def get_report_next_run(schedule_id: str) -> Optional[str]:
    """Return the next report run time as ISO string, or None."""
    try:
        job = scheduler.get_job(f"report_{schedule_id}")
        if job and job.next_run_time:
            return job.next_run_time.isoformat()
    except Exception:
        pass
    return None
