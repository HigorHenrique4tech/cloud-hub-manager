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


# ── Credential encryption ─────────────────────────────────────────────────────

def encrypt_credential(data: dict) -> str:
    """Encrypt a dict of credential fields to a string."""
    f = _get_fernet()
    return f.encrypt(json.dumps(data).encode()).decode()


def decrypt_credential(encrypted: str) -> dict:
    """Decrypt an encrypted credential string back to a dict."""
    f = _get_fernet()
    return json.loads(f.decrypt(encrypted.encode()).decode())


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
