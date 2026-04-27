"""
Security Automation API — detecção de eventos, playbooks, audit trail,
Partner Center CSP e resposta a incidentes.

Plano mínimo exigido: enterprise
Endpoints de IR (incident response): apenas admin/owner podem aprovar.
"""
import json
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import (
    SecurityEvent, SecurityAction, SecurityPlaybook,
    PartnerCenterConfig, IncidentResponse, OrganizationMember,
)
from app.services.security_automation_service import (
    DEFAULT_PLAYBOOKS, get_active_playbooks, save_security_action,
    run_security_scan, schedule_security_scan, unschedule_security_scan,
)
from app.services.incident_response_service import (
    TEMPLATES, get_template_preview, create_incident_response,
    execute_incident_response, ir_to_dict,
)

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/security",
    tags=["Security Automation"],
)

APPROVER_ROLES = {"owner", "admin"}


# ── Helpers ───────────────────────────────────────────────────────────────────

_ENTERPRISE_PLANS = {"enterprise", "enterprise_e1", "enterprise_e2", "enterprise_e3", "enterprise_migration"}

def _check_enterprise(member: MemberContext, db: Session):
    from app.services.plan_service import get_effective_plan
    from app.models.db_models import Organization
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")
    plan = get_effective_plan(org)
    if plan not in _ENTERPRISE_PLANS:
        raise HTTPException(
            status_code=403,
            detail="Security Automation requer plano Enterprise."
        )


def _is_approver(member: MemberContext, db: Session) -> bool:
    om = (db.query(OrganizationMember)
          .filter(OrganizationMember.organization_id == member.organization_id,
                  OrganizationMember.user_id == member.user.id,
                  OrganizationMember.is_active == True)
          .first())
    return om is not None and om.role in APPROVER_ROLES


def _event_to_dict(ev: SecurityEvent) -> dict:
    return {
        "id": str(ev.id),
        "source": ev.source,
        "severity": ev.severity,
        "event_type": ev.event_type,
        "title": ev.title,
        "entity_type": ev.entity_type,
        "entity_id": ev.entity_id,
        "detected_at": ev.detected_at.isoformat() if ev.detected_at else None,
        "status": ev.status,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
    }


def _action_to_dict(a: SecurityAction) -> dict:
    return {
        "id": str(a.id),
        "event_id": str(a.event_id) if a.event_id else None,
        "playbook_name": a.playbook_name,
        "action_type": a.action_type,
        "auto_executed": a.auto_executed,
        "executed_by": str(a.executed_by) if a.executed_by else None,
        "result": a.result,
        "error_message": a.error_message,
        "executed_at": a.executed_at.isoformat() if a.executed_at else None,
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class UpdatePlaybookBody(BaseModel):
    description: Optional[str] = None
    sources: Optional[list[str]] = None
    severity_min: Optional[str] = None
    actions: Optional[list[str]] = None
    auto_execute: Optional[bool] = None
    cooldown_minutes: Optional[int] = None
    is_active: Optional[bool] = None


class ExecuteActionBody(BaseModel):
    action_type: str
    playbook_name: Optional[str] = None


class AutomationSettingsBody(BaseModel):
    enabled: bool
    scan_interval_minutes: Optional[int] = 5


class PartnerCenterConfigBody(BaseModel):
    partner_tenant_id: str
    client_id: str
    client_secret: str
    gdap_security_group_id: Optional[str] = None


class CreateIRBody(BaseModel):
    title: str
    template_type: str
    affected_users: Optional[list[str]] = None
    target_resource_ids: Optional[list[str]] = None
    target_subscription_id: Optional[str] = None
    target_customer_tenant_id: Optional[str] = None
    notes: Optional[str] = None


class ApproveIRBody(BaseModel):
    notes: Optional[str] = None


# ── Events ───────────────────────────────────────────────────────────────────

@ws_router.get("/automation/events")
def list_events(
    status: Optional[str] = Query(None, description="open|contained|dismissed|expired"),
    severity: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    q = db.query(SecurityEvent).filter(
        SecurityEvent.workspace_id == member.workspace_id
    )
    if status:
        q = q.filter(SecurityEvent.status == status)
    if severity:
        q = q.filter(SecurityEvent.severity == severity)
    if source:
        q = q.filter(SecurityEvent.source == source)

    total = q.count()
    items = (q.order_by(SecurityEvent.created_at.desc())
             .offset((page - 1) * page_size)
             .limit(page_size)
             .all())
    return {"items": [_event_to_dict(e) for e in items], "total": total,
            "page": page, "page_size": page_size}


@ws_router.get("/automation/events/{event_id}")
def get_event(
    event_id: UUID,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    ev = db.query(SecurityEvent).filter(
        SecurityEvent.id == event_id,
        SecurityEvent.workspace_id == member.workspace_id,
    ).first()
    if not ev:
        raise HTTPException(404, "Evento não encontrado.")
    actions = (db.query(SecurityAction)
               .filter(SecurityAction.event_id == event_id)
               .order_by(SecurityAction.executed_at)
               .all())
    return {**_event_to_dict(ev), "actions": [_action_to_dict(a) for a in actions]}


@ws_router.post("/automation/events/{event_id}/dismiss")
def dismiss_event(
    event_id: UUID,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    ev = db.query(SecurityEvent).filter(
        SecurityEvent.id == event_id,
        SecurityEvent.workspace_id == member.workspace_id,
    ).first()
    if not ev:
        raise HTTPException(404, "Evento não encontrado.")
    if ev.status not in ("open",):
        raise HTTPException(400, f"Evento já está '{ev.status}'.")
    ev.status = "dismissed"
    ev.dismissed_by = member.user.id
    ev.dismissed_at = datetime.utcnow()
    db.commit()
    return {"dismissed": True, "id": str(event_id)}


@ws_router.post("/automation/events/{event_id}/execute-action")
def execute_event_action(
    event_id: UUID,
    body: ExecuteActionBody,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    """Executa uma ação de contenção manualmente para um evento específico."""
    _check_enterprise(member, db)
    if not _is_approver(member, db):
        raise HTTPException(403, "Apenas admins e owners podem executar ações de segurança.")

    ev = db.query(SecurityEvent).filter(
        SecurityEvent.id == event_id,
        SecurityEvent.workspace_id == member.workspace_id,
    ).first()
    if not ev:
        raise HTTPException(404, "Evento não encontrado.")

    event_data = {
        "source": ev.source,
        "severity": ev.severity,
        "entity_type": ev.entity_type,
        "entity_id": ev.entity_id,
        "title": ev.title,
    }

    from app.models.db_models import CloudAccount
    m365_account = (db.query(CloudAccount)
                    .filter(CloudAccount.workspace_id == member.workspace_id,
                            CloudAccount.provider == "m365",
                            CloudAccount.is_active == True)
                    .first())
    azure_account = (db.query(CloudAccount)
                     .filter(CloudAccount.workspace_id == member.workspace_id,
                             CloudAccount.provider == "azure",
                             CloudAccount.is_active == True)
                     .first())

    try:
        from app.services.security_automation_service import _execute_containment_action
        result = _execute_containment_action(
            body.action_type, event_data, m365_account, azure_account, db
        )
        save_security_action(
            db, member.workspace_id, ev.id,
            body.playbook_name or "manual",
            body.action_type, result,
            auto_executed=False, executed_by=member.user.id,
        )
        ev.status = "contained"
        db.commit()
        return {"ok": True, "result": result}
    except Exception as exc:
        save_security_action(
            db, member.workspace_id, ev.id,
            body.playbook_name or "manual",
            body.action_type, {},
            auto_executed=False, executed_by=member.user.id,
            error=str(exc),
        )
        db.commit()
        raise HTTPException(500, f"Ação falhou: {exc}")


# ── Manual scan ───────────────────────────────────────────────────────────────

@ws_router.post("/automation/scan")
def trigger_scan(
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    background_tasks.add_task(run_security_scan, str(member.workspace_id))
    return {"message": "Scan de segurança iniciado em background."}


# ── Playbooks ─────────────────────────────────────────────────────────────────

@ws_router.get("/automation/playbooks")
def list_playbooks(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    playbooks = get_active_playbooks(db, member.workspace_id)
    return {"playbooks": [{"name": k, **v} for k, v in playbooks.items()]}


@ws_router.put("/automation/playbooks/{playbook_name}")
def update_playbook(
    playbook_name: str,
    body: UpdatePlaybookBody,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    if not _is_approver(member, db):
        raise HTTPException(403, "Apenas admins e owners podem editar playbooks.")

    pb = (db.query(SecurityPlaybook)
          .filter(SecurityPlaybook.workspace_id == member.workspace_id,
                  SecurityPlaybook.name == playbook_name)
          .first())

    if not pb:
        # Cria a partir do default ou do zero
        default = DEFAULT_PLAYBOOKS.get(playbook_name, {})
        pb = SecurityPlaybook(
            workspace_id=member.workspace_id,
            name=playbook_name,
            description=body.description or default.get("description", ""),
            sources=body.sources or default.get("sources", []),
            severity_min=body.severity_min or default.get("severity_min", "high"),
            actions=body.actions or default.get("actions", ["notify"]),
            auto_execute=body.auto_execute if body.auto_execute is not None else default.get("auto_execute", False),
            cooldown_minutes=body.cooldown_minutes if body.cooldown_minutes is not None else default.get("cooldown_minutes", 30),
            is_active=body.is_active if body.is_active is not None else True,
            is_default=playbook_name in DEFAULT_PLAYBOOKS,
        )
        db.add(pb)
    else:
        if body.description is not None:
            pb.description = body.description
        if body.sources is not None:
            pb.sources = body.sources
        if body.severity_min is not None:
            pb.severity_min = body.severity_min
        if body.actions is not None:
            pb.actions = body.actions
        if body.auto_execute is not None:
            pb.auto_execute = body.auto_execute
        if body.cooldown_minutes is not None:
            pb.cooldown_minutes = body.cooldown_minutes
        if body.is_active is not None:
            pb.is_active = body.is_active

    db.commit()
    db.refresh(pb)
    return {
        "name": pb.name,
        "description": pb.description,
        "sources": pb.sources,
        "severity_min": pb.severity_min,
        "actions": pb.actions,
        "auto_execute": pb.auto_execute,
        "cooldown_minutes": pb.cooldown_minutes,
        "is_active": pb.is_active,
        "is_default": pb.is_default,
    }


# ── Audit trail ───────────────────────────────────────────────────────────────

@ws_router.get("/automation/audit")
def list_audit(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    q = (db.query(SecurityAction)
         .filter(SecurityAction.workspace_id == member.workspace_id)
         .order_by(SecurityAction.executed_at.desc()))
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_action_to_dict(a) for a in items], "total": total,
            "page": page, "page_size": page_size}


# ── Settings (enable/disable scan) ───────────────────────────────────────────

@ws_router.get("/automation/settings")
def get_settings(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    from app.services.scheduler_service import scheduler
    job_id = f"security_scan_{member.workspace_id}"
    job = scheduler.get_job(job_id)
    return {
        "enabled": job is not None,
        "scan_interval_minutes": 5,
        "next_run": job.next_run_time.isoformat() if job and job.next_run_time else None,
    }


@ws_router.put("/automation/settings")
def update_settings(
    body: AutomationSettingsBody,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    if not _is_approver(member, db):
        raise HTTPException(403, "Apenas admins e owners podem alterar configurações.")

    if body.enabled:
        schedule_security_scan(str(member.workspace_id))
    else:
        unschedule_security_scan(str(member.workspace_id))

    return {"enabled": body.enabled}


# ── Partner Center config ─────────────────────────────────────────────────────

@ws_router.get("/partner-center/config")
def get_pc_config(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    cfg = (db.query(PartnerCenterConfig)
           .filter(PartnerCenterConfig.workspace_id == member.workspace_id)
           .first())
    if not cfg:
        return {"configured": False}
    return {
        "configured": True,
        "partner_tenant_id": cfg.partner_tenant_id,
        "gdap_security_group_id": cfg.gdap_security_group_id,
        "created_at": cfg.created_at.isoformat(),
        "updated_at": cfg.updated_at.isoformat(),
    }


@ws_router.put("/partner-center/config")
def upsert_pc_config(
    body: PartnerCenterConfigBody,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    if not _is_approver(member, db):
        raise HTTPException(403, "Apenas admins e owners podem configurar o Partner Center.")

    from app.services.auth_service import get_org_fernet
    fernet = get_org_fernet(db, member.organization_id)
    creds_json = json.dumps({"client_id": body.client_id, "client_secret": body.client_secret})
    encrypted = fernet.encrypt(creds_json.encode()).decode()

    # Valida o token antes de salvar
    try:
        from app.services.partner_center_service import get_partner_center_token
        get_partner_center_token(body.partner_tenant_id, body.client_id, body.client_secret)
    except Exception as exc:
        raise HTTPException(400, f"Falha ao validar credenciais Partner Center: {exc}")

    cfg = (db.query(PartnerCenterConfig)
           .filter(PartnerCenterConfig.workspace_id == member.workspace_id)
           .first())
    if cfg:
        cfg.partner_tenant_id = body.partner_tenant_id
        cfg.encrypted_credentials = encrypted
        cfg.gdap_security_group_id = body.gdap_security_group_id
        cfg.updated_at = datetime.utcnow()
    else:
        cfg = PartnerCenterConfig(
            workspace_id=member.workspace_id,
            partner_tenant_id=body.partner_tenant_id,
            encrypted_credentials=encrypted,
            gdap_security_group_id=body.gdap_security_group_id,
        )
        db.add(cfg)

    db.commit()
    return {"configured": True, "partner_tenant_id": body.partner_tenant_id}


@ws_router.get("/partner-center/customers/{customer_tenant_id}/subscriptions")
def list_customer_subs(
    customer_tenant_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    from app.services.partner_center_service import (
        decrypt_pc_credentials, get_partner_center_token, list_customer_subscriptions,
    )
    creds = decrypt_pc_credentials(db, member.workspace_id)
    if not creds:
        raise HTTPException(400, "Partner Center não configurado.")
    try:
        pc_token = get_partner_center_token(
            creds["partner_tenant_id"], creds["client_id"], creds["client_secret"]
        )
        subs = list_customer_subscriptions(pc_token, customer_tenant_id)
    except Exception as exc:
        raise HTTPException(400, str(exc))
    return {"subscriptions": subs}


@ws_router.post("/partner-center/customers/{customer_tenant_id}/subscriptions/{subscription_id}/suspend")
def suspend_sub(
    customer_tenant_id: str,
    subscription_id: str,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    if not _is_approver(member, db):
        raise HTTPException(403, "Apenas admins e owners podem suspender assinaturas.")

    from app.services.partner_center_service import (
        decrypt_pc_credentials, get_partner_center_token, suspend_subscription,
    )
    creds = decrypt_pc_credentials(db, member.workspace_id)
    if not creds:
        raise HTTPException(400, "Partner Center não configurado.")
    try:
        pc_token = get_partner_center_token(
            creds["partner_tenant_id"], creds["client_id"], creds["client_secret"]
        )
        result = suspend_subscription(pc_token, customer_tenant_id, subscription_id)
    except Exception as exc:
        raise HTTPException(400, str(exc))

    # Audit
    save_security_action(
        db, member.workspace_id, None, "manual",
        "suspend_subscription", result,
        auto_executed=False, executed_by=member.user.id,
    )
    db.commit()
    return result


@ws_router.post("/partner-center/customers/{customer_tenant_id}/subscriptions/{subscription_id}/reactivate")
def reactivate_sub(
    customer_tenant_id: str,
    subscription_id: str,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    if not _is_approver(member, db):
        raise HTTPException(403, "Apenas admins e owners podem reativar assinaturas.")

    from app.services.partner_center_service import (
        decrypt_pc_credentials, get_partner_center_token, reactivate_subscription,
    )
    creds = decrypt_pc_credentials(db, member.workspace_id)
    if not creds:
        raise HTTPException(400, "Partner Center não configurado.")
    try:
        pc_token = get_partner_center_token(
            creds["partner_tenant_id"], creds["client_id"], creds["client_secret"]
        )
        result = reactivate_subscription(pc_token, customer_tenant_id, subscription_id)
    except Exception as exc:
        raise HTTPException(400, str(exc))

    save_security_action(
        db, member.workspace_id, None, "manual",
        "reactivate_subscription", result,
        auto_executed=False, executed_by=member.user.id,
    )
    db.commit()
    return result


# ── Incident Responses ────────────────────────────────────────────────────────

@ws_router.get("/incident-responses")
def list_ir(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    q = db.query(IncidentResponse).filter(
        IncidentResponse.workspace_id == member.workspace_id
    )
    if status:
        q = q.filter(IncidentResponse.status == status)
    total = q.count()
    items = (q.order_by(IncidentResponse.created_at.desc())
             .offset((page - 1) * page_size)
             .limit(page_size)
             .all())
    return {"items": [ir_to_dict(i) for i in items], "total": total,
            "page": page, "page_size": page_size}


@ws_router.get("/incident-responses/templates")
def list_ir_templates(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    return {
        "templates": [
            get_template_preview(t) for t in TEMPLATES
        ]
    }


@ws_router.post("/incident-responses")
def create_ir(
    body: CreateIRBody,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    try:
        ir = create_incident_response(
            db=db,
            workspace_id=member.workspace_id,
            user_id=member.user.id,
            template_type=body.template_type,
            title=body.title,
            affected_users=body.affected_users,
            target_resource_ids=body.target_resource_ids,
            target_subscription_id=body.target_subscription_id,
            target_customer_tenant_id=body.target_customer_tenant_id,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    # Notifica admins/owners
    try:
        from app.services.notification_service import push_notification
        push_notification(db, member.workspace_id, "security_alert",
            f"🚨 Nova resposta a incidente criada: {ir.title} — aguardando aprovação",
            link_to=f"/security/incident-responses/{ir.id}")
    except Exception:
        pass

    return ir_to_dict(ir)


@ws_router.get("/incident-responses/{ir_id}")
def get_ir(
    ir_id: UUID,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    ir = db.query(IncidentResponse).filter(
        IncidentResponse.id == ir_id,
        IncidentResponse.workspace_id == member.workspace_id,
    ).first()
    if not ir:
        raise HTTPException(404, "Incident Response não encontrado.")
    return ir_to_dict(ir)


@ws_router.post("/incident-responses/{ir_id}/approve")
def approve_ir(
    ir_id: UUID,
    body: ApproveIRBody,
    background_tasks: BackgroundTasks,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    if not _is_approver(member, db):
        raise HTTPException(403, "Apenas admins e owners podem aprovar respostas a incidente.")

    ir = db.query(IncidentResponse).filter(
        IncidentResponse.id == ir_id,
        IncidentResponse.workspace_id == member.workspace_id,
    ).first()
    if not ir:
        raise HTTPException(404, "Incident Response não encontrado.")
    if ir.status != "pending_approval":
        raise HTTPException(400, f"Status atual é '{ir.status}'. Só pode aprovar quando 'pending_approval'.")

    ir.status = "approved"
    if body.notes:
        ir.notes = (ir.notes or "") + f"\n[Aprovação] {body.notes}"
    db.commit()

    # Executa em background para não bloquear o request
    background_tasks.add_task(
        _run_ir_background, str(ir_id), str(member.user.id)
    )
    db.refresh(ir)
    return {**ir_to_dict(ir), "message": "Execução iniciada em background."}


def _run_ir_background(ir_id: str, approved_by_id: str):
    """Worker function para executar IR em background."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        execute_incident_response(db, ir_id, approved_by_id)
    except Exception as exc:
        logger.exception("Erro ao executar IR %s: %s", ir_id, exc)
    finally:
        db.close()


@ws_router.post("/incident-responses/{ir_id}/cancel")
def cancel_ir(
    ir_id: UUID,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    ir = db.query(IncidentResponse).filter(
        IncidentResponse.id == ir_id,
        IncidentResponse.workspace_id == member.workspace_id,
    ).first()
    if not ir:
        raise HTTPException(404, "Incident Response não encontrado.")
    if ir.status not in ("pending_approval", "approved"):
        raise HTTPException(400, f"Não é possível cancelar um IR com status '{ir.status}'.")

    is_own = str(ir.triggered_by) == str(member.user.id)
    if not is_own and not _is_approver(member, db):
        raise HTTPException(403, "Sem permissão para cancelar este Incident Response.")

    ir.status = "cancelled"
    ir.completed_at = datetime.utcnow()
    db.commit()
    return {"cancelled": True, "id": str(ir_id)}
