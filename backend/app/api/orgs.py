import re
import secrets
from math import ceil
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Path, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sa_func, desc
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.models.db_models import (
    User, Organization, OrganizationMember, Workspace, WorkspaceMember, PendingInvitation,
)
from app.core.dependencies import (
    get_current_user, get_current_member, require_org_permission,
)
from app.core.auth_context import MemberContext
from app.core.permissions import VALID_ROLES
from app.services.log_service import log_activity
from app.services.plan_service import check_member_limit, check_managed_org_limit, get_org_usage, get_effective_plan, PLAN_PRICES
from app.services.email_service import send_invite_email, send_org_member_added_email
from app.services.notification_service import push_notification
from app.services.notification_channel_service import fire_event
from app.services.branding_service import (
    get_branding, validate_color, validate_logo, validate_mime, strip_data_uri,
)

router = APIRouter(prefix="/orgs", tags=["Organizations"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class OrgCreate(BaseModel):
    name: str
    slug: Optional[str] = None  # auto-generated from name if omitted


class OrgUpdate(BaseModel):
    name: Optional[str] = None


class PlanUpdate(BaseModel):
    plan_tier: str  # free | pro | enterprise


class MemberInvite(BaseModel):
    email: str
    role: str = "viewer"
    phone: Optional[str] = None
    department: Optional[str] = None


class MemberRoleUpdate(BaseModel):
    role: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None


class ManagedOrgCreate(BaseModel):
    name: str


class BatchPartnerAction(BaseModel):
    partner_slugs: List[str]


# ── Helpers ──────────────────────────────────────────────────────────────────


def _slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower().strip())
    return re.sub(r"[\s_]+", "-", slug)[:100]


def _org_to_dict(org: Organization, role: str = None, db: Session = None):
    from app.services.plan_service import get_trial_info
    trial = get_trial_info(org)
    d = {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "plan_tier": org.plan_tier,
        "effective_plan": get_effective_plan(org),
        "org_type": org.org_type,
        "parent_org_id": str(org.parent_org_id) if org.parent_org_id else None,
        "is_active": org.is_active,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "trial": trial,
        "currency_display": org.currency_display or "USD",
        "exchange_rate_brl": org.exchange_rate_brl,
        "exchange_rate_auto": org.exchange_rate_auto or False,
    }
    if org.org_type in ("master", "partner"):
        d["branding"] = get_branding(org, db)
    if role:
        d["role"] = role
    return d


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("")
async def list_orgs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List organizations the authenticated user belongs to."""
    rows = (
        db.query(OrganizationMember, Organization)
        .join(Organization, OrganizationMember.organization_id == Organization.id)
        .options(joinedload(Organization.parent_org))
        .filter(
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.is_active == True,
            Organization.is_active == True,
        )
        .all()
    )
    return {"organizations": [_org_to_dict(org, role=m.role, db=db) for m, org in rows]}


@router.post("", status_code=201)
async def create_org(
    payload: OrgCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new organization. The creator becomes the owner."""
    slug = payload.slug or _slugify(payload.name)
    if not slug:
        raise HTTPException(status_code=400, detail="Slug inválido")

    existing = db.query(Organization).filter(Organization.slug == slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Slug já está em uso")

    org = Organization(
        name=payload.name,
        slug=slug,
        trial_ends_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(org)
    db.flush()

    # Add creator as owner
    membership = OrganizationMember(
        organization_id=org.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(membership)

    # Create default workspace
    ws = Workspace(
        organization_id=org.id,
        name="Default",
        slug="default",
    )
    db.add(ws)
    db.flush()

    # Add creator as workspace member
    db.add(WorkspaceMember(
        workspace_id=ws.id,
        user_id=current_user.id,
        role_override=None,
    ))

    # Set as user's default org if they don't have one
    if not current_user.default_org_id:
        current_user.default_org_id = org.id

    db.commit()
    db.refresh(org)

    log_activity(db, current_user, "org.create", "Organization",
                 resource_id=str(org.id), resource_name=org.name)

    return _org_to_dict(org, role="owner", db=db)


@router.get("/{org_slug}")
async def get_org(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Get organization details."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    return _org_to_dict(org, role=member.role, db=db)


@router.put("/{org_slug}")
async def update_org(
    payload: OrgUpdate,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Update organization (owner only)."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if payload.name is not None:
        org.name = payload.name
    db.commit()
    db.refresh(org)
    return _org_to_dict(org, role=member.role, db=db)


@router.delete("/{org_slug}", status_code=204)
async def delete_org(
    member: MemberContext = Depends(require_org_permission("org.delete")),
    db: Session = Depends(get_db),
):
    """Delete organization (owner only)."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    log_activity(db, member.user, "org.delete", "Organization",
                 resource_id=str(org.id), resource_name=org.name)
    db.delete(org)  # CASCADE deletes members, workspaces, cloud_accounts
    db.commit()
    return None


# ── Plan ─────────────────────────────────────────────────────────────────────


@router.put("/{org_slug}/plan")
async def update_plan(
    payload: PlanUpdate,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Update the organization's plan tier (owner/admin only)."""
    valid_tiers = {"free", "pro", "enterprise"}
    if payload.plan_tier not in valid_tiers:
        raise HTTPException(status_code=400, detail=f"Plano inválido. Opções: {', '.join(valid_tiers)}")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    org.plan_tier = payload.plan_tier
    db.commit()
    db.refresh(org)

    log_activity(db, member.user, "org.plan.update", "Organization",
                 resource_id=str(org.id), resource_name=org.name,
                 detail=f"plan_tier={payload.plan_tier}")

    # Notify all workspaces about plan change
    workspaces = db.query(Workspace).filter(
        Workspace.organization_id == member.organization_id,
        Workspace.is_active == True,
    ).all()
    for ws in workspaces:
        push_notification(
            db, ws.id, "plan",
            f"Plano da organização alterado para {payload.plan_tier.capitalize()}.",
            "/billing",
        )

    return _org_to_dict(org, role=member.role, db=db)


# ── Usage ────────────────────────────────────────────────────────────────────


@router.get("/{org_slug}/usage")
async def org_usage(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Return plan usage and limits for the organization."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    return get_org_usage(db, org.id, get_effective_plan(org), org.org_type)


# ── Currency settings ────────────────────────────────────────────────────────


class BrandingUpdate(BaseModel):
    platform_name: Optional[str] = None
    logo_light: Optional[str] = None       # base64
    logo_dark: Optional[str] = None        # base64
    logo_mime: Optional[str] = None        # image/png, image/svg+xml
    favicon: Optional[str] = None          # base64
    favicon_mime: Optional[str] = None
    color_primary: Optional[str] = None    # #RRGGBB
    color_accent: Optional[str] = None     # #RRGGBB
    powered_by: Optional[bool] = None
    email_sender_name: Optional[str] = None


class CurrencySettings(BaseModel):
    currency_display: str = "USD"
    exchange_rate_brl: Optional[float] = None
    exchange_rate_auto: bool = False


@router.put("/{org_slug}/currency")
async def update_currency(
    payload: CurrencySettings,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Update currency display settings for the organization."""
    if payload.currency_display not in ("USD", "BRL"):
        raise HTTPException(status_code=400, detail="currency_display deve ser 'USD' ou 'BRL'")

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    org.currency_display = payload.currency_display
    org.exchange_rate_brl = payload.exchange_rate_brl
    org.exchange_rate_auto = payload.exchange_rate_auto
    db.commit()

    return {
        "currency_display": org.currency_display,
        "exchange_rate_brl": org.exchange_rate_brl,
        "exchange_rate_auto": org.exchange_rate_auto,
    }


@router.get("/{org_slug}/exchange-rate")
async def get_exchange_rate_endpoint(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Return the current exchange rate (manual or BCB auto)."""
    from app.services.currency_service import get_exchange_rate, fetch_bcb_rate

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    rate = get_exchange_rate(db, org)
    return {
        "currency_display": org.currency_display,
        "exchange_rate_brl": rate,
        "exchange_rate_auto": org.exchange_rate_auto,
        "bcb_rate": fetch_bcb_rate(),
        "updated_at": org.exchange_rate_updated_at.isoformat() if org.exchange_rate_updated_at else None,
    }


# ── Members ──────────────────────────────────────────────────────────────────


@router.get("/{org_slug}/members")
async def list_members(
    member: MemberContext = Depends(require_org_permission("org.members.view")),
    db: Session = Depends(get_db),
):
    """List all members of the organization."""
    memberships = (
        db.query(OrganizationMember)
        .options(joinedload(OrganizationMember.user))
        .filter(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.is_active == True,
        )
        .all()
    )
    result = [
        {
            "user_id": str(m.user.id),
            "email": m.user.email,
            "name": m.user.name,
            "role": m.role,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "phone": m.phone,
            "department": m.department,
            "notes": m.notes,
            "avatar_url": m.user.avatar_url if hasattr(m.user, "avatar_url") else None,
        }
        for m in memberships
        if m.user
    ]
    return {"members": result}


@router.post("/{org_slug}/members", status_code=201)
async def invite_member(
    payload: MemberInvite,
    member: MemberContext = Depends(require_org_permission("org.members.manage")),
    db: Session = Depends(get_db),
):
    """Add a user to the organization by email, or create a pending invitation."""
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role inválida. Opções: {', '.join(VALID_ROLES)}")

    # Plan limit check
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    effective = get_effective_plan(org)
    allowed, current, limit = check_member_limit(db, member.organization_id, effective)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de membros atingido para o plano {effective.capitalize()} (máx {limit}). Faça upgrade para convidar mais.",
        )

    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()

    if user:
        # User exists — add directly
        existing = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.user_id == user.id,
        ).first()
        if existing:
            if existing.is_active:
                raise HTTPException(status_code=409, detail="Usuário já é membro")
            existing.is_active = True
            existing.role = payload.role
            existing.invited_by = member.user.id
            db.commit()
        else:
            new_member = OrganizationMember(
                organization_id=member.organization_id,
                user_id=user.id,
                role=payload.role,
                invited_by=member.user.id,
                phone=payload.phone,
                department=payload.department,
            )
            db.add(new_member)
            db.commit()

        log_activity(db, member.user, "org.member.add", "OrganizationMember",
                     resource_name=user.email, detail=f"role={payload.role}",
                     provider="system")

        # Notify the existing user by email
        _brand = get_branding(org, db)
        send_org_member_added_email(
            to_email=user.email,
            user_name=user.name or user.email,
            org_name=org.name,
            role=payload.role,
            inviter_name=member.user.name or member.user.email,
            branding=_brand,
        )

        from app.services.notification_channel_service import fire_event as _fire
        _fire(db, member.workspace_id, "org.member.added", {
            "email": user.email, "name": user.name or user.email,
            "role": payload.role, "org_name": org.name,
        })

        return {"user_id": str(user.id), "email": user.email, "name": user.name, "role": payload.role, "status": "added"}

    # User not found — create pending invitation
    existing_invite = db.query(PendingInvitation).filter(
        PendingInvitation.organization_id == member.organization_id,
        PendingInvitation.email == payload.email,
        PendingInvitation.accepted_at == None,
    ).first()

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=7)

    if existing_invite:
        existing_invite.token = token
        existing_invite.expires_at = expires_at
        existing_invite.role = payload.role
        existing_invite.invited_by = member.user.id
        db.commit()
    else:
        invite = PendingInvitation(
            organization_id=member.organization_id,
            email=payload.email,
            role=payload.role,
            token=token,
            invited_by=member.user.id,
            expires_at=expires_at,
        )
        db.add(invite)
        db.commit()

    log_activity(db, member.user, "org.member.invite", "PendingInvitation",
                 resource_name=payload.email, detail=f"role={payload.role}",
                 provider="system")

    # Send invite email
    _brand = get_branding(org, db)
    send_invite_email(
        to_email=payload.email,
        org_name=org.name,
        inviter_name=member.user.name or member.user.email,
        role=payload.role,
        token=token,
        branding=_brand,
    )

    return {
        "email": payload.email,
        "role": payload.role,
        "status": "pending",
        "invite_link": f"/invite/{token}",
        "expires_at": expires_at.isoformat(),
    }


@router.put("/{org_slug}/members/{user_id}")
async def update_member_role(
    user_id: str,
    payload: MemberRoleUpdate,
    member: MemberContext = Depends(require_org_permission("org.members.manage")),
    db: Session = Depends(get_db),
):
    """Change a member's role."""
    target = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == member.organization_id,
        OrganizationMember.user_id == user_id,
        OrganizationMember.is_active == True,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    if payload.role is not None:
        if payload.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role inválida. Opções: {', '.join(VALID_ROLES)}")
        # Prevent demoting the last owner
        if target.role == "owner" and payload.role != "owner":
            owner_count = db.query(OrganizationMember).filter(
                OrganizationMember.organization_id == member.organization_id,
                OrganizationMember.role == "owner",
                OrganizationMember.is_active == True,
            ).count()
            if owner_count <= 1:
                raise HTTPException(status_code=400, detail="Não é possível remover o último owner")
        target.role = payload.role

    if payload.phone is not None:
        target.phone = payload.phone or None
    if payload.department is not None:
        target.department = payload.department or None
    if payload.notes is not None:
        target.notes = payload.notes or None

    db.commit()

    log_activity(db, member.user, "org.member.update", "OrganizationMember",
                 resource_id=user_id, detail=f"role={target.role}",
                 provider="system")

    return {"user_id": user_id, "role": target.role, "phone": target.phone, "department": target.department}


@router.delete("/{org_slug}/members/{user_id}", status_code=204)
async def remove_member(
    user_id: str,
    member: MemberContext = Depends(require_org_permission("org.members.manage")),
    db: Session = Depends(get_db),
):
    """Remove a member from the organization."""
    target = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == member.organization_id,
        OrganizationMember.user_id == user_id,
        OrganizationMember.is_active == True,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    # Can't remove yourself if you're the last owner
    if target.role == "owner":
        owner_count = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.role == "owner",
            OrganizationMember.is_active == True,
        ).count()
        if owner_count <= 1:
            raise HTTPException(status_code=400, detail="Não é possível remover o último owner")

    target_user = db.query(User).filter(User.id == user_id).first()
    target_email = target_user.email if target_user else user_id

    target.is_active = False
    db.commit()

    log_activity(db, member.user, "org.member.remove", "OrganizationMember",
                 resource_id=user_id, provider="system")

    # Notify workspaces about member removal
    workspaces = db.query(Workspace).filter(
        Workspace.organization_id == member.organization_id,
        Workspace.is_active == True,
    ).all()
    for ws in workspaces:
        push_notification(
            db, ws.id, "member",
            f"Membro {target_email} removido da organização.",
        )

    return None


# ── Invitations ─────────────────────────────────────────────────────────────


@router.get("/{org_slug}/invitations")
async def list_pending_invitations(
    member: MemberContext = Depends(require_org_permission("org.members.view")),
    db: Session = Depends(get_db),
):
    """List pending (unaccepted) invitations for this organization."""
    invites = (
        db.query(PendingInvitation, User)
        .outerjoin(User, PendingInvitation.invited_by == User.id)
        .filter(
            PendingInvitation.organization_id == member.organization_id,
            PendingInvitation.accepted_at == None,
        )
        .order_by(PendingInvitation.created_at.desc())
        .all()
    )
    now = datetime.utcnow()
    result = []
    for inv, inviter in invites:
        result.append({
            "id": str(inv.id),
            "email": inv.email,
            "role": inv.role,
            "invited_by_name": inviter.name if inviter else None,
            "created_at": inv.created_at.isoformat(),
            "expires_at": inv.expires_at.isoformat(),
            "is_expired": inv.expires_at < now,
        })
    return {"invitations": result}


@router.delete("/{org_slug}/invitations/{invitation_id}", status_code=204)
async def cancel_invitation(
    invitation_id: str,
    member: MemberContext = Depends(require_org_permission("org.members.manage")),
    db: Session = Depends(get_db),
):
    """Cancel a pending invitation."""
    invite = db.query(PendingInvitation).filter(
        PendingInvitation.id == invitation_id,
        PendingInvitation.organization_id == member.organization_id,
        PendingInvitation.accepted_at == None,
    ).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Convite não encontrado")
    db.delete(invite)
    db.commit()
    return None


# ── Managed Organizations (MSP / Enterprise) ─────────────────────────────────


def _build_managed_org_stats(db: Session, org_ids: list) -> dict:
    """Pre-fetch all stats for a batch of org IDs in bulk queries (avoids N+1)."""
    from app.models.db_models import Workspace, CloudAccount, OrganizationMember, User, ActivityLog

    if not org_ids:
        return {}

    # Workspace counts per org
    ws_counts = dict(
        db.query(Workspace.organization_id, sa_func.count(Workspace.id))
        .filter(Workspace.organization_id.in_(org_ids), Workspace.is_active == True)
        .group_by(Workspace.organization_id)
        .all()
    )

    # Cloud account counts + providers per org
    acc_rows = (
        db.query(
            Workspace.organization_id,
            sa_func.count(CloudAccount.id),
            sa_func.array_agg(sa_func.distinct(CloudAccount.provider)),
        )
        .join(Workspace, CloudAccount.workspace_id == Workspace.id)
        .filter(Workspace.organization_id.in_(org_ids), CloudAccount.is_active == True)
        .group_by(Workspace.organization_id)
        .all()
    )
    acc_counts = {r[0]: r[1] for r in acc_rows}
    providers_map = {r[0]: sorted([p for p in (r[2] or []) if p]) for r in acc_rows}

    # Member counts per org
    mem_counts = dict(
        db.query(OrganizationMember.organization_id, sa_func.count(OrganizationMember.id))
        .filter(OrganizationMember.organization_id.in_(org_ids), OrganizationMember.is_active == True)
        .group_by(OrganizationMember.organization_id)
        .all()
    )

    # Owners (one per org)
    from sqlalchemy.orm import aliased
    owner_rows = (
        db.query(OrganizationMember.organization_id, User.name, User.email, User.avatar_url)
        .join(User, OrganizationMember.user_id == User.id)
        .filter(
            OrganizationMember.organization_id.in_(org_ids),
            OrganizationMember.role == "owner",
            OrganizationMember.is_active == True,
        )
        .all()
    )
    owners = {r[0]: {"name": r[1], "email": r[2], "avatar_url": r[3]} for r in owner_rows}

    # Last activity per org — use a lateral subquery approach
    from sqlalchemy import literal_column
    activity_rows = (
        db.query(ActivityLog.organization_id, sa_func.max(ActivityLog.created_at))
        .filter(ActivityLog.organization_id.in_(org_ids))
        .group_by(ActivityLog.organization_id)
        .all()
    )
    last_activity = {r[0]: r[1] for r in activity_rows}

    # Build result dict keyed by org_id
    result = {}
    for oid in org_ids:
        acc_count = acc_counts.get(oid, 0)
        result[oid] = {
            "ws_count": ws_counts.get(oid, 0),
            "acc_count": acc_count,
            "providers": providers_map.get(oid, []),
            "mem_count": mem_counts.get(oid, 0),
            "owner": owners.get(oid),
            "last_activity_at": last_activity.get(oid),
        }
    return result


def _managed_org_to_dict(org: Organization, db: Session, stats: dict = None) -> dict:
    """Return org dict enriched with usage counts for the managed-orgs panel.

    If `stats` dict is provided (from _build_managed_org_stats), use it to avoid
    per-org queries. Falls back to individual queries if stats not provided.
    """
    if stats and org.id in stats:
        s = stats[org.id]
        ws_count = s["ws_count"]
        acc_count = s["acc_count"]
        providers = s["providers"]
        mem_count = s["mem_count"]
        owner = s["owner"]
        last_act = s["last_activity_at"]
    else:
        # Fallback: individual queries (for single-org calls)
        from app.models.db_models import Workspace, CloudAccount, OrganizationMember, User, ActivityLog
        ws_count = db.query(Workspace).filter(
            Workspace.organization_id == org.id, Workspace.is_active == True,
        ).count()
        cloud_accounts = (
            db.query(CloudAccount.provider)
            .join(Workspace, CloudAccount.workspace_id == Workspace.id)
            .filter(Workspace.organization_id == org.id, CloudAccount.is_active == True)
            .all()
        )
        acc_count = len(cloud_accounts)
        providers = sorted(set(a[0] for a in cloud_accounts))
        mem_count = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == org.id, OrganizationMember.is_active == True,
        ).count()
        owner_member = (
            db.query(OrganizationMember).join(User, OrganizationMember.user_id == User.id)
            .filter(OrganizationMember.organization_id == org.id, OrganizationMember.role == "owner", OrganizationMember.is_active == True)
            .first()
        )
        owner = {"name": owner_member.user.name, "email": owner_member.user.email, "avatar_url": getattr(owner_member.user, "avatar_url", None)} if owner_member else None
        last_act_row = db.query(ActivityLog.created_at).filter(ActivityLog.organization_id == org.id).order_by(desc(ActivityLog.created_at)).first()
        last_act = last_act_row[0] if last_act_row else None

    # Health status
    if not org.is_active:
        health = "critical"
    elif acc_count == 0:
        health = "critical"
    else:
        health = "healthy"

    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "plan_tier": org.plan_tier,
        "org_type": org.org_type,
        "is_active": org.is_active,
        "notes": org.notes,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "workspaces_count": ws_count,
        "cloud_accounts_count": acc_count,
        "members_count": mem_count,
        "owner_name": owner["name"] if owner else None,
        "owner_email": owner["email"] if owner else None,
        "owner_avatar_url": owner.get("avatar_url") if owner else None,
        "branding": get_branding(org, db),
        "has_custom_branding": any([
            org.wl_platform_name, org.wl_logo_light, org.wl_color_primary,
            org.wl_color_accent, org.wl_favicon,
        ]),
        "health_status": health,
        "cloud_providers": providers,
        "last_activity_at": last_act.isoformat() if last_act else None,
    }


@router.get("/{org_slug}/managed-orgs")
async def list_managed_orgs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None),
    sort_by: str = Query("recent"),
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """List partner orgs managed by this Enterprise master org."""
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if master_org.org_type not in ("master", "standalone") or master_org.plan_tier != "enterprise":
        raise HTTPException(status_code=403, detail="Apenas organizações Enterprise podem gerenciar parceiros.")

    q = db.query(Organization).filter(Organization.parent_org_id == master_org.id)

    # Search
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            (Organization.name.ilike(pattern)) | (Organization.slug.ilike(pattern))
        )

    # Sort
    if sort_by == "name":
        q = q.order_by(Organization.name.asc())
    else:  # recent
        q = q.order_by(Organization.created_at.desc())

    total = q.count()
    total_pages = ceil(total / per_page) if total > 0 else 1
    child_orgs = q.offset((page - 1) * per_page).limit(per_page).all()

    # Bulk-fetch stats to avoid N+1 queries
    stats = _build_managed_org_stats(db, [o.id for o in child_orgs]) if child_orgs else {}

    return {
        "managed_orgs": [_managed_org_to_dict(o, db, stats=stats) for o in child_orgs],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
        },
    }


@router.get("/{org_slug}/managed-orgs/summary")
async def managed_orgs_summary(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Consolidated stats across all partner orgs (Enterprise master only)."""
    from app.models.db_models import Workspace, CloudAccount, OrganizationMember
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if master_org.plan_tier != "enterprise":
        raise HTTPException(status_code=403, detail="Recurso exclusivo do plano Enterprise.")

    child_orgs = db.query(Organization).filter(
        Organization.parent_org_id == master_org.id,
    ).all()
    child_ids = [o.id for o in child_orgs]

    total_ws = db.query(Workspace).filter(
        Workspace.organization_id.in_(child_ids),
        Workspace.is_active == True,
    ).count() if child_ids else 0

    total_acc = (
        db.query(CloudAccount)
        .join(Workspace, CloudAccount.workspace_id == Workspace.id)
        .filter(
            Workspace.organization_id.in_(child_ids),
            CloudAccount.is_active == True,
        )
        .count()
    ) if child_ids else 0

    total_mem = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id.in_(child_ids),
        OrganizationMember.is_active == True,
    ).count() if child_ids else 0

    # ── Org add-on cost ───────────────────────────────────────────────────────
    base_orgs = PLAN_PRICES.get("enterprise_base_orgs", 5)
    extra_orgs = max(0, len(child_orgs) - base_orgs)
    extra_org_centavos = extra_orgs * PLAN_PRICES.get("enterprise_extra_org", 39700)

    # ── Workspace add-on cost (per-partner overage) ───────────────────────────
    ws_per_org = dict(
        db.query(Workspace.organization_id, sa_func.count(Workspace.id))
        .filter(
            Workspace.organization_id.in_(child_ids),
            Workspace.is_active == True,
        )
        .group_by(Workspace.organization_id)
        .all()
    ) if child_ids else {}

    partner_base_ws = PLAN_PRICES.get("partner_base_workspaces", 10)
    total_extra_ws = sum(max(0, ws_per_org.get(cid, 0) - partner_base_ws) for cid in child_ids)
    extra_ws_centavos = total_extra_ws * PLAN_PRICES.get("partner_extra_workspace", 29000)

    # ── Master org workspace add-on cost ────────────────────────────────────
    master_ws_count = db.query(Workspace).filter(
        Workspace.organization_id == org.id,
        Workspace.is_active == True,
    ).count()
    master_base_ws = PLAN_PRICES.get("enterprise_base_workspaces", 20)
    master_extra_ws = max(0, master_ws_count - master_base_ws)
    master_extra_ws_centavos = master_extra_ws * PLAN_PRICES.get("enterprise_extra_workspace", 29000)

    return {
        "total_partners": len(child_orgs),
        "total_workspaces": total_ws,
        "total_cloud_accounts": total_acc,
        "total_members": total_mem,
        "base_included_orgs": base_orgs,
        "extra_orgs": extra_orgs,
        "extra_cost_brl": extra_org_centavos / 100,
        "partner_base_workspaces": partner_base_ws,
        "total_extra_workspaces": total_extra_ws,
        "extra_workspace_cost_brl": extra_ws_centavos / 100,
        "master_workspaces": master_ws_count,
        "master_base_workspaces": master_base_ws,
        "master_extra_workspaces": master_extra_ws,
        "master_extra_workspace_cost_brl": master_extra_ws_centavos / 100,
    }


@router.get("/{org_slug}/managed-orgs/widget-summary")
async def managed_orgs_widget_summary(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Lightweight summary for dashboard MSP widget."""
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if master_org.plan_tier != "enterprise" or master_org.org_type not in ("master", "standalone"):
        raise HTTPException(status_code=403, detail="Recurso exclusivo do plano Enterprise.")

    child_orgs = db.query(Organization).filter(
        Organization.parent_org_id == master_org.id,
    ).order_by(Organization.name.asc()).all()

    # Bulk-fetch stats to avoid N+1 queries
    org_ids = [o.id for o in child_orgs]
    stats = _build_managed_org_stats(db, org_ids) if org_ids else {}

    partners_summary = []
    counts = {"healthy": 0, "warning": 0, "critical": 0}
    for org in child_orgs:
        s = stats.get(org.id, {})
        providers = s.get("providers", [])
        acc_count = s.get("acc_count", 0)
        if not org.is_active or acc_count == 0:
            health = "critical"
        else:
            health = "healthy"
        counts[health] += 1
        partners_summary.append({
            "name": org.name,
            "slug": org.slug,
            "health": health,
            "providers": providers,
            "is_active": org.is_active,
        })

    return {
        "total_partners": len(child_orgs),
        **counts,
        "partners_summary": partners_summary[:10],
    }


@router.post("/{org_slug}/managed-orgs/batch-suspend")
async def batch_suspend_partners(
    payload: BatchPartnerAction,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Suspend multiple partner orgs at once."""
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if master_org.plan_tier != "enterprise":
        raise HTTPException(status_code=403, detail="Recurso exclusivo do plano Enterprise.")

    updated = []
    for slug in payload.partner_slugs:
        org = db.query(Organization).filter(
            Organization.slug == slug,
            Organization.parent_org_id == master_org.id,
        ).first()
        if org and org.is_active:
            org.is_active = False
            org.suspended_at = datetime.utcnow()
            org.suspended_reason = "Suspenso via operação em massa"
            updated.append(slug)
            log_activity(
                db, user=member.user, action="suspend_partner",
                resource_type="organization", resource_name=org.name,
                organization_id=master_org.id,
            )
    db.commit()
    return {"suspended": len(updated), "slugs": updated}


@router.post("/{org_slug}/managed-orgs/batch-activate")
async def batch_activate_partners(
    payload: BatchPartnerAction,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Reactivate multiple partner orgs at once."""
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if master_org.plan_tier != "enterprise":
        raise HTTPException(status_code=403, detail="Recurso exclusivo do plano Enterprise.")

    updated = []
    for slug in payload.partner_slugs:
        org = db.query(Organization).filter(
            Organization.slug == slug,
            Organization.parent_org_id == master_org.id,
        ).first()
        if org and not org.is_active:
            org.is_active = True
            org.suspended_at = None
            org.suspended_reason = None
            updated.append(slug)
            log_activity(
                db, user=member.user, action="activate_partner",
                resource_type="organization", resource_name=org.name,
                organization_id=master_org.id,
            )
    db.commit()
    return {"activated": len(updated), "slugs": updated}


@router.post("/{org_slug}/managed-orgs", status_code=201)
async def create_managed_org(
    payload: ManagedOrgCreate,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Create a partner org under this Enterprise master. Caller auto-added as owner."""
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if master_org.plan_tier != "enterprise":
        raise HTTPException(status_code=403, detail="Criação de organizações parceiras requer plano Enterprise.")

    allowed, current, max_orgs = check_managed_org_limit(db, master_org.id, master_org.plan_tier)
    # enterprise has None limit → always allowed
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de organizações gerenciadas atingido (máx {max_orgs}).",
        )

    slug = _slugify(payload.name)
    if not slug:
        raise HTTPException(status_code=400, detail="Nome inválido para slug")
    base_slug = slug
    counter = 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    # Create partner org
    partner_org = Organization(
        name=payload.name,
        slug=slug,
        plan_tier="enterprise",
        org_type="partner",
        parent_org_id=master_org.id,
    )
    db.add(partner_org)
    db.flush()

    # Auto-add calling user as owner of the new partner org
    membership = OrganizationMember(
        organization_id=partner_org.id,
        user_id=member.user.id,
        role="owner",
        invited_by=member.user.id,
    )
    db.add(membership)

    # Create default workspace in partner org
    ws = Workspace(
        organization_id=partner_org.id,
        name="Default",
        slug="default",
    )
    db.add(ws)
    db.flush()

    # Add creator as workspace member
    db.add(WorkspaceMember(
        workspace_id=ws.id,
        user_id=member.user.id,
        role_override=None,
    ))

    # Promote master org type if needed
    if master_org.org_type == "standalone":
        master_org.org_type = "master"

    db.commit()
    db.refresh(partner_org)

    log_activity(db, member.user, "org.managed.create", "Organization",
                 resource_id=str(partner_org.id), resource_name=partner_org.name,
                 detail=f"master={master_org.slug}")

    # Email the creator about the new partner org
    try:
        from app.services.email_service import send_partner_org_created_email
        from app.services.branding_service import get_branding
        branding = get_branding(master_org, db)
        send_partner_org_created_email(
            to_email=member.user.email,
            user_name=member.user.name or member.user.email,
            partner_org_name=partner_org.name,
            master_org_name=master_org.name,
            branding=branding,
        )
    except Exception:
        pass  # Non-critical

    return _managed_org_to_dict(partner_org, db)


@router.delete("/{org_slug}/managed-orgs/{partner_slug}", status_code=204)
async def remove_managed_org(
    partner_slug: str,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Unlink a partner org from the master. Partner reverts to standalone/free."""
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if master_org.org_type != "master":
        raise HTTPException(status_code=403, detail="Esta organização não possui parceiras.")

    partner_org = db.query(Organization).filter(
        Organization.slug == partner_slug,
        Organization.parent_org_id == master_org.id,
    ).first()
    if not partner_org:
        raise HTTPException(status_code=404, detail="Organização parceira não encontrada.")

    partner_org.parent_org_id = None
    partner_org.org_type = "standalone"
    partner_org.plan_tier = "free"

    # If master has no more children, revert to standalone
    remaining = db.query(Organization).filter(
        Organization.parent_org_id == master_org.id,
    ).count()
    # remaining still includes this org until flush, so check <= 1
    if remaining <= 1:
        master_org.org_type = "standalone"

    db.commit()

    log_activity(db, member.user, "org.managed.remove", "Organization",
                 resource_id=str(partner_org.id), resource_name=partner_org.name,
                 detail=f"master={master_org.slug}")

    return None


# ── White-label branding ─────────────────────────────────────────────────────


@router.get("/{org_slug}/branding")
async def get_branding_endpoint(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Return resolved branding for the organization."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")
    return get_branding(org, db)


@router.put("/{org_slug}/branding")
async def update_branding(
    payload: BrandingUpdate,
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Update white-label branding (enterprise orgs only)."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    # Allow master orgs to set their own branding.
    # Also allow if caller is editing a partner org via managed-orgs flow
    # (the member context already verifies ownership via require_org_permission).
    if org.org_type not in ("master", "partner"):
        raise HTTPException(status_code=403, detail="White-label disponível apenas para planos Enterprise")

    # Validate fields
    if payload.platform_name is not None:
        pn = payload.platform_name.strip()
        if len(pn) < 2 or len(pn) > 100:
            raise HTTPException(status_code=400, detail="Nome da plataforma deve ter entre 2 e 100 caracteres")
        org.wl_platform_name = pn

    if payload.color_primary is not None:
        if not validate_color(payload.color_primary):
            raise HTTPException(status_code=400, detail="Cor primária inválida (use #RRGGBB)")
        org.wl_color_primary = payload.color_primary

    if payload.color_accent is not None:
        if not validate_color(payload.color_accent):
            raise HTTPException(status_code=400, detail="Cor accent inválida (use #RRGGBB)")
        org.wl_color_accent = payload.color_accent

    if payload.logo_mime is not None:
        if not validate_mime(payload.logo_mime):
            raise HTTPException(status_code=400, detail="Formato de imagem não suportado")
        org.wl_logo_mime = payload.logo_mime

    if payload.logo_light is not None:
        raw = strip_data_uri(payload.logo_light)
        if not validate_logo(raw, max_kb=300, mime=payload.logo_mime or org.wl_logo_mime):
            raise HTTPException(status_code=400, detail="Logo claro inválido, maior que 300KB, ou contém conteúdo não permitido")
        org.wl_logo_light = raw

    if payload.logo_dark is not None:
        raw = strip_data_uri(payload.logo_dark)
        if not validate_logo(raw, max_kb=300, mime=payload.logo_mime or org.wl_logo_mime):
            raise HTTPException(status_code=400, detail="Logo escuro inválido, maior que 300KB, ou contém conteúdo não permitido")
        org.wl_logo_dark = raw

    if payload.favicon is not None:
        raw = strip_data_uri(payload.favicon)
        if not validate_logo(raw, max_kb=100, mime=payload.favicon_mime or org.wl_favicon_mime):
            raise HTTPException(status_code=400, detail="Favicon inválido, maior que 100KB, ou contém conteúdo não permitido")
        org.wl_favicon = raw

    if payload.favicon_mime is not None:
        if not validate_mime(payload.favicon_mime):
            raise HTTPException(status_code=400, detail="Formato de favicon não suportado")
        org.wl_favicon_mime = payload.favicon_mime

    if payload.powered_by is not None:
        org.wl_powered_by = payload.powered_by

    if payload.email_sender_name is not None:
        esn = payload.email_sender_name.strip()
        if len(esn) < 2 or len(esn) > 100:
            raise HTTPException(status_code=400, detail="Nome do remetente deve ter entre 2 e 100 caracteres")
        org.wl_email_sender_name = esn

    db.commit()
    db.refresh(org)

    log_activity(db, member.user, "org.branding.update", "Organization",
                 resource_id=str(org.id), resource_name=org.name)

    return get_branding(org, db)


@router.delete("/{org_slug}/branding")
async def reset_branding(
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Reset white-label branding to defaults."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    org.wl_platform_name = None
    org.wl_logo_light = None
    org.wl_logo_dark = None
    org.wl_logo_mime = None
    org.wl_favicon = None
    org.wl_favicon_mime = None
    org.wl_color_primary = None
    org.wl_color_accent = None
    org.wl_powered_by = True
    org.wl_email_sender_name = None
    db.commit()

    log_activity(db, member.user, "org.branding.reset", "Organization",
                 resource_id=str(org.id), resource_name=org.name)

    return {"detail": "Branding resetado para padrão"}


@router.get("/{org_slug}/branding/logo-light")
async def serve_logo_light(
    org_slug: str = Path(...),
    db: Session = Depends(get_db),
):
    """Serve the light-background logo (public, cached)."""
    import base64
    from fastapi.responses import Response

    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org or not org.wl_logo_light:
        raise HTTPException(status_code=404, detail="Logo não encontrado")

    try:
        data = base64.b64decode(org.wl_logo_light)
    except Exception:
        raise HTTPException(status_code=500, detail="Erro ao decodificar logo")
    mime = org.wl_logo_mime or "image/png"
    return Response(content=data, media_type=mime, headers={"Cache-Control": "public, max-age=3600"})


@router.get("/{org_slug}/branding/logo-dark")
async def serve_logo_dark(
    org_slug: str = Path(...),
    db: Session = Depends(get_db),
):
    """Serve the dark-background logo (public, cached)."""
    import base64
    from fastapi.responses import Response

    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org or not org.wl_logo_dark:
        raise HTTPException(status_code=404, detail="Logo não encontrado")

    try:
        data = base64.b64decode(org.wl_logo_dark)
    except Exception:
        raise HTTPException(status_code=500, detail="Erro ao decodificar logo")
    mime = org.wl_logo_mime or "image/png"
    return Response(content=data, media_type=mime, headers={"Cache-Control": "public, max-age=3600"})


@router.get("/{org_slug}/branding/favicon")
async def serve_favicon(
    org_slug: str = Path(...),
    db: Session = Depends(get_db),
):
    """Serve the org favicon (public, cached)."""
    import base64
    from fastapi.responses import Response

    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org or not org.wl_favicon:
        raise HTTPException(status_code=404, detail="Favicon não encontrado")

    try:
        data = base64.b64decode(org.wl_favicon)
    except Exception:
        raise HTTPException(status_code=500, detail="Erro ao decodificar favicon")
    mime = org.wl_favicon_mime or "image/x-icon"
    return Response(content=data, media_type=mime, headers={"Cache-Control": "public, max-age=3600"})


@router.post("/{org_slug}/branding/test-email")
async def send_branding_test_email(
    member: MemberContext = Depends(require_org_permission("org.settings.edit")),
    db: Session = Depends(get_db),
):
    """Send a test email to the owner so they can preview white-label branding."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org or org.org_type not in ("master", "partner"):
        raise HTTPException(status_code=403, detail="White label disponível apenas para organizações Enterprise.")

    branding = get_branding(org, db)

    from app.services.email_service import send_test_branding_email
    sent = send_test_branding_email(
        to_email=member.user.email,
        user_name=member.user.name or member.user.email,
        branding=branding,
    )
    if not sent:
        raise HTTPException(status_code=500, detail="Falha ao enviar e-mail de teste. Verifique a configuração SMTP.")

    return {"detail": f"E-mail de teste enviado para {member.user.email}"}
