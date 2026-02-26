import re
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Path
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.db_models import (
    User, Organization, OrganizationMember, Workspace, PendingInvitation,
)
from app.core.dependencies import (
    get_current_user, get_current_member, require_org_permission,
)
from app.core.auth_context import MemberContext
from app.core.permissions import VALID_ROLES
from app.services.log_service import log_activity
from app.services.plan_service import check_member_limit, check_managed_org_limit, get_org_usage, PLAN_PRICES
from app.services.email_service import send_invite_email, send_org_member_added_email

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


class MemberRoleUpdate(BaseModel):
    role: str


class ManagedOrgCreate(BaseModel):
    name: str


# ── Helpers ──────────────────────────────────────────────────────────────────


def _slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text.lower().strip())
    return re.sub(r"[\s_]+", "-", slug)[:100]


def _org_to_dict(org: Organization, role: str = None):
    d = {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "plan_tier": org.plan_tier,
        "org_type": org.org_type,
        "parent_org_id": str(org.parent_org_id) if org.parent_org_id else None,
        "is_active": org.is_active,
        "created_at": org.created_at.isoformat() if org.created_at else None,
    }
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
    memberships = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.is_active == True,
        )
        .all()
    )
    result = []
    for m in memberships:
        org = db.query(Organization).filter(Organization.id == m.organization_id, Organization.is_active == True).first()
        if org:
            result.append(_org_to_dict(org, role=m.role))
    return {"organizations": result}


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

    org = Organization(name=payload.name, slug=slug)
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

    # Set as user's default org if they don't have one
    if not current_user.default_org_id:
        current_user.default_org_id = org.id

    db.commit()
    db.refresh(org)

    log_activity(db, current_user, "org.create", "Organization",
                 resource_id=str(org.id), resource_name=org.name)

    return _org_to_dict(org, role="owner")


@router.get("/{org_slug}")
async def get_org(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Get organization details."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    return _org_to_dict(org, role=member.role)


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
    return _org_to_dict(org, role=member.role)


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

    return _org_to_dict(org, role=member.role)


# ── Usage ────────────────────────────────────────────────────────────────────


@router.get("/{org_slug}/usage")
async def org_usage(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """Return plan usage and limits for the organization."""
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    return get_org_usage(db, org.id, org.plan_tier)


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
    allowed, current, limit = check_member_limit(db, member.organization_id, org.plan_tier)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de membros atingido para o plano {org.plan_tier.capitalize()} (máx {limit}). Faça upgrade para convidar mais.",
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
            )
            db.add(new_member)
            db.commit()

        log_activity(db, member.user, "org.member.add", "OrganizationMember",
                     resource_name=user.email, detail=f"role={payload.role}",
                     provider="system")

        # Notify the existing user by email
        send_org_member_added_email(
            to_email=user.email,
            user_name=user.name or user.email,
            org_name=org.name,
            role=payload.role,
            inviter_name=member.user.name or member.user.email,
        )

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
    send_invite_email(
        to_email=payload.email,
        org_name=org.name,
        inviter_name=member.user.name or member.user.email,
        role=payload.role,
        token=token,
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
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role inválida. Opções: {', '.join(VALID_ROLES)}")

    target = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == member.organization_id,
        OrganizationMember.user_id == user_id,
        OrganizationMember.is_active == True,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Membro não encontrado")

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
    db.commit()

    log_activity(db, member.user, "org.member.role_change", "OrganizationMember",
                 resource_id=user_id, detail=f"new_role={payload.role}",
                 provider="system")

    return {"user_id": user_id, "role": payload.role}


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

    target.is_active = False
    db.commit()

    log_activity(db, member.user, "org.member.remove", "OrganizationMember",
                 resource_id=user_id, provider="system")

    return None


# ── Invitations ─────────────────────────────────────────────────────────────


@router.get("/{org_slug}/invitations")
async def list_pending_invitations(
    member: MemberContext = Depends(require_org_permission("org.members.view")),
    db: Session = Depends(get_db),
):
    """List pending (unaccepted) invitations for this organization."""
    invites = (
        db.query(PendingInvitation)
        .filter(
            PendingInvitation.organization_id == member.organization_id,
            PendingInvitation.accepted_at == None,
        )
        .order_by(PendingInvitation.created_at.desc())
        .all()
    )
    now = datetime.utcnow()
    result = []
    for inv in invites:
        inviter = db.query(User).filter(User.id == inv.invited_by).first() if inv.invited_by else None
        result.append({
            "id": str(inv.id),
            "email": inv.email,
            "role": inv.role,
            "token": inv.token,
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


def _managed_org_to_dict(org: Organization, db: Session) -> dict:
    """Return org dict enriched with usage counts for the managed-orgs panel."""
    from app.models.db_models import Workspace, CloudAccount, OrganizationMember
    ws_count = db.query(Workspace).filter(
        Workspace.organization_id == org.id,
        Workspace.is_active == True,
    ).count()
    acc_count = (
        db.query(CloudAccount)
        .join(Workspace, CloudAccount.workspace_id == Workspace.id)
        .filter(
            Workspace.organization_id == org.id,
            CloudAccount.is_active == True,
        )
        .count()
    )
    mem_count = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org.id,
        OrganizationMember.is_active == True,
    ).count()
    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "plan_tier": org.plan_tier,
        "org_type": org.org_type,
        "is_active": org.is_active,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "workspaces_count": ws_count,
        "cloud_accounts_count": acc_count,
        "members_count": mem_count,
    }


@router.get("/{org_slug}/managed-orgs")
async def list_managed_orgs(
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
    """List partner orgs managed by this Enterprise master org."""
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if master_org.org_type not in ("master", "standalone") or master_org.plan_tier != "enterprise":
        raise HTTPException(status_code=403, detail="Apenas organizações Enterprise podem gerenciar parceiros.")
    child_orgs = db.query(Organization).filter(
        Organization.parent_org_id == master_org.id,
    ).order_by(Organization.created_at.asc()).all()
    return {"managed_orgs": [_managed_org_to_dict(o, db) for o in child_orgs]}


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

    base_orgs = PLAN_PRICES.get("enterprise_base_orgs", 5)
    extra_orgs = max(0, len(child_orgs) - base_orgs)
    extra_cost_centavos = extra_orgs * PLAN_PRICES.get("enterprise_extra_org", 39700)

    return {
        "total_partners": len(child_orgs),
        "total_workspaces": total_ws,
        "total_cloud_accounts": total_acc,
        "total_members": total_mem,
        "base_included_orgs": base_orgs,
        "extra_orgs": extra_orgs,
        "extra_cost_brl": extra_cost_centavos / 100,
    }


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

    # Promote master org type if needed
    if master_org.org_type == "standalone":
        master_org.org_type = "master"

    db.commit()
    db.refresh(partner_org)

    log_activity(db, member.user, "org.managed.create", "Organization",
                 resource_id=str(partner_org.id), resource_name=partner_org.name,
                 detail=f"master={master_org.slug}")

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
