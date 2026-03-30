"""Migration365 API — project and mailbox management."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.services import migration_service as svc

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/migration",
    tags=["Migration365"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = None
    migration_type: str   # google_workspace | exchange_onprem | tenant_to_tenant | imap
    source_config: dict   # credentials / connection info for source
    destination_config: dict


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    source_config: Optional[dict] = None
    destination_config: Optional[dict] = None


class BulkAddMailboxesRequest(BaseModel):
    mailboxes: list[dict]  # [{source_email, destination_email?, display_name?}]


class SetStatusRequest(BaseModel):
    status: str   # draft | ready | running | paused | completed | failed


# ── Projects ──────────────────────────────────────────────────────────────────

@ws_router.get("/projects")
async def list_projects(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    return svc.list_projects(db, str(member.workspace_id))


@ws_router.post("/projects", status_code=201)
async def create_project(
    body: CreateProjectRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    return svc.create_project(
        db,
        workspace_id=str(member.workspace_id),
        user_id=str(member.user_id),
        name=body.name,
        description=body.description,
        migration_type=body.migration_type,
        source_config=body.source_config,
        destination_config=body.destination_config,
    )


@ws_router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project


@ws_router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    body: UpdateProjectRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    project = svc.update_project(
        db, str(member.workspace_id), project_id,
        **{k: v for k, v in body.dict().items() if v is not None}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project


@ws_router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    if not svc.delete_project(db, str(member.workspace_id), project_id):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")


@ws_router.post("/projects/{project_id}/status")
async def set_project_status(
    project_id: str,
    body: SetStatusRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    valid = {"draft", "ready", "running", "paused", "completed", "failed"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {', '.join(valid)}")

    project = svc.set_project_status(db, str(member.workspace_id), project_id, body.status)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    # Dispara o worker Celery ao iniciar migração
    if body.status == "running":
        _dispatch_migration_worker(project_id)

    return project


@ws_router.get("/projects/{project_id}/stats")
async def get_project_stats(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Retorna métricas detalhadas do projeto incluindo contagens por fase."""
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return svc.get_project_stats(db, str(member.workspace_id), project_id)


# ── Mailboxes ─────────────────────────────────────────────────────────────────

@ws_router.get("/projects/{project_id}/mailboxes")
async def list_mailboxes(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    return svc.list_mailboxes(db, str(member.workspace_id), project_id)


@ws_router.post("/projects/{project_id}/mailboxes")
async def add_mailboxes(
    project_id: str,
    body: BulkAddMailboxesRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    return svc.bulk_add_mailboxes(
        db, str(member.workspace_id), project_id, body.mailboxes
    )


@ws_router.delete("/projects/{project_id}/mailboxes/{mailbox_id}", status_code=204)
async def delete_mailbox(
    project_id: str,
    mailbox_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    if not svc.delete_mailbox(db, str(member.workspace_id), project_id, mailbox_id):
        raise HTTPException(status_code=404, detail="Caixa de correio não encontrada.")


@ws_router.get("/projects/{project_id}/mailboxes/{mailbox_id}/ledger")
async def get_mailbox_ledger(
    project_id: str,
    mailbox_id: str,
    limit: int = 200,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Retorna o ledger de mensagens de uma caixa — útil para auditoria."""
    return svc.get_mailbox_ledger(db, str(member.workspace_id), project_id, mailbox_id, limit=limit)


# ── Operações de execução ─────────────────────────────────────────────────────

@ws_router.post("/projects/{project_id}/verify")
async def verify_project(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """
    Dispara verificação pós-migração em todas as mailboxes completadas.
    A verificação é assíncrona — monitore via GET /mailboxes.
    """
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    if project["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=400,
                            detail="Verificação disponível apenas após migração completa.")
    _dispatch_migration_worker(project_id, verify_only=True)
    return {"message": "Verificação iniciada.", "project_id": project_id}


@ws_router.post("/projects/{project_id}/delta")
async def delta_sync_project(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Dispara delta sync para capturar emails novos desde a migração inicial."""
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    _dispatch_migration_worker(project_id, delta_only=True)
    return {"message": "Delta sync iniciado.", "project_id": project_id}


# ── Logs ──────────────────────────────────────────────────────────────────────

@ws_router.get("/projects/{project_id}/logs")
async def list_logs(
    project_id: str,
    limit: int = 100,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    return svc.list_logs(db, str(member.workspace_id), project_id, limit=limit)


# ── Helper: dispatch Celery ───────────────────────────────────────────────────

def _dispatch_migration_worker(project_id: str, verify_only: bool = False,
                                delta_only: bool = False):
    """
    Tenta despachar a task Celery.
    Se Redis não estiver disponível, registra warning mas não quebra a API.
    """
    try:
        from app.workers.migration_worker import run_migration_project
        run_migration_project.apply_async(
            args=[project_id],
            kwargs={"verify_only": verify_only, "delta_only": delta_only},
            queue="migration",
            task_id=f"migration-{project_id}",
        )
        logger.info(f"Migration task despachada para projeto {project_id}")
    except Exception as exc:
        logger.error(
            f"Falha ao despachar migration task para {project_id}: {exc}. "
            "Verifique se o Redis e o worker Celery estão rodando."
        )
