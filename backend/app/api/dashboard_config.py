"""
Dashboard Config API — per-user, per-workspace widget layout preferences.

Routes are workspace-scoped: /orgs/{org_slug}/workspaces/{workspace_id}/dashboard-config
GET  → returns stored config or defaults
PUT  → upsert (creates or updates)
"""
import logging
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import UserDashboardConfig

logger = logging.getLogger(__name__)

# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_WIDGETS = [
    {"id": "stats",     "visible": True,  "order": 0},
    {"id": "cost",      "visible": True,  "order": 1},
    {"id": "finops",    "visible": True,  "order": 2},
    {"id": "alerts",    "visible": False, "order": 3},
    {"id": "schedules", "visible": False, "order": 4},
    {"id": "activity",  "visible": True,  "order": 5},
]

# ── Schemas ───────────────────────────────────────────────────────────────────


class WidgetConfig(BaseModel):
    id: str
    visible: bool
    order: int


class DashboardConfigPayload(BaseModel):
    widgets: List[WidgetConfig]


# ── Router ────────────────────────────────────────────────────────────────────

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/dashboard-config",
    tags=["Dashboard Config"],
)


@ws_router.get("", response_model=dict)
async def get_dashboard_config(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Return this user's dashboard widget config for the workspace."""
    row = db.query(UserDashboardConfig).filter(
        UserDashboardConfig.user_id == member.user.id,
        UserDashboardConfig.workspace_id == member.workspace_id,
    ).first()

    if not row:
        return {"widgets": DEFAULT_WIDGETS}

    return {"widgets": row.config}


@ws_router.put("", response_model=dict)
async def save_dashboard_config(
    payload: DashboardConfigPayload,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Upsert the dashboard widget config for this user + workspace."""
    widgets = [w.model_dump() for w in payload.widgets]

    row = db.query(UserDashboardConfig).filter(
        UserDashboardConfig.user_id == member.user.id,
        UserDashboardConfig.workspace_id == member.workspace_id,
    ).first()

    if row:
        row.config = widgets
        row.updated_at = datetime.utcnow()
    else:
        row = UserDashboardConfig(
            user_id=member.user.id,
            workspace_id=member.workspace_id,
            config=widgets,
            updated_at=datetime.utcnow(),
        )
        db.add(row)

    db.commit()
    return {"widgets": widgets}
