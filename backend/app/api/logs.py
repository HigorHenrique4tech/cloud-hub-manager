import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import ActivityLog


def log_to_dict(entry: ActivityLog) -> dict:
    return {
        "id":            str(entry.id),
        "user_id":       str(entry.user_id) if entry.user_id else None,
        "user_name":     entry.user_name,
        "user_email":    entry.user_email,
        "action":        entry.action,
        "resource_type": entry.resource_type,
        "resource_id":   entry.resource_id,
        "resource_name": entry.resource_name,
        "provider":      entry.provider,
        "status":        entry.status,
        "detail":        entry.detail,
        "created_at":    entry.created_at.isoformat() if entry.created_at else None,
    }


def _apply_log_filters(q, action, provider, start_date, end_date, user_email=None):
    """Shared filter logic."""
    if action:
        q = q.filter(ActivityLog.action == action)
    if provider:
        q = q.filter(ActivityLog.provider == provider)
    if user_email:
        q = q.filter(ActivityLog.user_email.ilike(f"%{user_email}%"))
    if start_date:
        try:
            dt = datetime.strptime(start_date, "%Y-%m-%d")
            q = q.filter(ActivityLog.created_at >= dt)
        except ValueError:
            pass
    if end_date:
        try:
            dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            q = q.filter(ActivityLog.created_at <= dt)
        except ValueError:
            pass
    return q


# ═══════════════════════════════════════════════════════════════════════════════
# Workspace-scoped router (multi-tenant, RBAC)
# ═══════════════════════════════════════════════════════════════════════════════

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/logs",
    tags=["Logs (workspace)"],
)


@ws_router.get("")
async def ws_list_logs(
    limit:      int            = Query(50,   ge=1, le=200),
    offset:     int            = Query(0,    ge=0),
    action:     Optional[str]  = Query(None, description="Filter by action (e.g. 'ec2.start')"),
    provider:   Optional[str]  = Query(None, description="Filter by provider: aws | azure | gcp | system"),
    start_date: Optional[str]  = Query(None, description="ISO date YYYY-MM-DD"),
    end_date:   Optional[str]  = Query(None, description="ISO date YYYY-MM-DD"),
    user_email: Optional[str]  = Query(None, description="Filter by user email (partial match)"),
    member: MemberContext      = Depends(require_permission("logs.view")),
    db: Session                = Depends(get_db),
):
    """Return paginated activity logs for the workspace."""
    q = (
        db.query(ActivityLog)
        .filter(
            ActivityLog.organization_id == member.organization_id,
            ActivityLog.workspace_id == member.workspace_id,
        )
    )
    q = _apply_log_filters(q, action, provider, start_date, end_date, user_email)

    total = q.count()
    entries = q.order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total":  total,
        "offset": offset,
        "limit":  limit,
        "logs":   [log_to_dict(e) for e in entries],
    }


@ws_router.get("/export")
async def ws_export_logs(
    action:     Optional[str] = Query(None),
    provider:   Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date:   Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    member: MemberContext     = Depends(require_permission("logs.view")),
    db: Session               = Depends(get_db),
):
    """Stream all matching logs as a CSV file."""
    q = (
        db.query(ActivityLog)
        .filter(
            ActivityLog.organization_id == member.organization_id,
            ActivityLog.workspace_id == member.workspace_id,
        )
    )
    q = _apply_log_filters(q, action, provider, start_date, end_date, user_email)
    entries = q.order_by(ActivityLog.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "created_at", "user_email", "user_name", "action",
        "provider", "resource_type", "resource_name", "resource_id", "status", "detail",
    ])
    writer.writeheader()
    for e in entries:
        writer.writerow({
            "created_at":    e.created_at.isoformat() if e.created_at else "",
            "user_email":    e.user_email or "",
            "user_name":     e.user_name or "",
            "action":        e.action or "",
            "provider":      e.provider or "",
            "resource_type": e.resource_type or "",
            "resource_name": e.resource_name or "",
            "resource_id":   e.resource_id or "",
            "status":        e.status or "",
            "detail":        e.detail or "",
        })

    output.seek(0)
    filename = f"audit-log-{datetime.utcnow().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
