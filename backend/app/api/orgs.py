import re
from fastapi import APIRouter, HTTPException, Depends, Path
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.db_models import (
    User, Organization, OrganizationMember, Workspace,
)
from app.core.dependencies import (
    get_current_user, get_current_member, require_org_permission,
)
from app.core.auth_context import MemberContext
from app.core.permissions import VALID_ROLES
from app.services.log_service import log_activity

router = APIRouter(prefix="/orgs", tags=["Organizations"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class OrgCreate(BaseModel):
    name: str
    slug: Optional[str] = None  # auto-generated from name if omitted


class OrgUpdate(BaseModel):
    name: Optional[str] = None


class MemberInvite(BaseModel):
    email: str
    role: str = "viewer"


class MemberRoleUpdate(BaseModel):
    role: str


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


# ── Members ──────────────────────────────────────────────────────────────────


@router.get("/{org_slug}/members")
async def list_members(
    member: MemberContext = Depends(require_org_permission("org.members.view")),
    db: Session = Depends(get_db),
):
    """List all members of the organization."""
    memberships = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == member.organization_id,
            OrganizationMember.is_active == True,
        )
        .all()
    )
    result = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        if user:
            result.append({
                "user_id": str(user.id),
                "email": user.email,
                "name": user.name,
                "role": m.role,
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            })
    return {"members": result}


@router.post("/{org_slug}/members", status_code=201)
async def invite_member(
    payload: MemberInvite,
    member: MemberContext = Depends(require_org_permission("org.members.manage")),
    db: Session = Depends(get_db),
):
    """Add a user to the organization by email."""
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role inválida. Opções: {', '.join(VALID_ROLES)}")

    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

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

    return {"user_id": str(user.id), "email": user.email, "name": user.name, "role": payload.role}


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
