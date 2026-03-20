import hmac
import json
import logging
import hashlib
import base64
import secrets
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)

# bcrypt__truncate_error=False makes passlib silently truncate instead of raising
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__truncate_error=False)

_fernet_key: Optional[bytes] = None


def _get_fernet() -> Fernet:
    global _fernet_key
    if _fernet_key is None:
        if settings.ENCRYPTION_KEY:
            _fernet_key = settings.ENCRYPTION_KEY.encode()
        else:
            key_bytes = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
            _fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(_fernet_key)


# ── Password ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(subject: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    """Returns the subject (user id) or None if invalid."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


# ── Per-org encryption keys ───────────────────────────────────────────────────

def generate_org_key() -> bytes:
    """Generate a new Fernet key for an organization."""
    return Fernet.generate_key()


def _encrypt_org_key(org_key: bytes) -> str:
    """Encrypt an org's Fernet key with the master key."""
    master = _get_fernet()
    return master.encrypt(org_key).decode()


def _decrypt_org_key(encrypted_org_key: str) -> bytes:
    """Decrypt an org's Fernet key using the master key."""
    master = _get_fernet()
    return master.decrypt(encrypted_org_key.encode())


def get_or_create_org_key(db: Session, org_id) -> bytes:
    """Get the org's Fernet key, generating one if it doesn't exist yet."""
    from app.models.db_models import Organization

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise ValueError(f"Organization {org_id} not found")

    if org.encrypted_org_key:
        return _decrypt_org_key(org.encrypted_org_key)

    # Generate and persist a new key for this org
    new_key = generate_org_key()
    org.encrypted_org_key = _encrypt_org_key(new_key)
    db.commit()
    logger.info("Generated per-org encryption key for org %s", org_id)
    return new_key


def get_org_fernet(db: Session, org_id) -> Fernet:
    """Return a Fernet instance using the org's own key."""
    org_key = get_or_create_org_key(db, org_id)
    return Fernet(org_key)


# ── Credential encryption ─────────────────────────────────────────────────────

def encrypt_credential(data: dict, org_key: bytes = None) -> str:
    """Encrypt a dict of credential fields. Uses org_key if provided, else master key."""
    f = Fernet(org_key) if org_key else _get_fernet()
    return f.encrypt(json.dumps(data).encode()).decode()


def decrypt_credential(encrypted: str, org_key: bytes = None) -> dict:
    """
    Decrypt an encrypted credential string.
    If org_key is provided, tries it first, then falls back to master key
    (for backward compatibility with credentials encrypted before per-org keys).
    """
    if org_key:
        try:
            f = Fernet(org_key)
            return json.loads(f.decrypt(encrypted.encode()).decode())
        except Exception:
            # Fallback to master key (credential was encrypted before org key existed)
            pass
    f = _get_fernet()
    return json.loads(f.decrypt(encrypted.encode()).decode())


# ── High-level helpers (org-aware) ───────────────────────────────────────────

def _get_org_id_for_workspace(db: Session, workspace_id):
    """Resolve org_id from a workspace_id (cached in-request)."""
    from app.models.db_models import Workspace
    ws = db.query(Workspace.organization_id).filter(Workspace.id == workspace_id).first()
    return ws.organization_id if ws else None


def decrypt_for_account(db: Session, account) -> dict:
    """Decrypt cloud account credentials using the org's per-org key (with fallback)."""
    org_id = _get_org_id_for_workspace(db, account.workspace_id)
    org_key = get_or_create_org_key(db, org_id) if org_id else None
    return decrypt_credential(account.encrypted_data, org_key=org_key)


def encrypt_for_org(db: Session, org_id, data: dict) -> str:
    """Encrypt credentials using the org's per-org key."""
    org_key = get_or_create_org_key(db, org_id)
    return encrypt_credential(data, org_key=org_key)


# ── MFA / OTP ─────────────────────────────────────────────────────────────────

def generate_otp() -> str:
    """Gera OTP de 6 dígitos com zero-padding."""
    return str(secrets.randbelow(1_000_000)).zfill(6)


def hash_otp(otp: str) -> str:
    """SHA-256 do OTP para armazenamento seguro no DB."""
    return hashlib.sha256(otp.encode()).hexdigest()


def verify_otp_hash(otp: str, stored_hash: str) -> bool:
    """Comparação segura contra timing attacks."""
    return hmac.compare_digest(hash_otp(otp), stored_hash)


def create_mfa_token(user_id: str) -> str:
    """JWT de 10 minutos com type='mfa' para identificar o fluxo pendente."""
    expire = datetime.utcnow() + timedelta(minutes=10)
    return jwt.encode(
        {"sub": user_id, "type": "mfa", "exp": expire},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def decode_mfa_token(token: str) -> Optional[str]:
    """Retorna user_id ou None se inválido/expirado/tipo errado."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "mfa":
            return None
        return payload.get("sub")
    except JWTError:
        return None


# ── Refresh tokens ───────────────────────────────────────────────────────────

REFRESH_TOKEN_EXPIRE_DAYS = 7


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_refresh_token(db: Session, user_id, user_agent: str = None, ip_address: str = None) -> str:
    """Generate a random refresh token, store its SHA-256 hash in DB, return the raw token."""
    from app.models.db_models import RefreshToken  # avoid circular import

    raw_token = secrets.token_urlsafe(48)
    entry = RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(raw_token),
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()
    return raw_token


def validate_refresh_token(db: Session, raw_token: str):
    """
    Validate + rotate a refresh token.
    Returns (user_id, new_raw_token) or raises ValueError.
    Revoke-on-reuse: if a revoked token is presented, ALL tokens for that user are revoked.
    """
    from app.models.db_models import RefreshToken

    token_hash = _hash_token(raw_token)
    entry = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    if not entry:
        raise ValueError("Token inválido")

    if entry.revoked:
        # Possible token theft — revoke ALL tokens for this user
        db.query(RefreshToken).filter(
            RefreshToken.user_id == entry.user_id,
            RefreshToken.revoked == False,
        ).update({"revoked": True})
        db.commit()
        raise ValueError("Token reutilizado — todos os tokens foram revogados")

    if entry.expires_at < datetime.utcnow():
        raise ValueError("Token expirado")

    # Revoke current token (single-use rotation)
    entry.revoked = True
    db.commit()

    # Issue new refresh token
    new_raw = create_refresh_token(db, entry.user_id)
    return entry.user_id, new_raw


def revoke_refresh_token(db: Session, raw_token: str) -> bool:
    """Revoke a specific refresh token. Returns True if found."""
    from app.models.db_models import RefreshToken

    token_hash = _hash_token(raw_token)
    entry = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if entry and not entry.revoked:
        entry.revoked = True
        db.commit()
        return True
    return False
