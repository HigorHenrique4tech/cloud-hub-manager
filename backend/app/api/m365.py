"""
Microsoft 365 REST API — workspace-scoped integration + MSP master tenant summary.

Workspace endpoints: /orgs/{org_slug}/workspaces/{workspace_id}/m365/...
Org-level endpoint:  /orgs/{org_slug}/m365/tenants  (MSP master only)
"""

import asyncio
import logging
import threading
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
from app.core.cache import cache_get, cache_set, cache_delete, cache_invalidate_prefix

logger = logging.getLogger(__name__)

# ── M365Service instance cache ────────────────────────────────────────────────
# Reuses msal.ConfidentialClientApplication across requests so the MSAL
# internal token cache persists (avoids a round-trip to Azure AD per request).
_svc_cache: dict = {}
_svc_lock = threading.Lock()


def _get_cached_service(acct) -> "M365Service":
    """Return a cached M365Service for this cloud account, building it if necessary."""
    key = acct.id
    with _svc_lock:
        if key not in _svc_cache:
            _svc_cache[key] = _build_service(acct)
        return _svc_cache[key]


def _evict_service(acct) -> None:
    """Remove a cached M365Service (call when credentials change)."""
    with _svc_lock:
        _svc_cache.pop(acct.id, None)


async def _run(fn, *args, **kwargs):
    """Run a synchronous function in a thread pool, freeing the asyncio event loop."""
    return await asyncio.to_thread(fn, *args, **kwargs)


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


class MailboxSettingsUpdate(BaseModel):
    auto_reply_enabled: Optional[bool] = None
    auto_reply_message: Optional[str] = None
    timezone: Optional[str] = None


class CreateTeamRequest(BaseModel):
    display_name: str
    description: str = ""
    visibility: str = "Private"     # "Private" | "Public"


class UpdateTeamRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None


class CreateChannelRequest(BaseModel):
    display_name: str
    description: str = ""
    channel_type: str = "standard"  # "standard" | "private"


class UpdateRoleRequest(BaseModel):
    roles: list = []                # [] = member, ["owner"] = owner


class InviteGuestRequest(BaseModel):
    email: str
    display_name: str = ""
    redirect_url: str = "https://myapps.microsoft.com"
    message: str = ""


class OffboardRequest(BaseModel):
    disable_account: bool = True
    revoke_sessions: bool = True
    remove_licenses: bool = False
    auto_reply_message: Optional[str] = None


class CreateDistributionListRequest(BaseModel):
    display_name: str
    mail_nickname: str = ""
    description: str = ""


class CreateSharedMailboxRequest(BaseModel):
    display_name: str
    alias: str
    domain: str
    description: str = ""


class AddMailboxDelegateRequest(BaseModel):
    delegate_upn: str
    permission_type: str  # full_access | send_as | send_on_behalf


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


def _get_service_or_404(db: Session, workspace_id) -> M365Service:
    acct = _get_m365_account(db, workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="Conta M365 não encontrada. Configure as credenciais primeiro.")
    return _get_cached_service(acct)


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
    _evict_service(acct)
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
    _evict_service(acct)
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
    cache_key = f"m365:{member.workspace_id}:overview"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct)
        result = await _run(svc.get_overview)
        cache_set(cache_key, result, ttl=120)
        return result
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

    cache_key = f"m365:{member.workspace_id}:users"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct)
        result = {"users": await _run(svc.get_users)}
        cache_set(cache_key, result, ttl=300)
        return result
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

    cache_key = f"m365:{member.workspace_id}:licenses"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct)
        result = {"licenses": await _run(svc.get_licenses)}
        cache_set(cache_key, result, ttl=300)
        return result
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

    cache_key = f"m365:{member.workspace_id}:groups"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct)
        result = {"groups": await _run(svc.get_groups)}
        cache_set(cache_key, result, ttl=300)
        return result
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

    cache_key = f"m365:{member.workspace_id}:teams"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct)
        result = {"teams": await _run(svc.get_teams)}
        cache_set(cache_key, result, ttl=300)
        return result
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

    cache_key = f"m365:{member.workspace_id}:mfa"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct)
        result = await _run(svc.get_security_overview)
        cache_set(cache_key, result, ttl=300)
        return result
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
        svc = _get_cached_service(acct)
        return {"members": await _run(svc.get_team_members, team_id)}
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
        svc = _get_cached_service(acct)
        result = await _run(svc.add_team_member, team_id, body.user_id, body.roles)
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
        svc = _get_cached_service(acct)
        result = await _run(
            svc.create_user,
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
        cache_delete(f"m365:{member.workspace_id}:users")
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
        svc = _get_cached_service(acct)
        result = await _run(
            svc.create_group,
            display_name=body.display_name,
            mail_nickname=body.mail_nickname,
            description=body.description,
            group_type=body.group_type,
            visibility=body.visibility,
        )
        cache_delete(f"m365:{member.workspace_id}:groups")
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
        svc = _get_cached_service(acct)
        return {"members": await _run(svc.get_team_members, group_id)}
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
        svc = _get_cached_service(acct)
        result = await _run(svc.add_team_member, group_id, body.user_id, body.roles)
        cache_delete(f"m365:{member.workspace_id}:groups")
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


@ws_router.delete("/groups/{group_id}/members/{user_id}")
async def remove_group_member(
    group_id: str,
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Remove a user from a Group."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    try:
        svc = _get_cached_service(acct)
        result = await _run(svc.remove_team_member, group_id, user_id)
        cache_delete(f"m365:{member.workspace_id}:groups")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 remove group member error for group %s: %s", group_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao remover membro: {exc}")


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
        svc = _get_cached_service(acct)
        return {"methods": await _run(svc.get_user_auth_methods, user_id)}
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
        svc = _get_cached_service(acct)
        result = await _run(svc.revoke_user_sessions, user_id)
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
        svc = _get_cached_service(acct)
        await _run(svc.delete_user_auth_method, user_id, method_type, method_id)
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
        svc = _get_cached_service(acct)
        return await _run(svc.toggle_user_account, user_id, body.enabled)
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
        svc = _get_cached_service(acct)
        return await _run(svc.reset_user_password, user_id, body.new_password, body.force_change)
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
        svc = _get_cached_service(acct)
        return await _run(svc.create_tap, user_id, body.lifetime_minutes, body.is_usable_once)
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
        svc = _get_cached_service(acct)
        return {"groups": await _run(svc.get_user_groups, user_id)}
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
        svc = _get_cached_service(acct)
        return {"services": await _run(svc.get_service_health)}
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
        svc = _get_cached_service(acct)
        return {"users": await _run(svc.get_license_users, sku_id)}
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
        svc = _get_cached_service(acct)
        await _run(svc.assign_license, body.user_id, sku_id)
        cache_delete(f"m365:{member.workspace_id}:licenses")
        cache_delete(f"m365:{member.workspace_id}:users")
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
        svc = _get_cached_service(acct)
        await _run(svc.remove_license, user_id, sku_id)
        cache_delete(f"m365:{member.workspace_id}:licenses")
        cache_delete(f"m365:{member.workspace_id}:users")
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
                    svc = _get_cached_service(acct)
                    entry["overview"] = await _run(svc.get_overview)
                except Exception as exc:
                    logger.warning(
                        "M365 overview failed for ws %s (org %s): %s",
                        ws.id, partner.slug, exc,
                    )
                    entry["error"] = str(exc)
            results.append(entry)

    return {"tenants": results}


# ═══════════════════════════════════════════════════════════════════════════════
# SharePoint Admin Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@ws_router.get("/sharepoint/sites")
async def ws_m365_list_sites(
    search: Optional[str] = None,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    cache_key = f"m365:{member.workspace_id}:sp_sites"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_sites, search=search)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 sharepoint sites error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch SharePoint sites")


@ws_router.get("/sharepoint/sites/{site_id}")
async def ws_m365_get_site(
    site_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_site, site_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get site error for %s: %s", site_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch SharePoint site")


@ws_router.get("/sharepoint/sites/{site_id}/drives")
async def ws_m365_get_site_drives(
    site_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_site_drives, site_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get site drives error for %s: %s", site_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch site drives")


@ws_router.get("/sharepoint/drives/{drive_id}/items")
async def ws_m365_get_drive_items(
    drive_id: str,
    folder_id: Optional[str] = None,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_drive_items, drive_id, folder_id=folder_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get drive items error for %s: %s", drive_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch drive items")


@ws_router.get("/sharepoint/usage")
async def ws_m365_sharepoint_usage(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    cache_key = f"m365:{member.workspace_id}:sp_usage"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_sharepoint_usage)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 sharepoint usage error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch SharePoint usage")


# ═══════════════════════════════════════════════════════════════════════════════
# Exchange Admin Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@ws_router.get("/exchange/mailboxes")
async def ws_m365_list_mailboxes(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:mailboxes"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_mailboxes)
        cache_set(cache_key, result, ttl=180)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 mailboxes error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch mailboxes")


@ws_router.get("/exchange/users/{user_id}/mailbox-settings")
async def ws_m365_get_mailbox_settings(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_mailbox_settings, user_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 mailbox settings error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=str(exc))


@ws_router.patch("/exchange/users/{user_id}/mailbox-settings")
async def ws_m365_update_mailbox_settings(
    user_id: str,
    body: MailboxSettingsUpdate,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.update_mailbox_settings, user_id, body.model_dump(exclude_none=True))
        cache_delete(f"m365:{member.workspace_id}:mailboxes")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/exchange/activity")
async def ws_m365_email_activity(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:email_activity"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_email_activity)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 email activity error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch email activity")


@ws_router.get("/exchange/domains")
async def ws_m365_domains(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:domains"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = {"domains": await _run(svc.get_domains)}
        cache_set(cache_key, result, ttl=3600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 domains error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch domains")


@ws_router.get("/exchange/shared-mailboxes")
async def ws_m365_shared_mailboxes(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:shared_mailboxes"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_shared_mailboxes)
        cache_set(cache_key, result, ttl=180)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 shared mailboxes error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch shared mailboxes")


@ws_router.post("/exchange/shared-mailboxes")
async def ws_m365_create_shared_mailbox(
    body: CreateSharedMailboxRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(
            svc.create_shared_mailbox,
            display_name=body.display_name,
            alias=body.alias,
            domain=body.domain,
            description=body.description,
        )
        cache_delete(f"m365:{member.workspace_id}:shared_mailboxes")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/exchange/shared-mailboxes/{mailbox_id}/delegates")
async def ws_m365_mailbox_delegates(
    mailbox_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        user = await _run(svc._get, f"/users/{mailbox_id}?$select=userPrincipalName")
        upn = user.get("userPrincipalName")
        if not upn:
            raise HTTPException(status_code=404, detail="Mailbox not found")
        return await _run(svc.get_mailbox_delegates, upn)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/exchange/shared-mailboxes/{mailbox_id}/delegates")
async def ws_m365_add_mailbox_delegate(
    mailbox_id: str,
    body: AddMailboxDelegateRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        user = await _run(svc._get, f"/users/{mailbox_id}?$select=userPrincipalName")
        upn = user.get("userPrincipalName")
        return await _run(svc.add_mailbox_delegate, upn, body.delegate_upn, body.permission_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/exchange/shared-mailboxes/{mailbox_id}/delegates/{permission_type}/{delegate_upn:path}")
async def ws_m365_remove_mailbox_delegate(
    mailbox_id: str,
    permission_type: str,
    delegate_upn: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        user = await _run(svc._get, f"/users/{mailbox_id}?$select=userPrincipalName")
        upn = user.get("userPrincipalName")
        return await _run(svc.remove_mailbox_delegate, upn, delegate_upn, permission_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/exchange/distribution-lists")
async def ws_m365_distribution_lists(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    cache_key = f"m365:{member.workspace_id}:dist_lists"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_distribution_lists)
        cache_set(cache_key, result, ttl=180)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 distribution lists error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch distribution lists")


@ws_router.post("/exchange/distribution-lists")
async def ws_m365_create_distribution_list(
    body: CreateDistributionListRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        # Graph API does not support creating traditional Exchange distribution lists.
        # Create an M365 Group (mail-enabled, supports email distribution) as the equivalent.
        result = await _run(
            svc.create_group,
            display_name=body.display_name,
            mail_nickname=body.mail_nickname,
            description=body.description,
            group_type="m365",
            visibility="Private",
        )
        cache_delete(f"m365:{member.workspace_id}:dist_lists")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/exchange/distribution-lists/{group_id}/members")
async def ws_m365_dist_list_members(
    group_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_distribution_list_members, group_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 dist list members error for %s: %s", group_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch distribution list members")


@ws_router.post("/exchange/distribution-lists/{group_id}/members")
async def ws_m365_add_dist_list_member(
    group_id: str,
    body: AddMemberRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.add_distribution_list_member, group_id, body.user_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/exchange/distribution-lists/{group_id}/members/{user_id}")
async def ws_m365_remove_dist_list_member(
    group_id: str,
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Exchange Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.remove_distribution_list_member, group_id, user_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Teams Admin Endpoints (extending existing /teams/* routes)
# ═══════════════════════════════════════════════════════════════════════════════

@ws_router.post("/teams")
async def ws_m365_create_team(
    body: CreateTeamRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.create_team, body.display_name, body.description, body.visibility)
        cache_delete(f"m365:{member.workspace_id}:teams")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.patch("/teams/{team_id}")
async def ws_m365_update_team(
    team_id: str,
    body: UpdateTeamRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.update_team, team_id, body.model_dump(exclude_none=True))
        cache_delete(f"m365:{member.workspace_id}:teams")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.post("/teams/{team_id}/archive")
async def ws_m365_archive_team(
    team_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        await _run(svc.archive_team, team_id)
        cache_delete(f"m365:{member.workspace_id}:teams")
        return {"archived": True, "team_id": team_id}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/teams/{team_id}/channels")
async def ws_m365_list_channels(
    team_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_channels, team_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 list channels error for %s: %s", team_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch channels")


@ws_router.post("/teams/{team_id}/channels")
async def ws_m365_create_channel(
    team_id: str,
    body: CreateChannelRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.create_channel, team_id, body.display_name, body.description, body.channel_type)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/teams/{team_id}/channels/{channel_id}")
async def ws_m365_delete_channel(
    team_id: str,
    channel_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.delete_channel, team_id, channel_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.patch("/teams/{team_id}/members/{member_id}")
async def ws_m365_update_member_role(
    team_id: str,
    member_id: str,
    body: UpdateRoleRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.update_member_role, team_id, member_id, body.roles)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/teams/{team_id}/members/{member_id}")
async def ws_m365_remove_team_member(
    team_id: str,
    member_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.remove_team_member, team_id, member_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.get("/teams/activity")
async def ws_m365_teams_activity(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Teams Admin")
    cache_key = f"m365:{member.workspace_id}:teams_activity"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_teams_activity)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 teams activity error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch teams activity")


# ═══════════════════════════════════════════════════════════════════════════════
# Guest Users Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@ws_router.get("/guests")
async def ws_m365_list_guests(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Guest Users")
    cache_key = f"m365:{member.workspace_id}:guests"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_guests)
        cache_set(cache_key, result, ttl=300)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 guests error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch guest users")


@ws_router.post("/guests/invite")
async def ws_m365_invite_guest(
    body: InviteGuestRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Guest Users")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.invite_guest, body.email, body.display_name, body.redirect_url, body.message)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@ws_router.delete("/guests/{user_id}")
async def ws_m365_delete_guest(
    user_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Guest Users")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.delete_guest, user_id)
        cache_delete(f"m365:{member.workspace_id}:users")
        cache_delete(f"m365:{member.workspace_id}:guests")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Audit Log Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@ws_router.get("/audit/sign-ins")
async def ws_m365_sign_ins(
    limit: int = 50,
    upn: Optional[str] = None,
    status: Optional[str] = None,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Audit Logs")
    cache_key = f"m365:{member.workspace_id}:audit_logs"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_sign_ins, limit=min(limit, 200), upn=upn, status=status)
        cache_set(cache_key, result, ttl=120)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 sign-ins error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch sign-in logs")


@ws_router.get("/audit/directory")
async def ws_m365_directory_audits(
    limit: int = 50,
    category: Optional[str] = None,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Audit Logs")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_directory_audits, limit=min(limit, 200), category=category)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 directory audits error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch directory audit logs")


# ═══════════════════════════════════════════════════════════════════════════════
# OneDrive Usage Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@ws_router.get("/sharepoint/onedrive-usage")
async def ws_m365_onedrive_usage(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "OneDrive Usage")
    cache_key = f"m365:{member.workspace_id}:onedrive_usage"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_onedrive_usage)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 onedrive usage error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch OneDrive usage")


# ═══════════════════════════════════════════════════════════════════════════════
# Offboarding Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@ws_router.post("/users/{user_id}/offboard")
async def ws_m365_offboard_user(
    user_id: str,
    body: OffboardRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "Offboarding")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.offboard_user, user_id, body.dict())
        cache_delete(f"m365:{member.workspace_id}:users")
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 offboard user error for %s: %s", user_id, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao fazer offboard do usuário: {exc}")
