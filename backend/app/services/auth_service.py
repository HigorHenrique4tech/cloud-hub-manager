import json
import logging
import hashlib
import base64
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from cryptography.fernet import Fernet

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
