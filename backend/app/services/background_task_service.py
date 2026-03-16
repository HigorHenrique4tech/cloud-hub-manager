"""
background_task_service.py
Helpers to create and update BackgroundTask records.
"""
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.db_models import BackgroundTask


def create_task(db: Session, workspace_id, user_id, task_type: str, label: str) -> BackgroundTask:
    task = BackgroundTask(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        user_id=user_id,
        type=task_type,
        label=label,
        status="queued",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def set_running(db: Session, task_id) -> None:
    db.query(BackgroundTask).filter(BackgroundTask.id == task_id).update(
        {"status": "running", "updated_at": datetime.utcnow()}
    )
    db.commit()


def set_completed(db: Session, task_id, result: dict | None = None) -> None:
    db.query(BackgroundTask).filter(BackgroundTask.id == task_id).update(
        {"status": "completed", "result": result, "updated_at": datetime.utcnow()}
    )
    db.commit()


def set_failed(db: Session, task_id, error: str) -> None:
    db.query(BackgroundTask).filter(BackgroundTask.id == task_id).update(
        {"status": "failed", "error": error, "updated_at": datetime.utcnow()}
    )
    db.commit()


def get_task(db: Session, task_id, workspace_id) -> BackgroundTask | None:
    return (
        db.query(BackgroundTask)
        .filter(BackgroundTask.id == task_id, BackgroundTask.workspace_id == workspace_id)
        .first()
    )


def list_tasks(db: Session, workspace_id, limit: int = 30) -> list[BackgroundTask]:
    return (
        db.query(BackgroundTask)
        .filter(BackgroundTask.workspace_id == workspace_id)
        .order_by(BackgroundTask.created_at.desc())
        .limit(limit)
        .all()
    )
