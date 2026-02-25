import logging
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.db_models import (
    User, Organization, OrganizationMember, Workspace, PendingInvitation,
)
from app.models.schemas import (
    UserCreate, UserLogin, UserResponse, TokenResponse, UserUpdate, PasswordChange,
    MFARequiredResponse, MFAVerifyRequest, MFAToggleRequest,
)
from app.services.auth_service import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, validate_refresh_token, revoke_refresh_token,
    generate_otp, hash_otp, verify_otp_hash, create_mfa_token, decode_mfa_token,
)
from app.services.oauth_service import google_get_user_info, github_get_user_info
from app.services.email_service import send_verification_email, send_otp_email
from app.services.log_service import log_activity
from app.core.dependencies import get_current_user
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


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
@limiter.limit("3/minute")
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    """Register a new user"""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )

    verification_token = secrets.token_urlsafe(32)
    user = User(
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        is_verified=False,
        verification_token=verification_token,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-create personal org
    _ensure_personal_org(db, user)
    db.refresh(user)

    log_activity(db, user, 'auth.register', 'User', resource_id=str(user.id),
                 resource_name=user.email, provider='system')

    # Send verification email
    send_verification_email(user.email, user.name, verification_token)

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


@router.post("/login")
@limiter.limit("5/minute")
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Login with email and password. Returns TokenResponse or MFARequiredResponse."""
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    # MFA check — if enabled, issue a short-lived mfa_token and send OTP
    if user.mfa_enabled:
        otp = generate_otp()
        user.mfa_otp_hash = hash_otp(otp)
        user.mfa_otp_expires_at = datetime.utcnow() + timedelta(minutes=5)
        user.mfa_otp_attempts = 0
        db.commit()
        send_otp_email(user.email, user.name, otp)
        return {"mfa_required": True, "mfa_token": create_mfa_token(str(user.id))}

    # Normal flow (MFA not enabled)
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
@limiter.limit("10/minute")
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


@router.put("/me", response_model=UserResponse)
def update_profile(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update current user's name and/or email."""
    if payload.email and payload.email != current_user.email:
        existing = db.query(User).filter(User.email == payload.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email já está em uso")
        current_user.email = payload.email

    if payload.name is not None:
        current_user.name = payload.name

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.put("/me/password")
def change_password(
    payload: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change current user's password."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"detail": "Senha alterada com sucesso"}


# ── MFA ──────────────────────────────────────────────────────────────────────


@router.post("/mfa/verify", response_model=TokenResponse)
@limiter.limit("10/minute")
def verify_mfa(payload: MFAVerifyRequest, request: Request, db: Session = Depends(get_db)):
    """Verify OTP and complete MFA login. Returns full TokenResponse."""
    user_id = decode_mfa_token(payload.mfa_token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token MFA inválido ou expirado")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user or not user.mfa_otp_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão MFA inválida")

    if not user.mfa_otp_expires_at or datetime.utcnow() > user.mfa_otp_expires_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Código expirado. Faça login novamente")

    if user.mfa_otp_attempts >= 3:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Muitas tentativas. Faça login novamente")

    if not verify_otp_hash(payload.otp, user.mfa_otp_hash):
        user.mfa_otp_attempts += 1
        db.commit()
        remaining = 3 - user.mfa_otp_attempts
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Código incorreto. {remaining} tentativa(s) restante(s)",
        )

    # Success — clear OTP fields
    user.mfa_otp_hash = None
    user.mfa_otp_expires_at = None
    user.mfa_otp_attempts = 0
    db.commit()

    _ensure_personal_org(db, user)
    db.refresh(user)

    log_activity(db, user, 'auth.login', 'User', resource_id=str(user.id),
                 resource_name=user.email, provider='system', detail='mfa=true')

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


@router.post("/mfa/resend")
@limiter.limit("3/minute")
def resend_mfa(payload: dict, request: Request, db: Session = Depends(get_db)):
    """Resend OTP for a pending MFA session."""
    user_id = decode_mfa_token(payload.get("mfa_token", ""))
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token MFA inválido ou expirado")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

    otp = generate_otp()
    user.mfa_otp_hash = hash_otp(otp)
    user.mfa_otp_expires_at = datetime.utcnow() + timedelta(minutes=5)
    user.mfa_otp_attempts = 0
    db.commit()
    send_otp_email(user.email, user.name, otp)
    return {"ok": True}


@router.put("/me/mfa")
def toggle_mfa(
    payload: MFAToggleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Enable or disable MFA for the current user (requires password confirmation)."""
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha incorreta")

    current_user.mfa_enabled = payload.enabled
    if not payload.enabled:
        current_user.mfa_otp_hash = None
        current_user.mfa_otp_expires_at = None
        current_user.mfa_otp_attempts = 0
    db.commit()

    log_activity(
        db, current_user, 'auth.mfa_toggle', 'User',
        resource_id=str(current_user.id),
        resource_name=current_user.email,
        detail=f"enabled={payload.enabled}",
        provider='system',
    )
    return {"mfa_enabled": current_user.mfa_enabled}


# ── Email Verification ──────────────────────────────────────────────────────


@router.get("/verify/{token}")
def verify_email(token: str, db: Session = Depends(get_db)):
    """Verify a user's email address using the token sent by email."""
    user = db.query(User).filter(User.verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Token de verificação inválido ou expirado")
    if user.is_verified:
        return {"detail": "Email já verificado", "already_verified": True}

    user.is_verified = True
    user.verification_token = None
    db.commit()

    log_activity(db, user, "auth.email_verified", "User",
                 resource_id=str(user.id), resource_name=user.email, provider="system")

    return {"detail": "Email verificado com sucesso", "already_verified": False}


@router.post("/resend-verification")
def resend_verification(payload: ResendVerificationRequest, db: Session = Depends(get_db)):
    """Resend the verification email."""
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()
    if not user:
        # Don't reveal if email exists
        return {"detail": "Se o email estiver cadastrado, enviaremos o link de verificação"}
    if user.is_verified:
        return {"detail": "Email já verificado"}

    # Generate new token
    new_token = secrets.token_urlsafe(32)
    user.verification_token = new_token
    db.commit()

    send_verification_email(user.email, user.name, new_token)
    return {"detail": "Se o email estiver cadastrado, enviaremos o link de verificação"}


# ── Invitations ─────────────────────────────────────────────────────────────


@router.get("/invitations")
def my_invitations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List pending invitations for the current user's email."""
    now = datetime.utcnow()
    invites = (
        db.query(PendingInvitation)
        .filter(
            PendingInvitation.email == current_user.email,
            PendingInvitation.accepted_at == None,
            PendingInvitation.expires_at > now,
        )
        .order_by(PendingInvitation.created_at.desc())
        .all()
    )
    result = []
    for inv in invites:
        org = db.query(Organization).filter(Organization.id == inv.organization_id).first()
        result.append({
            "id": str(inv.id),
            "token": inv.token,
            "organization_name": org.name if org else "Desconhecida",
            "organization_slug": org.slug if org else None,
            "role": inv.role,
            "created_at": inv.created_at.isoformat(),
            "expires_at": inv.expires_at.isoformat(),
        })
    return {"invitations": result}


@router.post("/invitations/{token}/accept")
def accept_invitation(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept a pending invitation by token."""
    now = datetime.utcnow()
    invite = db.query(PendingInvitation).filter(PendingInvitation.token == token).first()

    if not invite:
        raise HTTPException(status_code=404, detail="Convite não encontrado")
    if invite.accepted_at is not None:
        raise HTTPException(status_code=400, detail="Convite já foi aceito")
    if invite.expires_at < now:
        raise HTTPException(status_code=400, detail="Convite expirado")
    if invite.email.lower() != current_user.email.lower():
        raise HTTPException(status_code=403, detail="Este convite não pertence ao seu email")

    # Check if already a member
    existing = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == invite.organization_id,
        OrganizationMember.user_id == current_user.id,
    ).first()
    if existing:
        if existing.is_active:
            invite.accepted_at = now
            db.commit()
            org = db.query(Organization).filter(Organization.id == invite.organization_id).first()
            return {"detail": "Você já é membro desta organização", "organization_name": org.name if org else None, "organization_slug": org.slug if org else None}
        existing.is_active = True
        existing.role = invite.role
        existing.invited_by = invite.invited_by
    else:
        new_member = OrganizationMember(
            organization_id=invite.organization_id,
            user_id=current_user.id,
            role=invite.role,
            invited_by=invite.invited_by,
        )
        db.add(new_member)

    invite.accepted_at = now
    db.commit()

    log_activity(db, current_user, "org.member.invite_accepted", "OrganizationMember",
                 resource_name=current_user.email, detail=f"role={invite.role}",
                 provider="system")

    org = db.query(Organization).filter(Organization.id == invite.organization_id).first()
    return {
        "detail": "Convite aceito com sucesso",
        "organization_name": org.name if org else None,
        "organization_slug": org.slug if org else None,
        "role": invite.role,
    }


# ── OAuth (SSO) ────────────────────────────────────────────────────────────


class OAuthCallback(BaseModel):
    code: str
    redirect_uri: str = ""


def _oauth_login_or_register(
    db: Session,
    request: Request,
    *,
    email: str,
    name: str,
    provider: str,
    oauth_id: str,
    avatar_url: str | None,
) -> TokenResponse:
    """Shared logic for Google / GitHub OAuth callback.

    1. Find user by oauth_id+provider OR by email.
    2. If not found → create new user (verified, random password).
    3. If found without OAuth → link OAuth fields.
    4. Ensure personal org exists.
    5. Return JWT + refresh token.
    """
    # Try to find by oauth link first
    user = db.query(User).filter(
        User.oauth_provider == provider,
        User.oauth_id == oauth_id,
        User.is_active == True,
    ).first()

    # Fall back to email match
    if not user:
        user = db.query(User).filter(User.email == email, User.is_active == True).first()

    if user:
        # Link OAuth if not yet linked
        if not user.oauth_provider:
            user.oauth_provider = provider
            user.oauth_id = oauth_id
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
        if not user.is_verified:
            user.is_verified = True
            user.verification_token = None
        db.commit()
        action = "auth.oauth_login"
    else:
        # Create new user
        user = User(
            email=email,
            name=name,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            is_verified=True,
            oauth_provider=provider,
            oauth_id=oauth_id,
            avatar_url=avatar_url,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        action = "auth.oauth_register"

    _ensure_personal_org(db, user)
    db.refresh(user)

    log_activity(
        db, user, action, "User",
        resource_id=str(user.id),
        resource_name=user.email,
        detail=f"provider={provider}",
        provider="system",
    )

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


@router.post("/google/callback", response_model=TokenResponse)
@limiter.limit("5/minute")
async def google_callback(
    payload: OAuthCallback,
    request: Request,
    db: Session = Depends(get_db),
):
    """Login or register via Google OAuth2."""
    try:
        info = await google_get_user_info(payload.code, payload.redirect_uri)
    except Exception as exc:
        logger.error("Google OAuth failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Falha na autenticação com Google")

    return _oauth_login_or_register(
        db, request,
        email=info["email"],
        name=info["name"],
        provider="google",
        oauth_id=info["oauth_id"],
        avatar_url=info.get("avatar_url"),
    )


@router.post("/github/callback", response_model=TokenResponse)
@limiter.limit("5/minute")
async def github_callback(
    payload: OAuthCallback,
    request: Request,
    db: Session = Depends(get_db),
):
    """Login or register via GitHub OAuth2."""
    try:
        info = await github_get_user_info(payload.code)
    except Exception as exc:
        logger.error("GitHub OAuth failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Falha na autenticação com GitHub")

    return _oauth_login_or_register(
        db, request,
        email=info["email"],
        name=info["name"],
        provider="github",
        oauth_id=info["oauth_id"],
        avatar_url=info.get("avatar_url"),
    )
