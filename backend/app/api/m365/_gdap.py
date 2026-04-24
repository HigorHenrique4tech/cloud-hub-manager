"""M365 GDAP (Granular Delegated Admin Privileges) endpoints.

Todas as chamadas GDAP usam o App Registration do Partner Center
(com DelegatedAdminRelationship.ReadWrite.All), não as credenciais M365 do workspace.
"""

import asyncio

import requests
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import Organization
from app.services.email_service import send_gdap_invite_email
from app.services.log_service import log_activity

from . import ws_router
from ._helpers import _get_org_plan, _require_enterprise, _require_master_org
from ._schemas import CreateGdapRelationshipRequest, SendGdapInviteRequest

GRAPH_V1 = "https://graph.microsoft.com/v1.0"
GDAP_BASE = f"{GRAPH_V1}/tenantRelationships/delegatedAdminRelationships"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pc_graph_token(db: Session, workspace_id) -> str:
    """Obtém token Graph API usando credenciais do Partner Center."""
    from app.services.partner_center_service import decrypt_pc_credentials, get_graph_token
    creds = decrypt_pc_credentials(db, workspace_id)
    if not creds:
        raise HTTPException(
            status_code=400,
            detail="Partner Center não configurado. Configure em Segurança > Config > Partner Center."
        )
    return get_graph_token(creds["partner_tenant_id"], creds["client_id"], creds["client_secret"])


def _graph_get(token: str, url: str) -> dict:
    resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"Graph API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()


def _graph_post(token: str, url: str, body: dict) -> dict:
    resp = requests.post(
        url, json=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=30,
    )
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"Graph API error {resp.status_code}: {resp.text[:300]}")
    return resp.json()


def _serialize_rel(r: dict) -> dict:
    return {
        "id": r.get("id"),
        "displayName": r.get("displayName"),
        "status": r.get("status"),
        "duration": r.get("duration"),
        "createdDateTime": r.get("createdDateTime"),
        "endDateTime": r.get("endDateTime"),
        "autoExtendDuration": r.get("autoExtendDuration"),
        "inviteUrl": r.get("inviteUrl"),
        "customer": r.get("customer"),
        "accessDetails": r.get("accessDetails"),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@ws_router.get("/gdap/relationships")
async def ws_list_gdap_relationships(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    _require_master_org(member, db)
    try:
        token = await asyncio.to_thread(_pc_graph_token, db, member.workspace_id)
        data = await asyncio.to_thread(_graph_get, token, GDAP_BASE)
        return {"relationships": [_serialize_rel(r) for r in data.get("value", [])]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@ws_router.get("/gdap/customers")
async def ws_list_gdap_customers(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    _require_master_org(member, db)
    try:
        token = await asyncio.to_thread(_pc_graph_token, db, member.workspace_id)
        data = await asyncio.to_thread(
            _graph_get, token,
            f"{GRAPH_V1}/tenantRelationships/delegatedAdminCustomers"
        )
        return {"customers": data.get("value", [])}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@ws_router.post("/gdap/relationships", status_code=201)
async def ws_create_gdap_relationship(
    body: CreateGdapRelationshipRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    _require_master_org(member, db)
    try:
        token = await asyncio.to_thread(_pc_graph_token, db, member.workspace_id)

        rel_body = {
            "displayName": body.display_name,
            "duration": f"P{body.duration_days}D",
            "autoExtendDuration": "P180D" if body.auto_extend else "PT0S",
            "accessDetails": {
                "unifiedRoles": [{"roleDefinitionId": rid} for rid in body.roles]
            },
        }
        if body.customer_tenant_id:
            rel_body["customer"] = {"tenantId": body.customer_tenant_id}

        rel = await asyncio.to_thread(_graph_post, token, GDAP_BASE, rel_body)
        rel_id = rel["id"]

        await asyncio.to_thread(
            _graph_post, token,
            f"{GDAP_BASE}/{rel_id}/requests",
            {"action": "lockForApproval"},
        )
        result = await asyncio.to_thread(_graph_get, token, f"{GDAP_BASE}/{rel_id}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    log_activity(db, member.user, "gdap.create", "GDAPRelationship",
                 resource_name=body.display_name, provider="m365",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/gdap/relationships/{relationship_id}/terminate")
async def ws_terminate_gdap_relationship(
    relationship_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    _require_master_org(member, db)
    try:
        token = await asyncio.to_thread(_pc_graph_token, db, member.workspace_id)
        result = await asyncio.to_thread(
            _graph_post, token,
            f"{GDAP_BASE}/{relationship_id}/requests",
            {"action": "terminate"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    log_activity(db, member.user, "gdap.terminate", "GDAPRelationship",
                 resource_name=relationship_id, provider="m365",
                 organization_id=member.organization_id, workspace_id=member.workspace_id)
    return result


@ws_router.post("/gdap/relationships/{relationship_id}/send-invite")
async def ws_send_gdap_invite(
    relationship_id: str,
    body: SendGdapInviteRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    _require_master_org(member, db)
    try:
        token = await asyncio.to_thread(_pc_graph_token, db, member.workspace_id)
        rel = await asyncio.to_thread(_graph_get, token, f"{GDAP_BASE}/{relationship_id}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    invite_url = rel.get("inviteUrl")
    if not invite_url:
        raise HTTPException(
            status_code=400,
            detail="Relação ainda não tem inviteUrl (status não é approvalPending)"
        )
    rel_name = rel.get("displayName", "Relação GDAP")
    roles = [r.get("roleDefinitionId", "") for r in rel.get("accessDetails", {}).get("unifiedRoles", [])]
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    org_name = org.name if org else "CloudAtlas"
    from app.services.branding_service import get_branding as _gb
    _brand = _gb(org, db) if org else None
    sent, failed = [], []
    for email in body.emails:
        ok = send_gdap_invite_email(email, rel_name, roles, invite_url, org_name, branding=_brand)
        (sent if ok else failed).append(email)
    return {"sent": sent, "failed": failed}
