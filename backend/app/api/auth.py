import logging
import re as _re
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator

from app.database import get_db
from app.models.db_models import (
    User, Organization, OrganizationMember, Workspace, PendingInvitation,
)
from app.models.schemas import (
    UserCreate, UserLogin, UserResponse, TokenResponse, UserUpdate, PasswordChange,
    MFARequiredResponse, MFAVerifyRequest, MFAToggleRequest,
)
from app.services.auth_service import (
    hash_password, verify_password, verify_and_rehash, create_access_token,
    create_refresh_token, validate_refresh_token, revoke_refresh_token,
    revoke_all_user_tokens, decode_token_claims, revoke_access_jti,
    generate_otp, hash_otp, verify_otp_hash, create_mfa_token, decode_mfa_token,
)
from app.services.oauth_service import google_get_user_info, github_get_user_info, microsoft_get_user_info
from app.services.email_service import send_verification_email, send_otp_email, check_email_cooldown
from app.services.log_service import log_activity
from app.core.dependencies import get_current_user
from app.core.limiter import limiter, get_real_ip
from app.core.config import settings
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])

# ── Refresh token cookie helpers ─────────────────────────────────────────────
_RT_COOKIE = "rt"
_RT_MAX_AGE = 30 * 24 * 3600  # 30 days


def _set_refresh_cookie(response, token: str) -> None:
    """Set the refresh token as an HttpOnly cookie restricted to auth endpoints."""
    response.set_cookie(
        key=_RT_COOKIE,
        value=token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=_RT_MAX_AGE,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response) -> None:
    response.delete_cookie(key=_RT_COOKIE, path="/api/v1/auth",
                           httponly=True, secure=not settings.DEBUG, samesite="lax")


def _get_refresh_token(request: Request, body_token: Optional[str] = None) -> Optional[str]:
    """Prefer cookie; fall back to body field (backward compat for old clients)."""
    return request.cookies.get(_RT_COOKIE) or body_token


def _user_response(user, db: Session) -> "UserResponse":
    """Build UserResponse with terms_accepted always populated."""
    from app.models.db_models import TermsAcceptance
    acceptance = (
        db.query(TermsAcceptance)
        .filter(TermsAcceptance.user_id == user.id, TermsAcceptance.version == settings.TERMS_VERSION)
        .first()
    )
    data = UserResponse.model_validate(user)
    data.terms_accepted = acceptance is not None
    data.terms_version = settings.TERMS_VERSION
    return data


# ── Schemas ──────────────────────────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = None


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


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

    org_name = user.company_name if user.company_name else f"Personal – {user.name}"
    org = Organization(
        name=org_name,
        slug=slug,
        trial_ends_at=datetime.utcnow() + timedelta(days=30),
        phone=user.phone,
        cnpj=user.cnpj,
    )
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


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    """Register a new user"""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível criar a conta. Verifique os dados e tente novamente."
        )

    verification_token = secrets.token_urlsafe(32)
    user = User(
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        is_verified=False,
        verification_token=verification_token,
        verification_token_expires_at=datetime.utcnow() + timedelta(hours=48),
        phone=payload.phone,
        company_name=payload.company_name,
        cnpj=payload.cnpj,
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
        ip_address=get_real_ip(request),
    )
    needs_info = not payload.company_name
    resp_payload = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_response(user, db),
        needs_company_info=needs_info,
    )
    response = JSONResponse(content=resp_payload.model_dump(mode='json'), status_code=201)
    _set_refresh_cookie(response, refresh_token)
    return response


@router.post("/login")
@limiter.limit("5/minute")
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Login with email and password. Returns TokenResponse or MFARequiredResponse."""
    from app.core.redis_client import (
        is_login_locked, record_login_failure, clear_login_failures,
    )

    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    # Per-user lockout (in addition to per-IP rate limit) to mitigate
    # distributed brute-force.
    if is_login_locked(str(user.id)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos.",
        )

    valid, new_hash = verify_and_rehash(payload.password, user.hashed_password)
    if not valid:
        record_login_failure(str(user.id))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )
    clear_login_failures(str(user.id))

    # Block login until email is verified, except for OAuth-onboarded users
    # whose provider already validated the address.
    if not user.is_verified and not user.oauth_provider:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email não verificado. Verifique sua caixa de entrada ou solicite o reenvio do link.",
        )
    # Transparently upgrade legacy bcrypt hashes to bcrypt_sha256
    if new_hash:
        user.hashed_password = new_hash
        db.commit()

    # MFA check — if enabled, issue a short-lived mfa_token and send OTP
    if user.mfa_enabled:
        if not check_email_cooldown(user.email, "otp"):
            raise HTTPException(status_code=429, detail="Aguarde antes de solicitar outro código")
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
        ip_address=get_real_ip(request),
    )
    payload = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_response(user, db),
    )
    response = JSONResponse(content=payload.model_dump(mode='json'))
    _set_refresh_cookie(response, refresh_token)
    return response


@router.post("/refresh")
@limiter.limit("10/minute")
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """Exchange a refresh token for a new access + refresh token pair."""
    token = _get_refresh_token(request, payload.refresh_token)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token não fornecido")
    try:
        user_id, new_refresh = validate_refresh_token(db, token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

    access_token = create_access_token(str(user.id))
    resp_payload = TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        user=_user_response(user, db),
    )
    response = JSONResponse(content=resp_payload.model_dump(mode='json'))
    _set_refresh_cookie(response, new_refresh)
    return response


@router.post("/logout")
@limiter.limit("10/minute")
def logout(payload: LogoutRequest, request: Request, db: Session = Depends(get_db)):
    """Revoke the refresh token AND the current access token's jti."""
    token = _get_refresh_token(request, payload.refresh_token)
    if token:
        revoke_refresh_token(db, token)

    # Best-effort: revoke the access token presented in the Authorization header
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        claims = decode_token_claims(auth[7:])
        if claims and claims.get("jti"):
            revoke_access_jti(claims["jti"], claims.get("exp"))

    response = JSONResponse(content={"detail": "Logout realizado com sucesso"})
    _clear_refresh_cookie(response)
    return response


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get current authenticated user"""
    return _user_response(current_user, db)


@router.get("/terms")
def get_terms():
    """Return current terms version. Public endpoint."""
    return {"version": settings.TERMS_VERSION}


@router.post("/terms/accept", status_code=201)
def accept_terms(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record user acceptance of current terms of use."""
    from app.models.db_models import TermsAcceptance
    current_version = settings.TERMS_VERSION

    existing = (
        db.query(TermsAcceptance)
        .filter(TermsAcceptance.user_id == current_user.id, TermsAcceptance.version == current_version)
        .first()
    )
    if existing:
        return {"accepted": True, "version": current_version, "already_accepted": True}

    ip = get_real_ip(request)
    ua = request.headers.get("User-Agent", "")[:500]

    record = TermsAcceptance(
        user_id=current_user.id,
        version=current_version,
        ip_address=ip,
        user_agent=ua,
    )
    db.add(record)
    db.commit()

    logger.info("Usuário %s aceitou os termos v%s (IP: %s)", current_user.email, current_version, ip)
    return {"accepted": True, "version": current_version, "accepted_at": record.accepted_at.isoformat()}


@router.get("/my-orgs")
def my_orgs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List organizations the current user belongs to."""
    memberships = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == current_user.id, OrganizationMember.is_active == True)
        .all()
    )
    return {
        "organizations": [
            {
                "id": str(m.organization_id),
                "slug": m.organization.slug,
                "name": m.organization.name,
                "role": m.role,
            }
            for m in memberships
            if m.organization
        ]
    }


@router.put("/me", response_model=UserResponse)
def update_profile(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update current user's name and/or email.

    Email changes use a double-opt-in flow: a confirmation link is sent to the
    new address, and the email field on the user is only updated after the link
    is clicked. The old email remains valid in the meantime.
    """
    email_change_requested = False
    if payload.email and payload.email != current_user.email:
        # OAuth-only users cannot change email here (no password to verify)
        if current_user.oauth_provider and not current_user.hashed_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Contas vinculadas a SSO devem alterar o email no provedor.",
            )

        # Require current password to authorize the change
        if not payload.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Informe sua senha atual para alterar o email.",
            )
        if not verify_password(payload.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Senha atual incorreta.",
            )

        # Reject if the new email is already taken (current OR pending)
        existing = (
            db.query(User)
            .filter(
                ((User.email == payload.email) | (User.pending_email == payload.email)),
                User.id != current_user.id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email já está em uso")

        # Stash the new email and issue a confirmation token. Do NOT touch
        # current_user.email yet — the old address remains the login of record.
        current_user.pending_email = payload.email
        current_user.email_change_token = secrets.token_urlsafe(32)
        current_user.email_change_expires_at = datetime.utcnow() + timedelta(hours=24)
        email_change_requested = True

    if payload.name is not None:
        current_user.name = payload.name

    if payload.onboarding_completed is not None:
        current_user.onboarding_completed = payload.onboarding_completed

    db.commit()
    db.refresh(current_user)

    if email_change_requested:
        try:
            from app.services.email_service import send_email_change_confirmation
            send_email_change_confirmation(
                to_email=current_user.pending_email,
                user_name=current_user.name or current_user.pending_email.split("@")[0],
                token=current_user.email_change_token,
            )
        except Exception as exc:
            logger.warning("Failed to send email change confirmation: %s", exc)

    return _user_response(current_user, db)


class EmailChangeConfirmRequest(BaseModel):
    token: str


@router.post("/email/confirm", status_code=200)
@limiter.limit("5/minute")
def confirm_email_change(payload: EmailChangeConfirmRequest, request: Request, db: Session = Depends(get_db)):
    """Promote pending_email → email after the user clicks the confirmation link."""
    user = (
        db.query(User)
        .filter(User.email_change_token == payload.token, User.is_active == True)
        .first()
    )
    if not user or not user.email_change_expires_at or user.email_change_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Link de confirmação inválido ou expirado.")
    if not user.pending_email:
        raise HTTPException(status_code=400, detail="Nenhuma alteração de email pendente.")

    # Race: another user may have grabbed this email since the request was made
    taken = (
        db.query(User)
        .filter(User.email == user.pending_email, User.id != user.id)
        .first()
    )
    if taken:
        user.pending_email = None
        user.email_change_token = None
        user.email_change_expires_at = None
        db.commit()
        raise HTTPException(status_code=409, detail="Este email foi cadastrado por outra conta. Tente outro endereço.")

    old_email = user.email
    new_email = user.pending_email
    user.email = new_email
    user.pending_email = None
    user.email_change_token = None
    user.email_change_expires_at = None
    db.commit()

    # Force re-login on all devices for safety
    revoke_all_user_tokens(db, user.id)

    # Notify the previous email so the user can react if it wasn't them
    try:
        from app.services.email_service import send_email_change_notification
        send_email_change_notification(
            to_email=old_email,
            user_name=user.name or old_email.split("@")[0],
            new_email=new_email,
        )
    except Exception as exc:
        logger.warning("Failed to notify old email of change: %s", exc)

    log_activity(
        db, user, "auth.email_changed", "User",
        resource_id=str(user.id),
        detail=f"{old_email} -> {new_email}",
    )
    return {"detail": "Email atualizado com sucesso. Faça login novamente."}


# ── Company Info ──────────────────────────────────────────────────────────────

class CompanyInfoPayload(BaseModel):
    name: str | None = None
    phone: str | None = None
    company_name: str | None = None
    cnpj: str | None = None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return v
        from app.models.schemas import _validate_phone
        return _validate_phone(v)

    @field_validator('cnpj')
    @classmethod
    def validate_cnpj(cls, v):
        if v is None:
            return v
        from app.models.schemas import _validate_cnpj
        return _validate_cnpj(v)


@router.put("/me/company-info", response_model=UserResponse)
def update_company_info(
    payload: CompanyInfoPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save company name, CNPJ, and phone collected after registration."""
    if payload.name is not None:
        current_user.name = payload.name
    if payload.phone is not None:
        current_user.phone = payload.phone
    if payload.company_name is not None:
        current_user.company_name = payload.company_name
    if payload.cnpj is not None:
        current_user.cnpj = payload.cnpj

    db.commit()

    # Update personal org with the new info
    org = _ensure_personal_org(db, current_user)
    if payload.company_name:
        org.name = payload.company_name
    if payload.phone:
        org.phone = payload.phone
    if payload.cnpj:
        org.cnpj = payload.cnpj
    db.commit()
    db.refresh(current_user)
    return _user_response(current_user, db)


# ── CNPJ Lookup (authenticated) ──────────────────────────────────────────────

_CNPJ_CACHE_TTL = 86400  # 24h — CNPJ data changes infrequently
_CNPJ_NEG_CACHE_TTL = 600  # 10min — short TTL for not-found (data may appear)


@router.get("/cnpj/{cnpj}")
@limiter.limit("10/minute")
async def lookup_cnpj(
    cnpj: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Validate and look up a Brazilian CNPJ. Tries BrasilAPI then cnpj.ws as fallback."""
    import json
    from app.core.redis_client import cache_get, cache_set

    digits = _re.sub(r"\D", "", cnpj)
    if len(digits) != 14:
        raise HTTPException(status_code=400, detail="CNPJ deve ter 14 dígitos")

    cache_key = f"cnpj_cache:{digits}"
    cached = cache_get(cache_key)
    if cached:
        payload = json.loads(cached)
        if payload.get("error"):
            raise HTTPException(status_code=404, detail="CNPJ não encontrado ou inválido")
        return payload["data"]

    async with httpx.AsyncClient(timeout=8.0) as client:
        # Tentativa 1: BrasilAPI
        try:
            resp = await client.get(f"https://brasilapi.com.br/api/cnpj/v1/{digits}")
            if resp.status_code == 200:
                raw = resp.json()
                result = {
                    "cnpj": digits,
                    "razao_social": raw.get("razao_social", ""),
                    "nome_fantasia": raw.get("nome_fantasia", ""),
                    "situacao_cadastral": raw.get("descricao_situacao_cadastral", ""),
                    "uf": raw.get("uf", ""),
                    "municipio": raw.get("municipio", ""),
                }
                cache_set(cache_key, json.dumps({"data": result}), _CNPJ_CACHE_TTL)
                return result
        except Exception:
            pass

        # Tentativa 2: cnpj.ws (Receita Federal direta)
        try:
            resp2 = await client.get(f"https://publica.cnpj.ws/cnpj/{digits}")
            if resp2.status_code == 200:
                raw2 = resp2.json()
                estabelecimento = raw2.get("estabelecimento", {})
                situacao = estabelecimento.get("situacao_cadastral", "")
                municipio = (estabelecimento.get("cidade") or {}).get("nome", "")
                uf = estabelecimento.get("estado", {}).get("sigla", "") if isinstance(estabelecimento.get("estado"), dict) else estabelecimento.get("uf", "")
                result = {
                    "cnpj": digits,
                    "razao_social": raw2.get("razao_social", ""),
                    "nome_fantasia": estabelecimento.get("nome_fantasia", "") or raw2.get("razao_social", ""),
                    "situacao_cadastral": situacao,
                    "uf": uf,
                    "municipio": municipio,
                }
                cache_set(cache_key, json.dumps({"data": result}), _CNPJ_CACHE_TTL)
                return result
        except Exception:
            pass

    cache_set(cache_key, json.dumps({"error": True}), _CNPJ_NEG_CACHE_TTL)
    raise HTTPException(status_code=404, detail="CNPJ não encontrado ou inválido")


@router.put("/me/password")
def change_password(
    payload: PasswordChange,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change current user's password."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    revoke_all_user_tokens(db, current_user.id)

    # Also revoke the access token currently in use so the 30-min window is closed.
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        claims = decode_token_claims(auth[7:])
        if claims and claims.get("jti"):
            revoke_access_jti(claims["jti"], claims.get("exp"))

    return {"detail": "Senha alterada com sucesso"}


# ── MFA ──────────────────────────────────────────────────────────────────────


@router.post("/mfa/verify")
@limiter.limit("5/minute")
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
        ip_address=get_real_ip(request),
    )
    resp_payload = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_response(user, db),
    )
    response = JSONResponse(content=resp_payload.model_dump(mode='json'))
    _set_refresh_cookie(response, refresh_token)
    return response


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

    if not check_email_cooldown(user.email, "otp"):
        raise HTTPException(status_code=429, detail="Aguarde 60 segundos antes de solicitar outro código")

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
    if current_user.oauth_provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MFA não está disponível para contas OAuth. A segurança é gerenciada pelo provedor de identidade.",
        )
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

    if user.verification_token_expires_at and user.verification_token_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="Token de verificação expirado. Solicite um novo link de verificação.",
        )

    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    db.commit()

    log_activity(db, user, "auth.email_verified", "User",
                 resource_id=str(user.id), resource_name=user.email, provider="system")

    # Send welcome email after successful verification
    try:
        from app.services.email_service import send_welcome_email
        send_welcome_email(
            to_email=user.email,
            user_name=user.name or user.email.split("@")[0],
        )
    except Exception:
        pass  # Non-critical — don't break verification flow

    return {"detail": "Email verificado com sucesso", "already_verified": False}


@router.post("/resend-verification")
@limiter.limit("3/minute")
def resend_verification(payload: ResendVerificationRequest, request: Request, db: Session = Depends(get_db)):
    """Resend the verification email."""
    _GENERIC_RESEND = {"detail": "Se o email estiver cadastrado e não verificado, enviaremos o link de verificação"}
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()
    if not user or user.is_verified:
        # Unified response — don't reveal if email exists or is already verified
        return _GENERIC_RESEND

    if not check_email_cooldown(user.email, "verification"):
        return _GENERIC_RESEND

    # Generate new token
    new_token = secrets.token_urlsafe(32)
    user.verification_token = new_token
    user.verification_token_expires_at = datetime.utcnow() + timedelta(hours=48)
    db.commit()

    send_verification_email(user.email, user.name, new_token)
    return _GENERIC_RESEND


# ── Password reset ────────────────────────────────────────────────────────────


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password", status_code=200)
@limiter.limit("3/minute")
def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Request a password reset link. Always returns 200 to avoid email enumeration."""
    from app.services.email_service import send_password_reset_email

    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()
    if user and not user.oauth_provider:
        token = secrets.token_urlsafe(32)
        user.password_reset_token = token
        user.password_reset_expires_at = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        try:
            send_password_reset_email(user.email, user.name, token)
        except Exception as exc:
            # Log the error WITHOUT the token to prevent credential leakage in logs
            logger.error("Failed to send password reset email to %s: %s", user.email, type(exc).__name__)

    return {"detail": "Se o email estiver cadastrado, você receberá as instruções em breve."}


@router.post("/reset-password", status_code=200)
@limiter.limit("5/minute")
def reset_password(request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Apply a new password using a valid reset token."""
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=422, detail="A senha deve ter pelo menos 8 caracteres.")

    user = (
        db.query(User)
        .filter(
            User.password_reset_token == payload.token,
            User.is_active == True,
        )
        .first()
    )

    if not user or not user.password_reset_expires_at or user.password_reset_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Token inválido ou expirado.")

    user.hashed_password = hash_password(payload.new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    db.commit()
    revoke_all_user_tokens(db, user.id)

    log_activity(
        db, user, "auth.password_reset", "User",
        resource_id=str(user.id),
        detail="Senha redefinida via link de email",
    )
    return {"detail": "Senha redefinida com sucesso. Você já pode fazer login."}


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
    state: Optional[str] = None


def _verify_oauth_state(provider: str, state: Optional[str]) -> None:
    """Validate the OAuth state token (anti-CSRF). Raises 400 on failure."""
    from app.core.redis_client import consume_oauth_state
    if not state:
        raise HTTPException(status_code=400, detail="OAuth state ausente. Reinicie o login.")
    if not consume_oauth_state(state, provider):
        raise HTTPException(status_code=400, detail="OAuth state inválido ou expirado. Reinicie o login.")


def _oauth_login_or_register(
    db: Session,
    request: Request,
    *,
    email: str,
    name: str,
    provider: str,
    oauth_id: str,
    avatar_url: str | None,
    email_verified: bool = False,
) -> TokenResponse:
    """Shared logic for Google / GitHub OAuth callback.

    1. Find user by oauth_id+provider OR by email.
    2. If not found → create new user (verified, random password).
    3. If found without OAuth → link OAuth fields, but only if the provider
       confirms the email is verified (prevents account takeover via spoofed
       email at the OAuth provider).
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

    is_new_user = False
    if user:
        # If user exists but is not yet linked to this provider, only allow
        # auto-link when the provider asserts the email is verified.
        if not user.oauth_provider:
            if not email_verified:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Já existe uma conta com este email. Faça login com "
                        f"senha e vincule sua conta {provider} nas configurações."
                    ),
                )
            user.oauth_provider = provider
            user.oauth_id = oauth_id
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
        # Only auto-verify when provider confirmed verification
        if not user.is_verified and email_verified:
            user.is_verified = True
            user.verification_token = None
            user.verification_token_expires_at = None
        db.commit()
        action = "auth.oauth_login"
    else:
        # Create new user — defer verification when provider didn't confirm
        user = User(
            email=email,
            name=name,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            is_verified=bool(email_verified),
            oauth_provider=provider,
            oauth_id=oauth_id,
            avatar_url=avatar_url,
        )
        if not email_verified:
            # Issue a verification token so the user can confirm via email
            user.verification_token = secrets.token_urlsafe(32)
            user.verification_token_expires_at = datetime.utcnow() + timedelta(hours=48)
        db.add(user)
        db.commit()
        db.refresh(user)
        if not email_verified:
            try:
                send_verification_email(user.email, user.name, user.verification_token)
            except Exception as exc:
                logger.warning("Failed to send OAuth verification email to %s: %s", user.email, exc)
        action = "auth.oauth_register"
        is_new_user = True

    _ensure_personal_org(db, user)
    db.refresh(user)

    if is_new_user:
        try:
            from app.services.email_service import send_welcome_email
            send_welcome_email(user.email, user.name or user.email)
        except Exception as exc:
            logger.warning("Failed to send SSO welcome email to %s: %s", user.email, exc)

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
        ip_address=get_real_ip(request),
    )
    resp_payload = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_user_response(user, db),
        needs_company_info=is_new_user,
    )
    response = JSONResponse(content=resp_payload.model_dump(mode='json'))
    _set_refresh_cookie(response, refresh_token)
    return response


@router.post("/oauth/state")
@limiter.limit("20/minute")
async def create_oauth_state(
    request: Request,
):
    """Generate a single-use OAuth state token (anti-CSRF). The frontend must
    pass this in the OAuth provider URL (`?state=<token>`) and back to the
    callback endpoint, where it is consumed exactly once."""
    from app.core.redis_client import store_oauth_state
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    provider = (body or {}).get("provider", "")
    if provider not in ("google", "github", "microsoft"):
        raise HTTPException(status_code=400, detail="Provider inválido")
    state = secrets.token_urlsafe(32)
    if not store_oauth_state(state, provider, ttl_seconds=600):
        raise HTTPException(status_code=503, detail="Não foi possível gerar state OAuth (Redis indisponível). Tente novamente.")
    return {"state": state}


@router.post("/google/callback")
@limiter.limit("5/minute")
async def google_callback(
    payload: OAuthCallback,
    request: Request,
    db: Session = Depends(get_db),
):
    """Login or register via Google OAuth2."""
    _verify_oauth_state("google", payload.state)
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
        email_verified=bool(info.get("email_verified")),
    )


@router.post("/github/callback")
@limiter.limit("5/minute")
async def github_callback(
    payload: OAuthCallback,
    request: Request,
    db: Session = Depends(get_db),
):
    """Login or register via GitHub OAuth2."""
    _verify_oauth_state("github", payload.state)
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
        email_verified=bool(info.get("email_verified")),
    )


@router.post("/microsoft/callback")
@limiter.limit("5/minute")
async def microsoft_callback(
    payload: OAuthCallback,
    request: Request,
    db: Session = Depends(get_db),
):
    """Login or register via Microsoft OAuth2."""
    _verify_oauth_state("microsoft", payload.state)
    try:
        redirect_uri = payload.redirect_uri or f"{settings.FRONTEND_URL}/auth/microsoft/callback"
        info = await microsoft_get_user_info(payload.code, redirect_uri)
    except Exception as exc:
        logger.error("Microsoft OAuth failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Falha na autenticação com Microsoft")

    return _oauth_login_or_register(
        db, request,
        email=info["email"],
        name=info["name"],
        provider="microsoft",
        oauth_id=info["oauth_id"],
        avatar_url=info.get("avatar_url"),
        email_verified=bool(info.get("email_verified")),
    )


# ── LGPD — Direito ao Esquecimento e Portabilidade ───────────────────────────

class AccountDeleteRequest(BaseModel):
    password: str


@router.delete("/me/account", status_code=200)
@limiter.limit("3/minute")
def delete_account(
    payload: AccountDeleteRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """LGPD Art. 18 — Direito ao Esquecimento.

    Anonymizes all personal data and deactivates the account. Billing records and
    audit logs are retained as required by law but are detached from PII.
    Hard-deletion is deferred to a scheduled cleanup job (90-day retention).
    """
    # OAuth users have no password — skip verification if oauth_provider set
    if not current_user.oauth_provider:
        if not verify_password(payload.password, current_user.hashed_password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha incorreta.")

    uid = str(current_user.id)
    anon_email = f"deleted_{uid[:8]}@deleted.local"

    # Revoke all active sessions first
    revoke_all_user_tokens(db, current_user.id)
    from app.core.redis_client import revoke_access_jti
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        claims = decode_token_claims(auth[7:])
        if claims and claims.get("jti"):
            revoke_access_jti(claims["jti"], claims.get("exp"))

    # Anonymize PII — keep id/created_at for audit integrity
    current_user.email = anon_email
    current_user.name = "Usuário Deletado"
    current_user.hashed_password = hash_password(secrets.token_hex(32))
    current_user.phone = None
    current_user.company_name = None
    current_user.cnpj = None
    current_user.avatar_url = None
    current_user.verification_token = None
    current_user.password_reset_token = None
    current_user.email_change_token = None
    current_user.pending_email = None
    current_user.oauth_provider = None
    current_user.oauth_id = None
    current_user.is_active = False
    current_user.is_verified = False
    current_user.mfa_enabled = False
    current_user.mfa_otp_hash = None

    db.commit()
    log_activity(db, current_user, "auth.account_deleted", "User", resource_id=uid,
                 resource_name=anon_email, provider="system")
    return {"detail": "Conta encerrada. Seus dados pessoais foram anonimizados conforme a LGPD."}


@router.get("/me/export")
@limiter.limit("5/minute")
def export_my_data(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """LGPD Art. 18 III — Direito à Portabilidade de Dados.

    Returns all personal data held for the authenticated user in JSON format.
    """
    from app.models.db_models import (
        OrganizationMember, TermsAcceptance, RefreshToken,
    )

    memberships = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id
    ).all()

    terms = db.query(TermsAcceptance).filter(
        TermsAcceptance.user_id == current_user.id
    ).all()

    sessions = db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked == False,
    ).all()

    return {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "profile": {
            "id": str(current_user.id),
            "email": current_user.email,
            "name": current_user.name,
            "phone": current_user.phone,
            "company_name": current_user.company_name,
            "cnpj": current_user.cnpj,
            "avatar_url": current_user.avatar_url,
            "mfa_enabled": current_user.mfa_enabled,
            "oauth_provider": current_user.oauth_provider,
            "is_verified": current_user.is_verified,
            "onboarding_completed": current_user.onboarding_completed,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        },
        "organizations": [
            {
                "organization_id": str(m.organization_id),
                "role": m.role,
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            }
            for m in memberships
        ],
        "terms_acceptances": [
            {
                "version": t.version,
                "accepted_at": t.accepted_at.isoformat() if t.accepted_at else None,
                "ip_address": t.ip_address,
            }
            for t in terms
        ],
        "active_sessions": [
            {
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "user_agent": s.user_agent,
                "ip_address": s.ip_address,
                "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            }
            for s in sessions
        ],
    }
