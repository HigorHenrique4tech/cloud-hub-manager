"""Migration365 service — project and mailbox management."""

import uuid
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session
import json

from app.models.db_models import (
    MigrationProject, MigrationMailbox, MigrationLog,
    MigrationMessageLedger,
)
from app.services.auth_service import (
    encrypt_for_org,
    get_org_fernet,
    _get_org_id_for_workspace,
)

logger = logging.getLogger(__name__)


def _encrypt_config(db: Session, workspace_id: str, data: dict) -> str:
    """Criptografa config de migração usando a chave per-org do workspace."""
    org_id = _get_org_id_for_workspace(db, workspace_id)
    return encrypt_for_org(db, org_id, data)


def _decrypt_config(db: Session, workspace_id: str, encrypted: str) -> dict:
    """Descriptografa config de migração usando a chave per-org do workspace."""
    try:
        org_id = _get_org_id_for_workspace(db, workspace_id)
        f = get_org_fernet(db, org_id)
        return json.loads(f.decrypt(encrypted.encode()).decode())
    except Exception:
        logger.warning("Falha ao descriptografar config de migração — retornando vazio.")
        return {}


def decrypt_project_configs(db: Session, project: MigrationProject) -> tuple[dict, dict]:
    """Retorna (source_cfg, dest_cfg) descriptografados para uso no worker."""
    ws_id = str(project.workspace_id)
    source_cfg = _decrypt_config(db, ws_id, project.source_config) if project.source_config else {}
    dest_cfg   = _decrypt_config(db, ws_id, project.destination_config) if project.destination_config else {}
    return source_cfg, dest_cfg


# ── Projects ──────────────────────────────────────────────────────────────────

def list_projects(db: Session, workspace_id: str) -> list[dict]:
    projects = (
        db.query(MigrationProject)
        .filter(MigrationProject.workspace_id == workspace_id)
        .order_by(MigrationProject.created_at.desc())
        .all()
    )
    return [_project_to_dict(p, _get_source_label(db, workspace_id, p)) for p in projects]


def create_project(
    db: Session,
    workspace_id: str,
    user_id: str,
    name: str,
    description: Optional[str],
    migration_type: str,
    source_config: dict,
    destination_config: dict,
    strip_mip_labels: bool = False,
    preserve_sp_permissions: bool = False,
) -> dict:
    project = MigrationProject(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        created_by=user_id,
        name=name,
        description=description,
        migration_type=migration_type,
        source_config=_encrypt_config(db, workspace_id, source_config),
        destination_config=_encrypt_config(db, workspace_id, destination_config),
        strip_mip_labels=strip_mip_labels,
        preserve_sp_permissions=preserve_sp_permissions,
        status="draft",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    _add_log(db, str(project.id), "info", f"Projeto '{name}' criado.")
    return _project_to_dict(project)


def get_project(db: Session, workspace_id: str, project_id: str) -> Optional[dict]:
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return None
    eta = _calc_project_eta(db, project_id) if p.status == "running" else None
    return _project_to_dict(p, _get_source_label(db, workspace_id, p), eta_seconds=eta)


def update_project(db: Session, workspace_id: str, project_id: str, **kwargs) -> Optional[dict]:
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return None
    NULLABLE_FIELDS = {"scheduled_at"}  # campos que aceitam None explícito
    for k, v in kwargs.items():
        if not hasattr(p, k):
            continue
        if v is None and k not in NULLABLE_FIELDS:
            continue
        # Criptografar configs antes de persistir
        if k == "source_config" and isinstance(v, dict):
            setattr(p, k, _encrypt_config(db, workspace_id, v))
        elif k == "destination_config" and isinstance(v, dict):
            setattr(p, k, _encrypt_config(db, workspace_id, v))
        else:
            setattr(p, k, v)
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return _project_to_dict(p)


def delete_project(db: Session, workspace_id: str, project_id: str) -> bool:
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return False
    db.delete(p)
    db.commit()
    return True


# ── Mailboxes ─────────────────────────────────────────────────────────────────

def list_mailboxes(db: Session, workspace_id: str, project_id: str) -> list[dict]:
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return []
    mailboxes = (
        db.query(MigrationMailbox)
        .filter(MigrationMailbox.project_id == project_id)
        .order_by(MigrationMailbox.source_email)
        .all()
    )
    return [_mailbox_to_dict(m) for m in mailboxes]


def bulk_add_mailboxes(
    db: Session, workspace_id: str, project_id: str, entries: list[dict]
) -> dict:
    """Add multiple mailboxes to a project. entries: [{source_email, destination_email, display_name}]"""
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return {"added": 0, "skipped": 0}

    existing_rows = db.query(MigrationMailbox.source_email, MigrationMailbox.object_type)\
                      .filter(MigrationMailbox.project_id == project_id).all()
    existing = {(r.source_email, r.object_type) for r in existing_rows}
    added = 0
    for entry in entries:
        src = entry.get("source_email", "").strip().lower()
        obj_type = entry.get("object_type", "email")
        if not src or (src, obj_type) in existing:
            continue
        mb = MigrationMailbox(
            id=uuid.uuid4(),
            project_id=project_id,
            source_email=src,
            destination_email=(entry.get("destination_email") or "").strip() or None,
            display_name=entry.get("display_name"),
            object_type=obj_type,
            status="pending",
        )
        db.add(mb)
        existing.add((src, obj_type))
        added += 1

    if added:
        p.mailbox_count = (p.mailbox_count or 0) + added
        p.updated_at = datetime.utcnow()

    db.commit()
    _add_log(db, project_id, "info", f"{added} item(ns) adicionado(s).")
    return {"added": added, "skipped": len(entries) - added}


def delete_mailbox(db: Session, workspace_id: str, project_id: str, mailbox_id: str) -> bool:
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return False
    mb = db.query(MigrationMailbox).filter(
        MigrationMailbox.id == mailbox_id,
        MigrationMailbox.project_id == project_id,
    ).first()
    if not mb:
        return False
    db.delete(mb)
    p.mailbox_count = max(0, p.mailbox_count - 1)
    db.commit()
    return True


# ── Logs ──────────────────────────────────────────────────────────────────────

def get_project_stats(db: Session, workspace_id: str, project_id: str) -> dict:
    """Retorna métricas detalhadas do projeto."""
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return {}

    from sqlalchemy import func
    counts = (
        db.query(MigrationMailbox.status, func.count(MigrationMailbox.id))
        .filter(MigrationMailbox.project_id == project_id)
        .group_by(MigrationMailbox.status)
        .all()
    )
    by_status = {status: count for status, count in counts}

    phases = (
        db.query(MigrationMailbox.phase, func.count(MigrationMailbox.id))
        .filter(MigrationMailbox.project_id == project_id,
                MigrationMailbox.phase.isnot(None))
        .group_by(MigrationMailbox.phase)
        .all()
    )
    by_phase = {phase: count for phase, count in phases}

    total_messages = db.query(func.sum(MigrationMailbox.items_total)).filter(
        MigrationMailbox.project_id == project_id
    ).scalar() or 0
    migrated_messages = db.query(func.sum(MigrationMailbox.items_migrated)).filter(
        MigrationMailbox.project_id == project_id
    ).scalar() or 0
    total_size = db.query(func.sum(MigrationMailbox.size_bytes)).filter(
        MigrationMailbox.project_id == project_id
    ).scalar() or 0

    ledger_count = db.query(MigrationMessageLedger).join(
        MigrationMailbox,
        MigrationMessageLedger.mailbox_id == MigrationMailbox.id
    ).filter(
        MigrationMailbox.project_id == project_id,
        MigrationMessageLedger.status == "copied",
    ).count()

    return {
        **_project_to_dict(p),
        "by_status": by_status,
        "by_phase": by_phase,
        "total_messages": int(total_messages),
        "migrated_messages": int(migrated_messages),
        "total_size_bytes": int(total_size),
        "ledger_count": ledger_count,
    }


def pause_mailbox(db: Session, workspace_id: str, project_id: str, mailbox_id: str) -> Optional[dict]:
    """Pausa uma caixa individualmente — o worker respeita status=paused no próximo callback."""
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return None
    mb = db.query(MigrationMailbox).filter(
        MigrationMailbox.id == mailbox_id,
        MigrationMailbox.project_id == project_id,
        MigrationMailbox.status == "running",
    ).first()
    if not mb:
        return None
    mb.status = "paused"
    db.commit()
    return _mailbox_to_dict(mb)


def retry_mailbox(db: Session, workspace_id: str, project_id: str, mailbox_id: str) -> Optional[dict]:
    """Reseta uma caixa individual para pending — permite retentar sem afetar as outras."""
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return None
    mb = db.query(MigrationMailbox).filter(
        MigrationMailbox.id == mailbox_id,
        MigrationMailbox.project_id == project_id,
        MigrationMailbox.status.in_(["failed", "paused"]),
    ).first()
    if not mb:
        return None
    mb.status = "pending"
    mb.error_message = None
    mb.phase = None
    db.commit()
    return _mailbox_to_dict(mb)


def retry_failed_mailboxes(db: Session, workspace_id: str, project_id: str) -> dict:
    """Reseta mailboxes failed → pending e reativa o projeto para nova execução."""
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return {"reset_count": 0}

    failed_mbs = db.query(MigrationMailbox).filter(
        MigrationMailbox.project_id == project_id,
        MigrationMailbox.status == "failed",
    ).all()

    for mb in failed_mbs:
        mb.status = "pending"
        mb.error_message = None
        mb.phase = None

    p.status = "running"
    p.failed_count = 0
    if not p.started_at:
        p.started_at = datetime.utcnow()
    p.updated_at = datetime.utcnow()
    db.commit()

    _add_log(db, project_id, "info",
             f"{len(failed_mbs)} caixa(s) com falha resetada(s) para retry.")
    return {"reset_count": len(failed_mbs),
            "message": f"{len(failed_mbs)} caixa(s) serão retentadas."}


def get_mailbox_ledger(db: Session, workspace_id: str, project_id: str,
                       mailbox_id: str, limit: int = 200) -> list[dict]:
    """Retorna entradas do ledger de mensagens de uma caixa."""
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return []
    mb = db.query(MigrationMailbox).filter(
        MigrationMailbox.id == mailbox_id,
        MigrationMailbox.project_id == project_id,
    ).first()
    if not mb:
        return []
    entries = (
        db.query(MigrationMessageLedger)
        .filter(MigrationMessageLedger.mailbox_id == mailbox_id)
        .order_by(MigrationMessageLedger.copied_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(e.id),
            "source_folder": e.source_folder,
            "source_uid": e.source_uid,
            "message_id_header": e.message_id_header,
            "status": e.status,
            "size_bytes": e.size_bytes,
            "copied_at": e.copied_at.isoformat() if e.copied_at else None,
            "error": e.error,
        }
        for e in entries
    ]


def list_logs(db: Session, workspace_id: str, project_id: str, limit: int = 100) -> list[dict]:
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return []
    logs = (
        db.query(MigrationLog)
        .filter(MigrationLog.project_id == project_id)
        .order_by(MigrationLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(log.id),
            "level": log.level,
            "message": log.message,
            "details": log.details,
            "mailbox_id": str(log.mailbox_id) if log.mailbox_id else None,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


# ── Status transitions ────────────────────────────────────────────────────────

def set_project_status(
    db: Session, workspace_id: str, project_id: str, status: str
) -> Optional[dict]:
    p = _get_project_or_none(db, workspace_id, project_id)
    if not p:
        return None
    p.status = status
    if status == "running" and not p.started_at:
        p.started_at = datetime.utcnow()
    if status in ("completed", "failed"):
        p.completed_at = datetime.utcnow()
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    _add_log(db, project_id, "info", f"Status alterado para '{status}'.")
    return _project_to_dict(p)


# ── Internals ─────────────────────────────────────────────────────────────────

def _calc_project_eta(db: Session, project_id: str) -> int | None:
    """Soma os ETAs individuais das mailboxes em execução para estimar o tempo restante do projeto."""
    running = db.query(MigrationMailbox).filter(
        MigrationMailbox.project_id == project_id,
        MigrationMailbox.status == "running",
        MigrationMailbox.started_at.isnot(None),
        MigrationMailbox.items_migrated > 0,
        MigrationMailbox.items_total > MigrationMailbox.items_migrated,
    ).all()
    if not running:
        return None
    max_eta = 0
    for mb in running:
        elapsed = (datetime.utcnow() - mb.started_at).total_seconds()
        if elapsed > 0 and mb.items_migrated:
            rate = mb.items_migrated / elapsed
            eta = int(((mb.items_total or 0) - mb.items_migrated) / rate)
            max_eta = max(max_eta, eta)
    return max_eta if max_eta > 0 else None


def _get_source_label(db: Session, workspace_id: str, p: MigrationProject) -> str:
    """Descriptografa apenas para extrair o label de exibição da origem."""
    if not p or not p.source_config:
        return ""
    try:
        source = _decrypt_config(db, workspace_id, p.source_config)
        return source.get("label") or source.get("host") or source.get("domain") or source.get("tenant_id") or ""
    except Exception:
        return ""


def _get_project_or_none(db: Session, workspace_id: str, project_id: str):
    return db.query(MigrationProject).filter(
        MigrationProject.id == project_id,
        MigrationProject.workspace_id == workspace_id,
    ).first()


def _add_log(db: Session, project_id: str, level: str, message: str, details: dict = None):
    log = MigrationLog(
        id=uuid.uuid4(),
        project_id=project_id,
        level=level,
        message=message,
        details=details,
    )
    db.add(log)
    db.commit()


def _project_to_dict(p: MigrationProject, source_label: str = "",
                     eta_seconds: int = None) -> dict:
    total = p.mailbox_count or 0
    done = p.completed_count or 0
    progress = round((done / total * 100) if total > 0 else 0)
    return {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "migration_type": p.migration_type,
        "status": p.status,
        "mailbox_count": total,
        "completed_count": done,
        "failed_count": p.failed_count or 0,
        "verified_count": p.verified_count or 0,
        "progress": progress,
        "strip_mip_labels": bool(p.strip_mip_labels),
        "preserve_sp_permissions": bool(p.preserve_sp_permissions),
        "source_label": source_label,
        "eta_seconds": eta_seconds,
        "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
        "started_at": p.started_at.isoformat() if p.started_at else None,
        "completed_at": p.completed_at.isoformat() if p.completed_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _mailbox_to_dict(m: MigrationMailbox) -> dict:
    total = m.items_total or 0
    done = m.items_migrated or 0
    progress = round((done / total * 100) if total > 0 else 0)
    size_mb = round(m.size_bytes / 1_048_576, 1) if m.size_bytes else None

    # ETA por caixa: baseado na velocidade atual (itens/seg)
    eta_seconds = None
    if m.status == "running" and m.started_at and done > 0 and total > done:
        elapsed = (datetime.utcnow() - m.started_at).total_seconds()
        if elapsed > 0:
            rate = done / elapsed  # itens/segundo
            eta_seconds = int((total - done) / rate)

    return {
        "id": str(m.id),
        "source_email": m.source_email,
        "destination_email": m.destination_email,
        "display_name": m.display_name,
        "object_type": m.object_type or "email",
        "status": m.status,
        "error_message": m.error_message,
        "items_total": m.items_total,
        "items_migrated": done,
        "progress": progress,
        "size_mb": size_mb,
        "eta_seconds": eta_seconds,
        "phase": m.phase,
        "verify_result": m.verify_result,
        "verified_at": m.verified_at.isoformat() if m.verified_at else None,
        "started_at": m.started_at.isoformat() if m.started_at else None,
        "completed_at": m.completed_at.isoformat() if m.completed_at else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }
