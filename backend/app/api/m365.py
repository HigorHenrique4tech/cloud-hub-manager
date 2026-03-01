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


class CreateUserRequest(BaseModel):
    display_name: str
    upn: str                        # userPrincipalName e.g. joao@contoso.com
    password: str
    first_name: str = ""
    last_name: str = ""
    job_title: str = ""
    department: str = ""
    usage_location: str = "BR"
    mail_nickname: str = ""
    account_enabled: bool = True
    force_change_password: bool = True


class CreateGroupRequest(BaseModel):
    display_name: str
    description: str = ""
    mail_nickname: str = ""
    group_type: str = "m365"        # "m365" | "security"
    visibility: str = "Private"     # "Private" | "Public" (M365 groups only)


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


@ws_router.get("/groups")
async def get_groups(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return list of all M365/Security/Distribution groups with type classification."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        return {"groups": svc.get_groups()}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 groups error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 groups")


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
        err_str = str(exc)
        logger.error("M365 add team member error for team %s: %s", team_id, exc)
        # Groups synced from on-premises AD are read-only in the cloud
        if "403" in err_str or "Forbidden" in err_str:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Não foi possível adicionar o membro. Este grupo pode ser sincronizado "
                    "a partir do Active Directory local (on-premises) e só pode ser gerenciado "
                    "diretamente no AD — não via Microsoft Graph."
                ),
            )
        raise HTTPException(status_code=502, detail=f"Falha ao adicionar membro: {exc}")


@ws_router.post("/users")
async def create_user(
    body: CreateUserRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Create a new user in the M365 tenant. Requires User.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        result = svc.create_user(
            display_name=body.display_name,
            upn=body.upn,
            password=body.password,
            first_name=body.first_name,
            last_name=body.last_name,
            job_title=body.job_title,
            department=body.department,
            usage_location=body.usage_location,
            mail_nickname=body.mail_nickname,
            account_enabled=body.account_enabled,
            force_change_password=body.force_change_password,
        )
        return {"detail": "Usuário criado com sucesso", "user": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 create user error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Falha ao criar usuário: {exc}")


@ws_router.post("/groups")
async def create_group(
    body: CreateGroupRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Create a new M365 Group or Security Group. Requires Group.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        result = svc.create_group(
            display_name=body.display_name,
            mail_nickname=body.mail_nickname,
            description=body.description,
            group_type=body.group_type,
            visibility=body.visibility,
        )
        return {"detail": "Grupo criado com sucesso", "group": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 create group error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Falha ao criar grupo: {exc}")


@ws_router.get("/groups/{group_id}/members")
async def get_group_members(
    group_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return the member list for a specific Group (M365/Security/Distribution)."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        return {"members": svc.get_team_members(group_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 group members error for %s: %s", group_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch group members")


@ws_router.post("/groups/{group_id}/members")
async def add_group_member(
    group_id: str,
    body: AddMemberRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Add a user to a Group. Requires Group.ReadWrite.All in the Azure AD App."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        result = svc.add_team_member(group_id, body.user_id, body.roles)
        return {"detail": "Membro adicionado com sucesso", "member": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        err_str = str(exc)
        logger.error("M365 add group member error for group %s: %s", group_id, exc)
        if "403" in err_str or "Forbidden" in err_str:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Não foi possível adicionar o membro. Este grupo pode ser sincronizado "
                    "a partir do Active Directory local (on-premises) e só pode ser gerenciado "
                    "diretamente no AD — não via Microsoft Graph."
                ),
            )
        raise HTTPException(status_code=502, detail=f"Falha ao adicionar membro: {exc}")


@ws_router.get("/users/{user_id}/auth-methods")
async def get_user_auth_methods(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return registered authentication methods for a single user (MFA details)."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        return {"methods": svc.get_user_auth_methods(user_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 auth methods error for user %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch authentication methods")


@ws_router.post("/users/{user_id}/revoke-sessions")
async def revoke_user_sessions(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Revoke all active sign-in sessions for a user. Requires User.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        result = svc.revoke_user_sessions(user_id)
        return {"detail": "Sessões revogadas com sucesso", "result": result}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 revoke sessions error for user %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao revogar sessões: {exc}")


@ws_router.delete("/users/{user_id}/auth-methods/{method_type}/{method_id}")
async def delete_user_auth_method(
    user_id: str,
    method_type: str,
    method_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Delete a specific authentication method for a user. Requires UserAuthenticationMethod.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _build_service(acct)
        svc.delete_user_auth_method(user_id, method_type, method_id)
        return {"detail": "Método de autenticação removido com sucesso"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 delete auth method error for user %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao remover método: {exc}")


class ToggleUserRequest(BaseModel):
    enabled: bool


class ResetPasswordRequest(BaseModel):
    new_password: str
    force_change: bool = True


class CreateTapRequest(BaseModel):
    lifetime_minutes: int = 60
    is_usable_once: bool = True


@ws_router.patch("/users/{user_id}/toggle")
async def toggle_user_account(
    user_id: str,
    body: ToggleUserRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Enable or disable a user account. Requires User.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _build_service(acct)
        return svc.toggle_user_account(user_id, body.enabled)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 toggle user error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao atualizar conta: {exc}")


@ws_router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    body: ResetPasswordRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Reset a user's password. Requires User.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _build_service(acct)
        return svc.reset_user_password(user_id, body.new_password, body.force_change)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 reset password error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao resetar senha: {exc}")


@ws_router.post("/users/{user_id}/tap")
async def create_tap(
    user_id: str,
    body: CreateTapRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Create a Temporary Access Pass for a user. Requires UserAuthenticationMethod.ReadWrite.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _build_service(acct)
        return svc.create_tap(user_id, body.lifetime_minutes, body.is_usable_once)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 create TAP error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao criar acesso temporário: {exc}")


@ws_router.get("/users/{user_id}/groups")
async def get_user_groups(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return the groups a user belongs to. Requires Directory.Read.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _build_service(acct)
        return {"groups": svc.get_user_groups(user_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get user groups error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail="Falha ao carregar grupos do usuário")


@ws_router.get("/service-health")
async def get_service_health(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return current M365 service health. Requires ServiceHealth.Read.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _build_service(acct)
        return {"services": svc.get_service_health()}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 service health error: %s", exc)
        raise HTTPException(status_code=502, detail="Falha ao carregar saúde dos serviços")


# ── License assignment ─────────────────────────────────────────────────────────


class AssignLicenseRequest(BaseModel):
    user_id: str


@ws_router.get("/licenses/{sku_id}/users")
async def get_license_users(
    sku_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return all users who have the given license SKU assigned."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _build_service(acct)
        return {"users": svc.get_license_users(sku_id)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get_license_users error: %s", exc)
        raise HTTPException(status_code=502, detail="Falha ao listar usuários da licença")


@ws_router.post("/licenses/{sku_id}/assign")
async def assign_license(
    sku_id: str,
    body: AssignLicenseRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Assign a license SKU to a user."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _build_service(acct)
        svc.assign_license(body.user_id, sku_id)
        return {"detail": "Licença atribuída com sucesso"}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 assign_license error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Falha ao atribuir licença: {exc}")


@ws_router.delete("/licenses/{sku_id}/assign/{user_id}")
async def remove_license(
    sku_id: str,
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Remove a license SKU from a user."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _build_service(acct)
        svc.remove_license(user_id, sku_id)
        return {"detail": "Licença removida com sucesso"}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 remove_license error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Falha ao remover licença: {exc}")


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
