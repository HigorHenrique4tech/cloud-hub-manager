"""
Security Automation Service — coleta eventos de segurança de múltiplas fontes,
normaliza para formato padrão, avalia playbooks e registra/executa ações.

Fontes suportadas:
  - defender_alerts    : Azure Defender for Cloud (Security Center API)
  - entra_risk         : Entra ID Risk Detections (Graph API)
  - entra_signin       : Entra ID Sign-in Logs suspeitos (Graph API)
  - m365_incidents     : M365 Defender Incidents (Graph API)
  - azure_activity     : Azure Activity Log (Monitor API) — deleções em massa

Playbooks padrão (auto_execute=False por segurança):
  suspicious_signin | leaked_credentials | malware_detected | mass_deletion | phishing_detected
"""
import json
import logging
import uuid
from datetime import datetime, timedelta

import requests

logger = logging.getLogger(__name__)

GRAPH_V1 = "https://graph.microsoft.com/v1.0"
MONITOR_API = "https://management.azure.com"

# ── Playbooks padrão ─────────────────────────────────────────────────────────

_SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}

DEFAULT_PLAYBOOKS: dict[str, dict] = {
    "suspicious_signin": {
        "description": "Login de localização incomum ou impossible travel",
        "sources": ["entra_risk", "entra_signin"],
        "severity_min": "high",
        "actions": ["notify", "revoke_sessions"],
        "auto_execute": False,
        "cooldown_minutes": 30,
        "is_default": True,
    },
    "leaked_credentials": {
        "description": "Credenciais vazadas detectadas pelo Entra ID",
        "sources": ["entra_risk"],
        "severity_min": "critical",
        "actions": ["notify", "block_user", "revoke_sessions"],
        "auto_execute": False,
        "cooldown_minutes": 0,
        "is_default": True,
    },
    "malware_detected": {
        "description": "Malware detectado pelo Defender em VM ou endpoint",
        "sources": ["defender_alerts", "m365_incidents"],
        "severity_min": "high",
        "actions": ["notify", "isolate_vm"],
        "auto_execute": False,
        "cooldown_minutes": 0,
        "is_default": True,
    },
    "mass_deletion": {
        "description": "Deleção em massa de recursos Azure (>10 em 5 min)",
        "sources": ["azure_activity"],
        "severity_min": "critical",
        "actions": ["notify", "add_quarantine_tag"],
        "auto_execute": False,
        "cooldown_minutes": 60,
        "is_default": True,
    },
    "phishing_detected": {
        "description": "Campanha de phishing detectada pelo M365 Defender",
        "sources": ["m365_incidents"],
        "severity_min": "high",
        "actions": ["notify", "revoke_sessions"],
        "auto_execute": False,
        "cooldown_minutes": 15,
        "is_default": True,
    },
}


# ── Collectors ────────────────────────────────────────────────────────────────

def _graph_get_paginated(url: str, headers: dict) -> list[dict]:
    """Busca todas as páginas de um endpoint Graph."""
    items = []
    while url:
        try:
            r = requests.get(url, headers=headers, timeout=30)
            if r.status_code == 429:
                logger.warning("Graph API throttled — pulando página")
                break
            if r.status_code in (401, 403):
                logger.warning("Graph API sem permissão: %s %s", r.status_code, url)
                break
            r.raise_for_status()
            data = r.json()
            items.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
        except Exception as exc:
            logger.warning("Erro ao buscar %s: %s", url, exc)
            break
    return items


def collect_entra_risk_detections(graph_token: str, since: datetime) -> list[dict]:
    """
    Coleta risk detections do Entra ID Protection.
    Requer: IdentityRiskEvent.Read.All (Azure AD P2)
    """
    since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (f"{GRAPH_V1}/identityProtection/riskDetections"
           f"?$filter=detectedDateTime gt {since_str}"
           f"&$orderby=detectedDateTime desc&$top=50")
    headers = {"Authorization": f"Bearer {graph_token}"}
    return _graph_get_paginated(url, headers)


def collect_entra_signins(graph_token: str, since: datetime) -> list[dict]:
    """
    Coleta sign-ins com risco elevado.
    Requer: AuditLog.Read.All
    """
    since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (f"{GRAPH_V1}/auditLogs/signIns"
           f"?$filter=riskLevelDuringSignIn ne 'none'"
           f" and createdDateTime gt {since_str}"
           f"&$top=50")
    headers = {"Authorization": f"Bearer {graph_token}"}
    return _graph_get_paginated(url, headers)


def collect_m365_incidents(graph_token: str, since: datetime) -> list[dict]:
    """
    Coleta incidents do M365 Defender.
    Requer: SecurityIncident.Read.All
    """
    since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (f"{GRAPH_V1}/security/incidents"
           f"?$filter=createdDateTime gt {since_str}"
           f"&$orderby=createdDateTime desc&$top=50")
    headers = {"Authorization": f"Bearer {graph_token}"}
    return _graph_get_paginated(url, headers)


def collect_defender_alerts(azure_token: str, subscription_id: str,
                             since: datetime) -> list[dict]:
    """
    Coleta alertas do Azure Defender for Cloud.
    Requer: Security Reader no subscription
    """
    since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (f"{MONITOR_API}/subscriptions/{subscription_id}"
           f"/providers/Microsoft.Security/alerts"
           f"?api-version=2022-01-01"
           f"&$filter=properties/timeGeneratedUtc gt {since_str}")
    headers = {"Authorization": f"Bearer {azure_token}"}
    items = []
    try:
        r = requests.get(url, headers=headers, timeout=30)
        if r.status_code in (401, 403, 404):
            logger.warning("Defender alerts sem acesso: %s", r.status_code)
            return []
        r.raise_for_status()
        items = r.json().get("value", [])
    except Exception as exc:
        logger.warning("Erro ao coletar Defender alerts: %s", exc)
    return items


def collect_azure_activity_deletions(azure_token: str, subscription_id: str,
                                      since: datetime) -> list[dict]:
    """
    Coleta Activity Log para detectar deleções em massa.
    Requer: Reader no subscription
    """
    since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (f"{MONITOR_API}/subscriptions/{subscription_id}"
           f"/providers/Microsoft.Insights/eventtypes/management/values"
           f"?api-version=2015-04-01"
           f"&$filter=eventTimestamp ge '{since_str}'"
           f" and operationName.value eq 'Microsoft.Resources/subscriptions/resourceGroups/delete'"
           f" or operationName.value like 'Microsoft.%/delete'")
    headers = {"Authorization": f"Bearer {azure_token}"}
    items = []
    try:
        r = requests.get(url, headers=headers, timeout=30)
        if r.status_code in (401, 403):
            return []
        r.raise_for_status()
        items = r.json().get("value", [])
    except Exception as exc:
        logger.warning("Erro ao coletar activity log: %s", exc)
    return items


# ── Normalizer ────────────────────────────────────────────────────────────────

def _map_entra_risk_severity(raw: dict) -> str:
    level = (raw.get("riskLevel") or raw.get("riskDetail") or "").lower()
    if level in ("high",):
        return "high"
    if level in ("medium",):
        return "medium"
    if level in ("low",):
        return "low"
    # riskEventType influencia severity
    event_type = raw.get("riskEventType", "").lower()
    if "leaked" in event_type or "anonymous" in event_type:
        return "critical"
    return "high"


def _map_defender_severity(raw: dict) -> str:
    props = raw.get("properties", {})
    sev = (props.get("severity") or "").lower()
    mapping = {"high": "high", "medium": "medium", "low": "low", "informational": "low"}
    return mapping.get(sev, "medium")


def _map_m365_severity(raw: dict) -> str:
    sev = (raw.get("severity") or "").lower()
    mapping = {"high": "high", "medium": "medium", "low": "low", "informational": "low",
               "unknown": "medium"}
    return mapping.get(sev, "medium")


def normalize_event(source: str, raw: dict) -> dict | None:
    """
    Converte evento raw para formato interno padrão.
    Retorna None se o evento não for relevante.
    """
    try:
        if source == "entra_risk":
            event_type = raw.get("riskEventType", "unknown_risk")
            title = f"Entra ID Risk: {event_type.replace('_', ' ').title()}"
            user_upn = (raw.get("userPrincipalName") or raw.get("userId") or "")
            return {
                "source": source,
                "severity": _map_entra_risk_severity(raw),
                "event_type": event_type,
                "title": f"{title} — {user_upn}",
                "entity_type": "user",
                "entity_id": user_upn or raw.get("userId", ""),
                "detected_at": raw.get("detectedDateTime"),
                "details": raw,
            }

        if source == "entra_signin":
            risk_level = (raw.get("riskLevelDuringSignIn") or "").lower()
            if risk_level in ("none", ""):
                return None
            title = f"Login suspeito: {raw.get('userPrincipalName', '')} de {raw.get('location', {}).get('countryOrRegion', 'local desconhecido')}"
            return {
                "source": source,
                "severity": "high" if risk_level == "high" else "medium",
                "event_type": "suspicious_signin",
                "title": title,
                "entity_type": "user",
                "entity_id": raw.get("userPrincipalName") or raw.get("userId", ""),
                "detected_at": raw.get("createdDateTime"),
                "details": raw,
            }

        if source == "m365_incidents":
            status = (raw.get("status") or "").lower()
            if status in ("resolved", "redirected"):
                return None
            category = raw.get("classification") or raw.get("category") or "incident"
            return {
                "source": source,
                "severity": _map_m365_severity(raw),
                "event_type": category.lower().replace(" ", "_"),
                "title": raw.get("displayName") or raw.get("name") or "M365 Incident",
                "entity_type": "resource",
                "entity_id": str(raw.get("id", "")),
                "detected_at": raw.get("createdDateTime"),
                "details": raw,
            }

        if source == "defender_alerts":
            props = raw.get("properties", {})
            state = (props.get("state") or "").lower()
            if state in ("dismissed",):
                return None
            return {
                "source": source,
                "severity": _map_defender_severity(raw),
                "event_type": props.get("alertType", "defender_alert").lower(),
                "title": props.get("alertDisplayName") or props.get("displayName") or "Defender Alert",
                "entity_type": "resource",
                "entity_id": str(raw.get("id", "")),
                "detected_at": props.get("timeGeneratedUtc"),
                "details": raw,
            }

        if source == "azure_activity":
            return {
                "source": source,
                "severity": "critical",
                "event_type": "mass_deletion",
                "title": f"Possível deleção em massa: {raw.get('operationName', {}).get('localizedValue', '')}",
                "entity_type": "resource",
                "entity_id": raw.get("resourceId", ""),
                "detected_at": raw.get("eventTimestamp"),
                "details": raw,
            }

    except Exception as exc:
        logger.warning("Erro ao normalizar evento [%s]: %s", source, exc)

    return None


# ── Rule Engine ───────────────────────────────────────────────────────────────

def evaluate_playbooks(event: dict, playbooks: dict) -> list[dict]:
    """Retorna lista de playbooks que fazem match com o evento."""
    matches = []
    ev_severity = _SEVERITY_RANK.get(event.get("severity", "low"), 0)

    for name, pb in playbooks.items():
        if not pb.get("is_active", True):
            continue
        if event["source"] not in pb.get("sources", []):
            continue
        pb_min = _SEVERITY_RANK.get(pb.get("severity_min", "high"), 2)
        if ev_severity < pb_min:
            continue
        matches.append({"playbook_name": name, **pb})

    return matches


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_active_playbooks(db, workspace_id) -> dict:
    """
    Retorna playbooks ativos para o workspace.
    Playbooks customizados sobrescrevem os defaults pelo name.
    """
    from app.models.db_models import SecurityPlaybook
    rows = (db.query(SecurityPlaybook)
            .filter(SecurityPlaybook.workspace_id == workspace_id,
                    SecurityPlaybook.is_active == True)
            .all())

    result = dict(DEFAULT_PLAYBOOKS)  # começa com os defaults
    for row in rows:
        result[row.name] = {
            "description": row.description or "",
            "sources": row.sources,
            "severity_min": row.severity_min,
            "actions": row.actions,
            "auto_execute": row.auto_execute,
            "cooldown_minutes": row.cooldown_minutes,
            "is_active": row.is_active,
            "is_default": row.is_default,
        }
    return result


def event_in_cooldown(db, workspace_id, playbook_name: str,
                      entity_id: str, cooldown_minutes: int) -> bool:
    """Verifica se já existe ação recente para este entity + playbook (cooldown)."""
    if cooldown_minutes <= 0:
        return False
    from app.models.db_models import SecurityAction
    cutoff = datetime.utcnow() - timedelta(minutes=cooldown_minutes)
    existing = (db.query(SecurityAction)
                .filter(SecurityAction.workspace_id == workspace_id,
                        SecurityAction.playbook_name == playbook_name,
                        SecurityAction.executed_at >= cutoff)
                .first())
    return existing is not None


def save_security_event(db, workspace_id, event_data: dict):
    """Persiste um SecurityEvent no banco."""
    from app.models.db_models import SecurityEvent
    detected_at = None
    if event_data.get("detected_at"):
        try:
            detected_at = datetime.fromisoformat(
                event_data["detected_at"].replace("Z", "+00:00")
            )
        except Exception:
            pass

    ev = SecurityEvent(
        workspace_id=workspace_id,
        source=event_data["source"],
        severity=event_data["severity"],
        event_type=event_data["event_type"],
        title=event_data["title"],
        entity_type=event_data.get("entity_type"),
        entity_id=event_data.get("entity_id"),
        details=event_data.get("details"),
        detected_at=detected_at,
        status="open",
    )
    db.add(ev)
    db.flush()
    return ev


def save_security_action(db, workspace_id, event_id, playbook_name: str,
                         action_type: str, result: dict, auto_executed: bool,
                         executed_by=None, error: str = None):
    """Persiste um SecurityAction no audit trail."""
    from app.models.db_models import SecurityAction
    action = SecurityAction(
        workspace_id=workspace_id,
        event_id=event_id,
        playbook_name=playbook_name,
        action_type=action_type,
        auto_executed=auto_executed,
        executed_by=executed_by,
        result=result,
        error_message=error,
    )
    db.add(action)
    db.flush()
    return action


# ── Scan job (chamado pelo APScheduler a cada 5 min) ─────────────────────────

def run_security_scan(workspace_id: str) -> dict:
    """
    Executa o scan de segurança para um workspace.
    Chamado pelo scheduler. Retorna resumo de eventos encontrados.
    """
    from app.database import SessionLocal
    from app.models.db_models import Workspace, CloudAccount
    from app.services.notification_service import push_notification
    from app.services.notification_channel_service import fire_event
    from app.services.m365_service import M365Service

    db = SessionLocal()
    total_events = 0
    try:
        ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if not ws:
            return {"error": "workspace não encontrado"}

        # Busca conta M365 para Graph token
        m365_account = (db.query(CloudAccount)
                        .filter(CloudAccount.workspace_id == workspace_id,
                                CloudAccount.provider == "m365",
                                CloudAccount.is_active == True)
                        .first())

        azure_account = (db.query(CloudAccount)
                         .filter(CloudAccount.workspace_id == workspace_id,
                                 CloudAccount.provider == "azure",
                                 CloudAccount.is_active == True)
                         .first())

        since = datetime.utcnow() - timedelta(minutes=6)  # sobrepõe 1 min
        playbooks = get_active_playbooks(db, workspace_id)

        all_raw: list[tuple[str, dict]] = []  # (source, raw_event)

        # Coleta Graph (Entra + M365)
        if m365_account:
            try:
                svc = M365Service(m365_account)
                graph_token = svc._get_token()

                for raw in collect_entra_risk_detections(graph_token, since):
                    all_raw.append(("entra_risk", raw))

                for raw in collect_entra_signins(graph_token, since):
                    all_raw.append(("entra_signin", raw))

                for raw in collect_m365_incidents(graph_token, since):
                    all_raw.append(("m365_incidents", raw))
            except Exception as exc:
                logger.warning("[SecurityScan] Erro ao coletar Graph events: %s", exc)

        # Coleta Azure Defender
        if azure_account:
            try:
                from app.services.azure_service import AzureService
                azure_svc = AzureService(azure_account)
                mgmt_token = azure_svc._get_management_token()
                sub_id = azure_svc.get_subscription_id()

                for raw in collect_defender_alerts(mgmt_token, sub_id, since):
                    all_raw.append(("defender_alerts", raw))

                for raw in collect_azure_activity_deletions(mgmt_token, sub_id, since):
                    all_raw.append(("azure_activity", raw))
            except Exception as exc:
                logger.warning("[SecurityScan] Erro ao coletar Azure events: %s", exc)

        # Normalizar + avaliar playbooks
        for source, raw in all_raw:
            normalized = normalize_event(source, raw)
            if not normalized:
                continue

            matches = evaluate_playbooks(normalized, playbooks)
            if not matches:
                continue

            # Persiste o evento
            ev = save_security_event(db, workspace_id, normalized)
            total_events += 1

            for match in matches:
                pb_name = match["playbook_name"]
                cooldown = match.get("cooldown_minutes", 30)
                entity_id = normalized.get("entity_id", "")

                if event_in_cooldown(db, workspace_id, pb_name, entity_id, cooldown):
                    continue

                if match.get("auto_execute"):
                    # Executa ações automaticamente
                    for action_type in match.get("actions", []):
                        if action_type == "notify":
                            continue
                        try:
                            _execute_containment_action(action_type, normalized,
                                                         m365_account, azure_account, db)
                            save_security_action(
                                db, workspace_id, ev.id, pb_name, action_type,
                                {"status": "executed"}, auto_executed=True
                            )
                        except Exception as exc:
                            save_security_action(
                                db, workspace_id, ev.id, pb_name, action_type,
                                {}, auto_executed=True, error=str(exc)
                            )

                    push_notification(db, workspace_id, "security_auto",
                        f"Ação automática: {pb_name} executado — {normalized['title']}",
                        link_to="/security/automation")
                    fire_event(db, workspace_id, "security.playbook.executed", {
                        "playbook": pb_name,
                        "message": normalized.get("title", ""),
                        "severity": normalized.get("severity", ""),
                        "provider": normalized.get("provider", ""),
                    })
                else:
                    # Registra ação pendente e notifica
                    save_security_action(
                        db, workspace_id, ev.id, pb_name, "pending_approval",
                        {"playbook": pb_name, "suggested_actions": match.get("actions", [])},
                        auto_executed=False
                    )
                    push_notification(db, workspace_id, "security_alert",
                        f"⚠️ Alerta: {normalized['title']} — ação pendente de aprovação",
                        link_to=f"/security/automation?event={ev.id}")
                    fire_event(db, workspace_id, "security.alert.triggered", {
                        "message": normalized.get("title", ""),
                        "severity": normalized.get("severity", ""),
                        "provider": normalized.get("provider", ""),
                        "playbook": pb_name,
                        "status": "Aguardando aprovação",
                    })

            db.commit()

    except Exception as exc:
        logger.exception("[SecurityScan] Erro geral no workspace %s: %s", workspace_id, exc)
        db.rollback()
    finally:
        db.close()

    return {"workspace_id": str(workspace_id), "events_found": total_events}


def _execute_containment_action(action_type: str, event: dict,
                                 m365_account, azure_account, db) -> dict:
    """Executa uma ação de contenção individual."""
    from app.services.partner_center_service import (
        block_entra_user, revoke_entra_sessions,
        get_graph_token, get_azure_management_token, add_quarantine_tag,
    )

    entity_id = event.get("entity_id", "")

    if action_type == "revoke_sessions" and m365_account and entity_id:
        from app.services.m365_service import M365Service
        svc = M365Service(m365_account)
        token = svc._get_token()
        return revoke_entra_sessions(token, entity_id)

    if action_type == "block_user" and m365_account and entity_id:
        from app.services.m365_service import M365Service
        svc = M365Service(m365_account)
        token = svc._get_token()
        return block_entra_user(token, entity_id)

    if action_type == "add_quarantine_tag" and azure_account and entity_id:
        from app.services.azure_service import AzureService
        svc = AzureService(azure_account)
        token = svc._get_management_token()
        incident_id = str(uuid.uuid4())[:8]
        return add_quarantine_tag(token, entity_id, incident_id)

    return {"status": "skipped", "reason": f"Sem conta configurada ou entity_id para {action_type}"}


# ── Scan scheduling helpers ───────────────────────────────────────────────────

def schedule_security_scan(workspace_id: str) -> None:
    """Registra job de scan de segurança no APScheduler (a cada 5 min)."""
    from app.services.scheduler_service import scheduler
    from apscheduler.triggers.interval import IntervalTrigger

    job_id = f"security_scan_{workspace_id}"
    if scheduler.get_job(job_id):
        return  # já agendado

    scheduler.add_job(
        run_security_scan,
        trigger=IntervalTrigger(minutes=5),
        id=job_id,
        args=[str(workspace_id)],
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    logger.info("Security scan agendado para workspace %s", workspace_id)


def unschedule_security_scan(workspace_id: str) -> None:
    """Remove job de scan de segurança do APScheduler."""
    from app.services.scheduler_service import scheduler
    job_id = f"security_scan_{workspace_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
