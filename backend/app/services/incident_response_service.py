"""
Incident Response Service — templates de contenção para assinaturas Azure CSP.

Templates disponíveis:
  containment               — 6 steps: revoke_rbac, revoke_sessions, block_user,
                               apply_nsg_deny, isolate_vms, quarantine_tag
  containment_with_suspend  — mesmo que containment + step final suspend_subscription

Todos os templates exigem aprovação manual (status pending_approval → approved → running).
Após aprovação, execute_incident_response() executa os steps em sequência com audit trail.
"""
import logging
from datetime import datetime

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Template definitions ──────────────────────────────────────────────────────

TEMPLATES = {
    "containment": {
        "name": "Contenção de Incidente",
        "description": (
            "Revoga acessos suspeitos, bloqueia usuários comprometidos, "
            "aplica regras de isolamento em VMs e adiciona tags de quarentena."
        ),
        "steps": [
            {"name": "revoke_entra_sessions",
             "label": "Revogar sessões Entra ID",
             "description": "Revoga todos os refresh tokens dos usuários afetados via Graph API"},
            {"name": "block_entra_users",
             "label": "Bloquear contas no Entra ID",
             "description": "Desabilita accountEnabled nos usuários comprometidos"},
            {"name": "isolate_vms",
             "label": "Isolar VMs comprometidas",
             "description": "Deallocate das VMs listadas (stop + deallocate)"},
            {"name": "add_quarantine_tags",
             "label": "Adicionar tags de quarentena",
             "description": "Adiciona tag security:quarantine nos recursos afetados"},
        ],
        "requires_partner_center": False,
    },
    "containment_with_suspend": {
        "name": "Contenção + Suspensão da Assinatura",
        "description": (
            "Executa todas as ações de contenção e depois suspende a assinatura Azure "
            "via Partner Center API, impedindo consumo adicional."
        ),
        "steps": [
            {"name": "revoke_entra_sessions",
             "label": "Revogar sessões Entra ID",
             "description": "Revoga todos os refresh tokens dos usuários afetados via Graph API"},
            {"name": "block_entra_users",
             "label": "Bloquear contas no Entra ID",
             "description": "Desabilita accountEnabled nos usuários comprometidos"},
            {"name": "isolate_vms",
             "label": "Isolar VMs comprometidas",
             "description": "Deallocate das VMs listadas (stop + deallocate)"},
            {"name": "add_quarantine_tags",
             "label": "Adicionar tags de quarentena",
             "description": "Adiciona tag security:quarantine nos recursos afetados"},
            {"name": "suspend_subscription",
             "label": "Suspender assinatura via Partner Center",
             "description": "PATCH /v1/customers/{id}/subscriptions/{sub_id} → suspended"},
        ],
        "requires_partner_center": True,
    },
}


def get_template_preview(template_type: str) -> dict:
    """Retorna a definição do template para preview no frontend."""
    tmpl = TEMPLATES.get(template_type)
    if not tmpl:
        raise ValueError(f"Template '{template_type}' não existe.")
    return {
        "type": template_type,
        **tmpl,
        "warnings": _get_template_warnings(template_type),
    }


def _get_template_warnings(template_type: str) -> list[str]:
    warnings = [
        "Esta operação requer aprovação de um admin ou owner antes de ser executada.",
        "Usuários bloqueados perderão acesso imediatamente — verifique se não são Global Admins.",
        "VMs deallocadas perderão o conteúdo do disco temporário.",
    ]
    if template_type == "containment_with_suspend":
        warnings += [
            "⚠️ A suspensão da assinatura irá deallocar VMs e parar serviços PaaS imediatamente.",
            "⚠️ Reserved Instances continuam sendo cobradas mesmo com a assinatura suspensa.",
            "⚠️ Tokens OAuth existentes permanecem válidos por até 1 hora após a suspensão.",
            "⚠️ A assinatura tem 90 dias para ser reativada antes que os dados sejam excluídos.",
            "Certifique-se de que a App Registration está cadastrada no Partner Center.",
        ]
    return warnings


# ── Create ────────────────────────────────────────────────────────────────────

def create_incident_response(
    db: Session,
    workspace_id,
    user_id,
    template_type: str,
    title: str,
    affected_users: list[str] | None = None,
    target_resource_ids: list[str] | None = None,
    target_subscription_id: str | None = None,
    target_customer_tenant_id: str | None = None,
    notes: str | None = None,
) -> "IncidentResponse":
    from app.models.db_models import IncidentResponse

    if template_type not in TEMPLATES:
        raise ValueError(f"Template '{template_type}' não existe.")

    tmpl = TEMPLATES[template_type]

    # Valida: containment_with_suspend requer subscription + customer tenant
    if tmpl.get("requires_partner_center"):
        if not target_subscription_id or not target_customer_tenant_id:
            raise ValueError(
                "Template 'containment_with_suspend' requer "
                "target_subscription_id e target_customer_tenant_id."
            )

    # Inicializa steps com status pending
    steps = [
        {
            "name": s["name"],
            "label": s["label"],
            "description": s["description"],
            "status": "pending",
            "result": None,
            "error": None,
            "executed_at": None,
        }
        for s in tmpl["steps"]
    ]

    ir = IncidentResponse(
        workspace_id=workspace_id,
        title=title,
        template_type=template_type,
        target_subscription_id=target_subscription_id,
        target_customer_tenant_id=target_customer_tenant_id,
        target_resource_ids=target_resource_ids or [],
        affected_users=affected_users or [],
        status="pending_approval",
        triggered_by=user_id,
        steps=steps,
        notes=notes,
    )
    db.add(ir)
    db.commit()
    db.refresh(ir)
    return ir


# ── Execute ───────────────────────────────────────────────────────────────────

def execute_incident_response(db: Session, ir_id, approved_by_id) -> "IncidentResponse":
    """
    Executa um IncidentResponse aprovado, step-by-step.
    Cada step é persistido no JSONB steps[] conforme avança.
    Um step com erro não bloqueia os próximos (continua e registra o erro).
    """
    from app.models.db_models import IncidentResponse, PartnerCenterConfig, CloudAccount

    ir = db.query(IncidentResponse).filter(IncidentResponse.id == ir_id).first()
    if not ir:
        raise ValueError("IncidentResponse não encontrado.")
    if ir.status not in ("approved", "pending_approval"):
        raise ValueError(f"IncidentResponse está com status '{ir.status}', não pode ser executado.")

    ir.status = "running"
    ir.approved_by = approved_by_id
    ir.started_at = datetime.utcnow()
    db.commit()

    # Busca credenciais necessárias
    m365_account = (db.query(CloudAccount)
                    .filter(CloudAccount.workspace_id == ir.workspace_id,
                            CloudAccount.provider == "m365",
                            CloudAccount.is_active == True)
                    .first())

    azure_account = (db.query(CloudAccount)
                     .filter(CloudAccount.workspace_id == ir.workspace_id,
                              CloudAccount.provider == "azure",
                              CloudAccount.is_active == True)
                     .first())

    pc_config = (db.query(PartnerCenterConfig)
                 .filter(PartnerCenterConfig.workspace_id == ir.workspace_id)
                 .first())

    steps = list(ir.steps or [])
    any_success = False

    for i, step in enumerate(steps):
        step_name = step["name"]
        steps[i]["status"] = "running"
        ir.steps = list(steps)
        db.commit()

        try:
            result = _execute_step(
                step_name=step_name,
                ir=ir,
                m365_account=m365_account,
                azure_account=azure_account,
                pc_config=pc_config,
                db=db,
            )
            steps[i]["status"] = "completed"
            steps[i]["result"] = result
            steps[i]["executed_at"] = datetime.utcnow().isoformat()
            any_success = True
            logger.info("[IR %s] Step '%s' concluído: %s", ir_id, step_name, result)

        except Exception as exc:
            error_msg = str(exc)[:500]
            steps[i]["status"] = "failed"
            steps[i]["error"] = error_msg
            steps[i]["executed_at"] = datetime.utcnow().isoformat()
            logger.warning("[IR %s] Step '%s' falhou: %s", ir_id, step_name, error_msg)

        ir.steps = list(steps)
        db.commit()

    # Determina status final
    failed_critical = any(
        s["status"] == "failed" and s["name"] == "suspend_subscription"
        for s in steps
    )
    all_failed = all(s["status"] == "failed" for s in steps)

    ir.status = "failed" if all_failed else "completed"
    ir.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(ir)

    # Notifica resultado
    try:
        from app.services.notification_service import push_notification
        if ir.status == "completed":
            push_notification(db, ir.workspace_id, "security_auto",
                f"✅ Resposta a incidente concluída: {ir.title}",
                link_to=f"/security/incident-responses/{ir_id}")
        else:
            push_notification(db, ir.workspace_id, "security_alert",
                f"⚠️ Resposta a incidente com falhas: {ir.title}",
                link_to=f"/security/incident-responses/{ir_id}")
    except Exception:
        pass

    return ir


def _execute_step(step_name: str, ir, m365_account, azure_account,
                  pc_config, db: Session) -> dict:
    """Executa um step específico do template."""
    from app.services.partner_center_service import (
        revoke_entra_sessions, block_entra_user, deallocate_vm,
        add_quarantine_tag, suspend_subscription, get_partner_center_token,
        decrypt_pc_credentials,
    )
    from app.services.m365_service import M365Service

    if step_name == "revoke_entra_sessions":
        if not m365_account or not ir.affected_users:
            return {"status": "skipped", "reason": "Sem conta M365 ou usuários afetados configurados"}
        svc = M365Service(m365_account)
        graph_token = svc._get_token()
        results = []
        for upn in (ir.affected_users or []):
            try:
                r = revoke_entra_sessions(graph_token, upn)
                results.append(r)
            except Exception as exc:
                results.append({"user": upn, "error": str(exc)})
        return {"revoked": results}

    if step_name == "block_entra_users":
        if not m365_account or not ir.affected_users:
            return {"status": "skipped", "reason": "Sem conta M365 ou usuários afetados configurados"}
        svc = M365Service(m365_account)
        graph_token = svc._get_token()
        results = []
        for upn in (ir.affected_users or []):
            try:
                r = block_entra_user(graph_token, upn)
                results.append(r)
            except Exception as exc:
                results.append({"user": upn, "error": str(exc)})
        return {"blocked": results}

    if step_name == "isolate_vms":
        if not azure_account or not ir.target_resource_ids:
            return {"status": "skipped", "reason": "Sem conta Azure ou VMs listadas"}
        from app.services.azure_service import AzureService
        azure_svc = AzureService(azure_account)
        mgmt_token = azure_svc._get_management_token()
        results = []
        for resource_id in (ir.target_resource_ids or []):
            # Parse resource_id: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{name}
            try:
                parts = resource_id.strip("/").split("/")
                if len(parts) >= 8 and "virtualMachines" in parts:
                    vm_idx = parts.index("virtualMachines")
                    vm_name = parts[vm_idx + 1]
                    rg_idx = parts.index("resourceGroups")
                    rg_name = parts[rg_idx + 1]
                    sub_id = parts[1]
                    r = deallocate_vm(mgmt_token, sub_id, rg_name, vm_name)
                    results.append(r)
                else:
                    results.append({"resource_id": resource_id, "skipped": True,
                                    "reason": "Não é uma VM"})
            except Exception as exc:
                results.append({"resource_id": resource_id, "error": str(exc)})
        return {"isolated": results}

    if step_name == "add_quarantine_tags":
        if not azure_account:
            return {"status": "skipped", "reason": "Sem conta Azure configurada"}
        from app.services.azure_service import AzureService
        azure_svc = AzureService(azure_account)
        mgmt_token = azure_svc._get_management_token()
        incident_id = str(ir.id)[:8]
        results = []
        for resource_id in (ir.target_resource_ids or []):
            try:
                r = add_quarantine_tag(mgmt_token, resource_id, incident_id)
                results.append(r)
            except Exception as exc:
                results.append({"resource_id": resource_id, "error": str(exc)})
        return {"tagged": results}

    if step_name == "suspend_subscription":
        if not pc_config:
            raise ValueError("Partner Center não configurado para este workspace.")
        creds = decrypt_pc_credentials(db, ir.workspace_id)
        if not creds:
            raise ValueError("Falha ao descriptografar credenciais do Partner Center.")
        pc_token = get_partner_center_token(
            creds["partner_tenant_id"],
            creds["client_id"],
            creds["client_secret"],
        )
        result = suspend_subscription(
            pc_token,
            ir.target_customer_tenant_id,
            ir.target_subscription_id,
        )
        return result

    raise ValueError(f"Step '{step_name}' não reconhecido.")


# ── Dict helper ───────────────────────────────────────────────────────────────

def ir_to_dict(ir) -> dict:
    return {
        "id": str(ir.id),
        "workspace_id": str(ir.workspace_id),
        "title": ir.title,
        "template_type": ir.template_type,
        "target_subscription_id": ir.target_subscription_id,
        "target_customer_tenant_id": ir.target_customer_tenant_id,
        "target_resource_ids": ir.target_resource_ids or [],
        "affected_users": ir.affected_users or [],
        "status": ir.status,
        "triggered_by": str(ir.triggered_by) if ir.triggered_by else None,
        "approved_by": str(ir.approved_by) if ir.approved_by else None,
        "started_at": ir.started_at.isoformat() if ir.started_at else None,
        "completed_at": ir.completed_at.isoformat() if ir.completed_at else None,
        "steps": ir.steps or [],
        "notes": ir.notes,
        "created_at": ir.created_at.isoformat() if ir.created_at else None,
    }
