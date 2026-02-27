"""
Microsoft 365 REST API — workspace-scoped integration + MSP master tenant summary.

Workspace endpoints: /orgs/{org_slug}/workspaces/{workspace_id}/m365/...
Org-level endpoint:  /orgs/{org_slug}/m365/tenants  (MSP master only)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import get_current_member, require_org_permission, require_permission
from app.database import get_db
from app.models.db_models import CloudAccount, Organization, Workspace
from app.services.auth_service import decrypt_credential, encrypt_credential
from app.services.m365_service import M365AuthError, M365Service

logger = logging.getLogger(__name__)

# ── Schemas ───────────────────────────────────────────────────────────────────


class M365CredentialsIn(BaseModel):
    tenant_id: str
    client_id: str
    client_secret: str
    label: str = "M365 Tenant"
    tenant_domain: str = ""   # e.g. contoso.onmicrosoft.com (display only)


class AddMemberRequest(BaseModel):
    user_id: str
    roles: list = []   # [] = member, ["owner"] = owner


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_org_plan(db: Session, organization_id) -> str:
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    return (org.plan_tier if org and org.plan_tier else "free").lower()


def _require_enterprise(plan: str, feature: str = "Microsoft 365"):
    if plan != "enterprise":
        raise HTTPException(
            status_code=403,
            detail=f"Recurso '{feature}' requer plano Enterprise.",
        )


def _get_m365_account(db: Session, workspace_id) -> Optional[CloudAccount]:
    return (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == workspace_id,
            CloudAccount.provider == "m365",
            CloudAccount.is_active == True,
        )
        .first()
    )


def _build_service(acct: CloudAccount) -> M365Service:
    creds = decrypt_credential(acct.encrypted_data)
    return M365Service(
        tenant_id=creds["tenant_id"],
        client_id=creds["client_id"],
        client_secret=creds["client_secret"],
    )


def _acct_to_dict(acct: Optional[CloudAccount]) -> dict:
    if not acct:
        return {"connected": False, "tenant_domain": None, "label": None, "account_id": None}
    return {
        "connected": True,
        "tenant_domain": acct.account_id,   # account_id stores the domain
        "label": acct.label,
        "account_id": str(acct.id),
    }


# ── Workspace Router ──────────────────────────────────────────────────────────

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/m365",
    tags=["Microsoft 365 (workspace)"],
)


@ws_router.get("/credentials")
async def get_credentials(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Check M365 connection status for this workspace."""
    acct = _get_m365_account(db, member.workspace_id)
    return _acct_to_dict(acct)


@ws_router.post("/credentials")
async def save_credentials(
    body: M365CredentialsIn,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Save (upsert) M365 tenant credentials for this workspace."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    encrypted = encrypt_credential(
        {
            "tenant_id": body.tenant_id,
            "client_id": body.client_id,
            "client_secret": body.client_secret,
        }
    )

    acct = _get_m365_account(db, member.workspace_id)
    if acct:
        acct.encrypted_data = encrypted
        acct.label = body.label
        acct.account_id = body.tenant_domain
    else:
        acct = CloudAccount(
            workspace_id=member.workspace_id,
            provider="m365",
            label=body.label,
            account_id=body.tenant_domain,
            encrypted_data=encrypted,
            created_by=member.user.id,
        )
        db.add(acct)

    db.commit()
    db.refresh(acct)
    return _acct_to_dict(acct)


@ws_router.delete("/credentials")
async def delete_credentials(
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Remove M365 credentials for this workspace."""
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    db.delete(acct)
    db.commit()
    return {"detail": "M365 credentials removed"}


@ws_router.get("/overview")
async def get_overview(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return M365 tenant overview: users, licenses, teams."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        return svc.get_overview()
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 overview error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 data")


@ws_router.get("/users")
async def get_users(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return list of M365 users with license, MFA, and last sign-in info."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        return {"users": svc.get_users()}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 users error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 users")


@ws_router.get("/licenses")
async def get_licenses(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return M365 license SKU usage."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        return {"licenses": svc.get_licenses()}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 licenses error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 licenses")


@ws_router.get("/teams")
async def get_teams(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return list of Microsoft Teams."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        return {"teams": svc.get_teams()}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 teams error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 teams")


@ws_router.get("/security")
async def get_security(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return M365 security report: MFA coverage and risky users."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        return svc.get_security_overview()
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 security error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 security data")


@ws_router.get("/teams/{team_id}/members")
async def get_team_members(
    team_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return the member list for a specific Team."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        return {"members": svc.get_team_members(team_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 team members error for %s: %s", team_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch team members")


@ws_router.post("/teams/{team_id}/members")
async def add_team_member(
    team_id: str,
    body: AddMemberRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Add a user to a Team. Requires TeamMember.ReadWrite.All in the Azure AD App."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        result = svc.add_team_member(team_id, body.user_id, body.roles)
        return {"detail": "Membro adicionado com sucesso", "member": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 add team member error for team %s: %s", team_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao adicionar membro: {exc}")


# ── Org-level Router (MSP Master) ─────────────────────────────────────────────

org_router = APIRouter(
    prefix="/orgs",
    tags=["Microsoft 365 (MSP)"],
)


@org_router.get("/{org_slug}/m365/tenants")
async def list_m365_tenants(
    member: MemberContext = Depends(require_org_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """
    Return M365 tenant summary for all partner orgs under this master org.
    Enterprise master orgs only.
    """
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not master_org or master_org.plan_tier != "enterprise":
        raise HTTPException(status_code=403, detail="Recurso exclusivo do plano Enterprise.")
    if master_org.org_type not in ("master", "standalone"):
        raise HTTPException(status_code=403, detail="Apenas organizações master podem ver tenants dos parceiros.")

    partners = (
        db.query(Organization)
        .filter(Organization.parent_org_id == master_org.id)
        .order_by(Organization.created_at.asc())
        .all()
    )

    results = []
    for partner in partners:
        # Collect all workspaces in this partner org
        workspaces = (
            db.query(Workspace)
            .filter(Workspace.organization_id == partner.id, Workspace.is_active == True)
            .all()
        )
        for ws in workspaces:
            acct = _get_m365_account(db, ws.id)
            entry = {
                "org_name": partner.name,
                "org_slug": partner.slug,
                "workspace_name": ws.name,
                "workspace_id": str(ws.id),
                "tenant_domain": acct.account_id if acct else None,
                "connected": acct is not None,
                "overview": None,
                "error": None,
            }
            if acct:
                try:
                    svc = _build_service(acct)
                    entry["overview"] = svc.get_overview()
                except Exception as exc:
                    logger.warning(
                        "M365 overview failed for ws %s (org %s): %s",
                        ws.id, partner.slug, exc,
                    )
                    entry["error"] = str(exc)
            results.append(entry)

    return {"tenants": results}
