"""FinOps Scan endpoints (trigger scan, poll status) and background scan worker."""
import json
import logging
import uuid as uuid_lib
from datetime import datetime
from typing import Optional

from fastapi import BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.services.log_service import log_activity

from . import ws_router
from ._helpers import (
    _get_aws_scanner,
    _get_azure_scanner,
    _get_gcp_scanner,
    _persist_findings,
    _purge_old_jobs,
    _scan_jobs,
    _scan_jobs_lock,
)

logger = logging.getLogger(__name__)


def _run_scan_job(
    job_id: str,
    provider: Optional[str],
    user_id,           # raw UUID — avoids passing detached ORM objects cross-thread
    workspace_id,
    organization_id,
):
    """Background worker: runs cloud scans and updates job state in _scan_jobs."""
    from app.database import SessionLocal  # local import to avoid circular
    from app.models.db_models import User

    with _scan_jobs_lock:
        _scan_jobs[job_id]["status"] = "running"
        _scan_jobs[job_id]["started_at"] = datetime.utcnow().timestamp()

    new_total = 0
    results: dict = {}
    error_str: Optional[str] = None

    try:
        db = SessionLocal()
        try:
            # Load user fresh from this session (avoids detached-instance errors)
            user = db.query(User).filter(User.id == user_id).first()

            if not provider or provider == "aws":
                scanner = _get_aws_scanner(workspace_id, db)
                if scanner:
                    try:
                        findings = scanner.scan_all()
                        new_count = _persist_findings(findings, workspace_id, scanner._account_id, db)
                        new_total += new_count
                        results["aws"] = {"findings": len(findings), "new": new_count}
                    except Exception as exc:
                        logger.warning(f"AWS scan failed: {exc}")
                        results["aws"] = {"error": str(exc)}
                else:
                    results["aws"] = {"skipped": "Nenhuma conta AWS configurada."}

            if not provider or provider == "azure":
                scanner = _get_azure_scanner(workspace_id, db)
                if scanner:
                    try:
                        findings = scanner.scan_all()
                        new_count = _persist_findings(findings, workspace_id, scanner._account_id, db)
                        new_total += new_count
                        results["azure"] = {"findings": len(findings), "new": new_count}
                    except Exception as exc:
                        logger.warning(f"Azure scan failed: {exc}")
                        results["azure"] = {"error": str(exc)}
                else:
                    results["azure"] = {"skipped": "Nenhuma conta Azure configurada."}

            if not provider or provider == "gcp":
                scanner = _get_gcp_scanner(workspace_id, db)
                if scanner:
                    try:
                        findings = scanner.scan_all()
                        new_count = _persist_findings(findings, workspace_id, scanner._account_id, db)
                        new_total += new_count
                        results["gcp"] = {"findings": len(findings), "new": new_count}
                    except Exception as exc:
                        logger.warning(f"GCP scan failed: {exc}")
                        results["gcp"] = {"error": str(exc)}
                else:
                    results["gcp"] = {"skipped": "Nenhuma conta GCP configurada."}

            if user:
                log_activity(
                    db=db, user=user,
                    action="finops.scan",
                    resource_type="workspace",
                    provider=provider or "all",
                    status="success",
                    detail=json.dumps({"new_findings": new_total, "results": results}),
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                )
            from app.services.notification_service import push_notification as _push
            rec_word = "recomendação" if new_total == 1 else "recomendações"
            _push(db, workspace_id, "finops_scan",
                  f"Scan FinOps concluído: {new_total} {rec_word} nova(s) encontrada(s).",
                  "/finops")
        finally:
            db.close()
    except Exception as exc:
        logger.exception(f"Scan job {job_id} failed: {exc}")
        error_str = str(exc)

    finished = datetime.utcnow().timestamp()
    with _scan_jobs_lock:
        if error_str and not results:
            _scan_jobs[job_id]["status"] = "error"
            _scan_jobs[job_id]["error"] = error_str
        else:
            _scan_jobs[job_id]["status"] = "done"
            _scan_jobs[job_id]["results"] = results
            _scan_jobs[job_id]["new_findings"] = new_total
        _scan_jobs[job_id]["finished_at"] = finished

    _purge_old_jobs()


@ws_router.post("/scan", status_code=202)
async def trigger_scan(
    background_tasks: BackgroundTasks,
    provider: Optional[str] = Query(None, description="aws|azure|gcp — omit for all"),
    member: MemberContext = Depends(require_permission("finops.recommend")),
    db: Session = Depends(get_db),
):
    """Enqueue a waste detection scan. Returns job_id immediately; poll GET /scan/status/{job_id}."""
    job_id = str(uuid_lib.uuid4())
    with _scan_jobs_lock:
        _scan_jobs[job_id] = {
            "status": "queued",
            "workspace_id": str(member.workspace_id),
            "provider": provider or "all",
            "started_at": None,
            "finished_at": None,
            "new_findings": None,
            "results": None,
            "error": None,
        }

    background_tasks.add_task(
        _run_scan_job,
        job_id=job_id,
        provider=provider,
        user_id=member.user.id,
        workspace_id=member.workspace_id,
        organization_id=member.organization_id,
    )
    return {"job_id": job_id, "status": "queued"}


@ws_router.get("/scan/status/{job_id}", status_code=200)
async def get_scan_status(
    job_id: str,
    member: MemberContext = Depends(require_permission("finops.recommend")),
):
    """Poll the status of a background scan job."""
    with _scan_jobs_lock:
        job = _scan_jobs.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job de scan não encontrado ou expirado.")

    if str(job.get("workspace_id")) != str(member.workspace_id):
        raise HTTPException(status_code=403, detail="Acesso negado a este job.")

    return job
