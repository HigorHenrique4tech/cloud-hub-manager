"""M365 GDAP (Granular Delegated Admin Privileges) endpoints."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import Organization
from app.services.m365_service import M365AuthError, GRAPH_V1
from app.services.email_service import send_gdap_invite_email
from app.services.log_service import log_activity

from . import ws_router
from ._helpers import _get_org_plan, _require_enterprise, _require_master_org, _get_service_or_404, _run
from ._schemas import CreateGdapRelationshipRequest, SendGdapInviteRequest


@ws_router.get("/gdap/relationships")
async def ws_list_gdap_relationships(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    _require_master_org(member, db)
    svc = _get_service_or_404(db, member.workspace_id)
    try:
        return {"relationships": await _run(svc.get_gdap_relationships)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
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
    svc = _get_service_or_404(db, member.workspace_id)
    try:
        return {"customers": await _run(svc.get_gdap_customers)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
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
    svc = _get_service_or_404(db, member.workspace_id)
    try:
        result = await _run(svc.create_gdap_relationship, body.display_name, body.duration_days, body.roles, body.auto_extend, body.customer_tenant_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
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
    svc = _get_service_or_404(db, member.workspace_id)
    try:
        result = await _run(svc.expire_gdap_relationship, relationship_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
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
    svc = _get_service_or_404(db, member.workspace_id)
    try:
        rel = await _run(svc._get, f"{GRAPH_V1}/tenantRelationships/delegatedAdminRelationships/{relationship_id}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    invite_url = rel.get("inviteUrl")
    if not invite_url:
        raise HTTPException(status_code=400, detail="Relação ainda não tem inviteUrl (status não é approvalPending)")
    rel_name = rel.get("displayName", "Relação GDAP")
    roles = [r.get("roleDefinitionId", "") for r in rel.get("accessDetails", {}).get("unifiedRoles", [])]
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    org_name = org.name if org else "CloudAtlas"
    sent, failed = [], []
    for email in body.emails:
        ok = send_gdap_invite_email(email, rel_name, roles, invite_url, org_name)
        (sent if ok else failed).append(email)
    return {"sent": sent, "failed": failed}
