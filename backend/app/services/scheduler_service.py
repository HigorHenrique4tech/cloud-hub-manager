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
            from app.services.webhook_service import fire_event as _fire
            _fire(db, s.workspace_id, f"resource.{s.action}ed", {
                "resource_id":   s.resource_id,
                "resource_name": s.resource_name,
                "resource_type": s.resource_type,
                "provider":      s.provider,
                "action":        s.action,
            })
        except Exception as exc:
            logger.exception(f"Scheduled action {schedule_id} failed: {exc}")
            _record_run(db, s, "failed", str(exc)[:500])
            from app.services.webhook_service import fire_event as _fire
            _fire(db, s.workspace_id, "resource.failed", {
                "resource_id":   s.resource_id,
                "resource_name": s.resource_name,
                "resource_type": s.resource_type,
                "provider":      s.provider,
                "action":        s.action,
                "error":         str(exc)[:200],
            })

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


# ── FinOps Scan Schedule ──────────────────────────────────────────────────────

def execute_finops_scan(workspace_id: str) -> None:
    """
    Called by APScheduler at the configured cron time.
    Runs FinOps scan for all active cloud accounts in the workspace.
    """
    from app.database import SessionLocal
    from app.models.db_models import FinOpsScanSchedule, CloudAccount
    from app.services.auth_service import decrypt_credential
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
            creds = decrypt_credential(account.encrypted_data)
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
        from app.services.webhook_service import fire_event as _fire
        _fire(db, workspace_id, "finops.scan.completed", {
            "findings_count": len(findings),
            "provider":       sched.provider,
        })

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
    from app.services.auth_service import decrypt_credential
    from app.services.email_service import send_budget_alert_email
    from app.services.webhook_service import fire_event as _fire

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
                        )
                    _fire(db, budget.workspace_id, "budget.threshold_crossed", {
                        "budget_id":    str(budget.id),
                        "budget_name":  budget.name,
                        "provider":     budget.provider,
                        "current_spend": spend,
                        "budget_amount": budget.amount,
                        "pct":          round(pct, 4),
                    })
                    budget.alert_sent_at = datetime.utcnow()

                db.commit()

            except Exception as exc:
                logger.error(f"Budget eval failed for budget {budget.id}: {exc}")
                db.rollback()

    except Exception as exc:
        logger.error(f"execute_budget_eval failed: {exc}")
    finally:
        db.close()


def _fetch_budget_spend(db, budget) -> Optional[float]:
    """Fetch current month-to-date spend for a budget's provider in a workspace."""
    from app.models.db_models import CloudAccount
    from app.services.auth_service import decrypt_credential

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
            creds = decrypt_credential(account.encrypted_data)
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
    from app.services.auth_service import decrypt_credential

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
                    creds = decrypt_credential(account.encrypted_data)
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
