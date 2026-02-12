from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from app.models.db_models import ActivityLog, User
from app.core.dependencies import get_current_user, require_permission
from app.core.auth_context import MemberContext
from app.database import get_db

# ── Legacy router (user-scoped) ─────────────────────────────────────────────

router = APIRouter(prefix="/logs", tags=["Logs"])


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


@router.get("")
async def list_logs(
    limit:      int            = Query(50,   ge=1, le=200),
    offset:     int            = Query(0,    ge=0),
    action:     Optional[str]  = Query(None, description="Filter by action (e.g. 'ec2.start')"),
    provider:   Optional[str]  = Query(None, description="Filter by provider: aws | azure | system"),
    start_date: Optional[str]  = Query(None, description="ISO date YYYY-MM-DD"),
    end_date:   Optional[str]  = Query(None, description="ISO date YYYY-MM-DD"),
    current_user: User         = Depends(get_current_user),
    db: Session                = Depends(get_db),
):
    """Return paginated activity logs for the authenticated user."""
    q = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == current_user.id)
    )

    if action:
        q = q.filter(ActivityLog.action == action)
    if provider:
        q = q.filter(ActivityLog.provider == provider)
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

    total = q.count()
    entries = q.order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total":  total,
        "offset": offset,
        "limit":  limit,
        "logs":   [log_to_dict(e) for e in entries],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Workspace-scoped router (multi-tenant, RBAC)
# ═══════════════════════════════════════════════════════════════════════════════

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/logs",
    tags=["Logs (workspace)"],
)


def _apply_log_filters(q, action, provider, start_date, end_date):
    """Shared filter logic for both routers."""
    if action:
        q = q.filter(ActivityLog.action == action)
    if provider:
        q = q.filter(ActivityLog.provider == provider)
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


@ws_router.get("")
async def ws_list_logs(
    limit:      int            = Query(50,   ge=1, le=200),
    offset:     int            = Query(0,    ge=0),
    action:     Optional[str]  = Query(None, description="Filter by action (e.g. 'ec2.start')"),
    provider:   Optional[str]  = Query(None, description="Filter by provider: aws | azure | system"),
    start_date: Optional[str]  = Query(None, description="ISO date YYYY-MM-DD"),
    end_date:   Optional[str]  = Query(None, description="ISO date YYYY-MM-DD"),
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
    q = _apply_log_filters(q, action, provider, start_date, end_date)

    total = q.count()
    entries = q.order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total":  total,
        "offset": offset,
        "limit":  limit,
        "logs":   [log_to_dict(e) for e in entries],
    }
