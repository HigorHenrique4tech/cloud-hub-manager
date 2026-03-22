"""
background_tasks.py
Endpoints for polling async resource creation tasks.
"""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import require_permission
from app.core.auth_context import MemberContext
from app.services.background_task_service import get_task, list_tasks, cleanup_old_tasks

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/tasks",
    tags=["Background Tasks"],
)


def _task_to_dict(task) -> dict:
    return {
        "id": str(task.id),
        "type": task.type,
        "label": task.label,
        "status": task.status,
        "result": task.result,
        "error": task.error,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
    }


@ws_router.get("/")
async def list_workspace_tasks(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    cleanup_old_tasks(db)
    tasks = list_tasks(db, member.workspace_id, limit=30)
    return [_task_to_dict(t) for t in tasks]


@ws_router.get("/{task_id}")
async def get_task_status(
    task_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    try:
        tid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de task inválido")

    task = get_task(db, tid, member.workspace_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task não encontrada")

    return _task_to_dict(task)
