"""
Partner Center Service — integração com Microsoft Partner Center API para
gerenciamento de assinaturas CSP.

Auth: OAuth2 client_credentials com audience https://api.partnercenter.microsoft.com
Requisito: App Registration cadastrado no Partner Center (seção App Management),
           além do Azure AD. Sem esse cadastro, retorna 401 mesmo com credenciais válidas.

GDAP: O app/usuário precisa ter o role Admin Agent no partner tenant para chamar
      endpoints de gerenciamento de subscriptions de clientes.
"""
import json
import logging
from datetime import datetime

import requests

logger = logging.getLogger(__name__)

PC_API = "https://api.partnercenter.microsoft.com"
PC_SCOPE = "https://api.partnercenter.microsoft.com/.default"
GRAPH_V1 = "https://graph.microsoft.com/v1.0"


# ── Auth ─────────────────────────────────────────────────────────────────────

def get_partner_center_token(partner_tenant_id: str, client_id: str,
                              client_secret: str) -> str:
    """Obtém access token para a Partner Center API."""
    url = f"https://login.microsoftonline.com/{partner_tenant_id}/oauth2/v2.0/token"
    resp = requests.post(url, data={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": PC_SCOPE,
    }, timeout=30)
    try:
        resp.raise_for_status()
    except requests.HTTPError:
        body = {}
        try:
            body = resp.json()
        except Exception:
            pass
        raise ValueError(
            f"Falha OAuth Partner Center (HTTP {resp.status_code}): "
            f"{body.get('error_description') or body.get('error') or resp.text[:300]}"
        )
    return resp.json()["access_token"]


def get_graph_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    """Obtém access token para a Graph API (ações Entra ID)."""
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    resp = requests.post(url, data={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://graph.microsoft.com/.default",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()["access_token"]


# ── Customer subscriptions ───────────────────────────────────────────────────

def list_customer_subscriptions(pc_token: str, customer_tenant_id: str) -> list[dict]:
    """
    Lista assinaturas de um cliente CSP.
    GET /v1/customers/{customer_tenant_id}/subscriptions
    """
    url = f"{PC_API}/v1/customers/{customer_tenant_id}/subscriptions"
    headers = {"Authorization": f"Bearer {pc_token}"}
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Cliente '{customer_tenant_id}' não encontrado no Partner Center.")
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items", [])
    return [
        {
            "id": s.get("id"),
            "friendly_name": s.get("friendlyName", ""),
            "offer_name": s.get("offerName", ""),
            "status": s.get("status", ""),
            "quantity": s.get("quantity", 1),
            "unit_type": s.get("unitType", ""),
            "creation_date": s.get("creationDate"),
            "commitment_end_date": s.get("commitmentEndDate"),
        }
        for s in items
    ]


def _patch_subscription(pc_token: str, customer_tenant_id: str,
                        subscription_id: str, new_status: str) -> dict:
    """Atualiza status de uma assinatura CSP."""
    url = f"{PC_API}/v1/customers/{customer_tenant_id}/subscriptions/{subscription_id}"
    headers = {
        "Authorization": f"Bearer {pc_token}",
        "Content-Type": "application/json",
    }
    # Primeiro busca a assinatura atual para obter quantity e outros campos obrigatórios
    get_resp = requests.get(url, headers=headers, timeout=30)
    if get_resp.status_code == 404:
        raise ValueError(f"Assinatura '{subscription_id}' não encontrada para o cliente '{customer_tenant_id}'.")
    get_resp.raise_for_status()
    current = get_resp.json()

    payload = {
        "id": subscription_id,
        "status": new_status,
        "quantity": current.get("quantity", 1),
        "friendlyName": current.get("friendlyName", ""),
        "offerUri": current.get("offerUri", ""),
    }

    patch_resp = requests.patch(url, headers=headers, json=payload, timeout=30)
    if patch_resp.status_code == 409:
        raise ValueError(f"Conflito ao alterar assinatura: já está no status '{current.get('status')}'.")
    patch_resp.raise_for_status()

    result = patch_resp.json() if patch_resp.text else payload
    return {
        "subscription_id": subscription_id,
        "previous_status": current.get("status"),
        "new_status": new_status,
        "friendly_name": current.get("friendlyName", ""),
        "changed_at": datetime.utcnow().isoformat(),
    }


def suspend_subscription(pc_token: str, customer_tenant_id: str,
                         subscription_id: str) -> dict:
    """Suspende uma assinatura Azure CSP."""
    return _patch_subscription(pc_token, customer_tenant_id, subscription_id, "suspended")


def reactivate_subscription(pc_token: str, customer_tenant_id: str,
                             subscription_id: str) -> dict:
    """Reativa uma assinatura Azure CSP previamente suspensa."""
    return _patch_subscription(pc_token, customer_tenant_id, subscription_id, "active")


# ── Entra ID containment actions (Graph API) ─────────────────────────────────

def block_entra_user(graph_token: str, user_id_or_upn: str) -> dict:
    """
    Desabilita conta no Entra ID.
    PATCH /users/{id} → accountEnabled: false
    """
    url = f"{GRAPH_V1}/users/{user_id_or_upn}"
    resp = requests.patch(url, headers={
        "Authorization": f"Bearer {graph_token}",
        "Content-Type": "application/json",
    }, json={"accountEnabled": False}, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Usuário '{user_id_or_upn}' não encontrado no Entra ID.")
    resp.raise_for_status()
    return {"user": user_id_or_upn, "accountEnabled": False, "action": "block_user"}


def unblock_entra_user(graph_token: str, user_id_or_upn: str) -> dict:
    """Reabilita conta no Entra ID."""
    url = f"{GRAPH_V1}/users/{user_id_or_upn}"
    resp = requests.patch(url, headers={
        "Authorization": f"Bearer {graph_token}",
        "Content-Type": "application/json",
    }, json={"accountEnabled": True}, timeout=30)
    resp.raise_for_status()
    return {"user": user_id_or_upn, "accountEnabled": True, "action": "unblock_user"}


def revoke_entra_sessions(graph_token: str, user_id_or_upn: str) -> dict:
    """
    Revoga todos os tokens de refresh do usuário.
    POST /users/{id}/revokeSignInSessions
    """
    url = f"{GRAPH_V1}/users/{user_id_or_upn}/revokeSignInSessions"
    resp = requests.post(url, headers={
        "Authorization": f"Bearer {graph_token}",
        "Content-Type": "application/json",
    }, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Usuário '{user_id_or_upn}' não encontrado.")
    resp.raise_for_status()
    result = resp.json() if resp.text else {}
    return {
        "user": user_id_or_upn,
        "sessions_revoked": result.get("value", True),
        "action": "revoke_sessions",
    }


# ── Azure Management containment actions ─────────────────────────────────────

def add_quarantine_tag(azure_token: str, resource_id: str,
                       incident_id: str) -> dict:
    """
    Adiciona tag security:quarantine no recurso Azure.
    PATCH /subscriptions/{sub}/resourceGroups/{rg}/providers/.../tags
    """
    url = f"https://management.azure.com{resource_id}/providers/Microsoft.Resources/tags/default"
    params = {"api-version": "2021-04-01"}
    resp = requests.patch(url, headers={
        "Authorization": f"Bearer {azure_token}",
        "Content-Type": "application/json",
    }, params=params, json={
        "operation": "Merge",
        "properties": {
            "tags": {
                "security": "quarantine",
                "incident_id": incident_id,
                "quarantined_at": datetime.utcnow().isoformat(),
            }
        }
    }, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Recurso '{resource_id}' não encontrado.")
    resp.raise_for_status()
    return {"resource_id": resource_id, "tagged": True, "action": "add_quarantine_tag"}


def deallocate_vm(azure_token: str, subscription_id: str,
                  resource_group: str, vm_name: str) -> dict:
    """
    Inicia deallocate de VM (stop + deallocate).
    POST /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{name}/deallocate
    """
    url = (
        f"https://management.azure.com/subscriptions/{subscription_id}"
        f"/resourceGroups/{resource_group}/providers/Microsoft.Compute"
        f"/virtualMachines/{vm_name}/deallocate"
    )
    params = {"api-version": "2023-09-01"}
    resp = requests.post(url, headers={
        "Authorization": f"Bearer {azure_token}",
    }, params=params, timeout=30)
    if resp.status_code in (200, 202):
        return {
            "vm": vm_name,
            "resource_group": resource_group,
            "action": "deallocate_vm",
            "status": "started",
            "async": resp.status_code == 202,
        }
    resp.raise_for_status()
    return {}


def get_azure_management_token(tenant_id: str, client_id: str,
                                client_secret: str) -> str:
    """Token para Azure Management API."""
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    resp = requests.post(url, data={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://management.azure.com/.default",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()["access_token"]


# ── Config helpers ────────────────────────────────────────────────────────────

def decrypt_pc_credentials(db, workspace_id) -> dict | None:
    """Lê e descriptografa credenciais Partner Center do workspace."""
    from app.models.db_models import PartnerCenterConfig
    from app.services.auth_service import get_org_fernet
    from app.models.db_models import Workspace

    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        return None

    cfg = db.query(PartnerCenterConfig).filter(
        PartnerCenterConfig.workspace_id == workspace_id
    ).first()
    if not cfg:
        return None

    try:
        org = ws.organization
        fernet = get_org_fernet(db, org)
        raw = fernet.decrypt(cfg.encrypted_credentials.encode()).decode()
        creds = json.loads(raw)
        creds["partner_tenant_id"] = cfg.partner_tenant_id
        return creds
    except Exception as exc:
        logger.error("Falha ao descriptografar Partner Center credentials: %s", exc)
        return None
