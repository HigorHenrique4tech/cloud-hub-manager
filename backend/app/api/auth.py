from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.db_models import (
    User, Organization, OrganizationMember, Workspace,
)
from app.models.schemas import UserCreate, UserLogin, UserResponse, TokenResponse
from app.services.auth_service import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, validate_refresh_token, revoke_refresh_token,
)
from app.services.log_service import log_activity
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def _ensure_personal_org(db: Session, user: User) -> Organization:
    """
    Make sure the user has at least one organization.
    If they don't, create a 'Personal' org + 'Default' workspace and set it
    as their default_org_id.  Returns the (possibly newly-created) org.
    """
    if user.default_org_id:
        org = db.query(Organization).filter(
            Organization.id == user.default_org_id,
            Organization.is_active == True,
        ).first()
        if org:
            return org

    # Check if the user already owns any org
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user.id,
            OrganizationMember.is_active == True,
        )
        .first()
    )
    if membership:
        org = db.query(Organization).filter(
            Organization.id == membership.organization_id,
            Organization.is_active == True,
        ).first()
        if org:
            user.default_org_id = org.id
            db.commit()
            return org

    # Create personal org
    slug_base = user.email.split("@")[0].lower()[:80]
    slug = slug_base
    counter = 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{slug_base}-{counter}"
        counter += 1

    org = Organization(name=f"Personal – {user.name}", slug=slug)
    db.add(org)
    db.flush()

    member = OrganizationMember(
        organization_id=org.id,
        user_id=user.id,
        role="owner",
    )
    db.add(member)

    ws = Workspace(
        organization_id=org.id,
        name="Default",
        slug="default",
    )
    db.add(ws)

    user.default_org_id = org.id
    db.commit()
    db.refresh(org)
    return org


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    """Register a new user"""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )

    user = User(
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-create personal org
    _ensure_personal_org(db, user)
    db.refresh(user)

    log_activity(db, user, 'auth.register', 'User', resource_id=str(user.id),
                 resource_name=user.email, provider='system')

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(
        db, user.id,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Login with email and password"""
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    # Ensure personal org exists (migration for pre-existing users)
    _ensure_personal_org(db, user)
    db.refresh(user)

    log_activity(db, user, 'auth.login', 'User', resource_id=str(user.id),
                 resource_name=user.email, provider='system')

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(
        db, user.id,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """Exchange a refresh token for a new access + refresh token pair."""
    try:
        user_id, new_refresh = validate_refresh_token(db, payload.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

    access_token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
def logout(payload: LogoutRequest, db: Session = Depends(get_db)):
    """Revoke a refresh token."""
    revoke_refresh_token(db, payload.refresh_token)
    return {"detail": "Logout realizado com sucesso"}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return UserResponse.model_validate(current_user)
