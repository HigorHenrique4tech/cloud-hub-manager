"""Azure Blob Storage client for Knowledge Base videos.

All blobs are private; access is granted via SAS tokens (PUT for upload, GET for playback).
Container must exist and be set to private access.

Accepts either:
  - KB_AZURE_CONNECTION_STRING  (easiest — copy from Azure Portal)
  - KB_AZURE_STORAGE_ACCOUNT + KB_AZURE_STORAGE_KEY  (legacy)
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from azure.storage.blob import BlobSasPermissions, BlobServiceClient, generate_blob_sas

from app.core.config import settings

logger = logging.getLogger(__name__)


ALLOWED_CONTENT_TYPES = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-matroska",
}


class KBStorageError(Exception):
    pass


def _parse_connection_string(conn_str: str) -> dict:
    """Parse 'Key=Value;Key=Value;...' into a dict (case-insensitive keys)."""
    result = {}
    for part in conn_str.split(";"):
        if "=" in part:
            k, _, v = part.partition("=")
            result[k.strip().lower()] = v.strip()
    return result


def _get_account_and_key() -> tuple[str, str]:
    """Return (account_name, account_key) from connection string or explicit settings."""
    if settings.KB_AZURE_CONNECTION_STRING:
        parsed = _parse_connection_string(settings.KB_AZURE_CONNECTION_STRING)
        account = parsed.get("accountname", "")
        key = parsed.get("accountkey", "")
        if account and key:
            return account, key
    return settings.KB_AZURE_STORAGE_ACCOUNT, settings.KB_AZURE_STORAGE_KEY


def is_configured() -> bool:
    account, key = _get_account_and_key()
    return bool(account and key and settings.KB_AZURE_CONTAINER)


def _account_url() -> str:
    account, _ = _get_account_and_key()
    return f"https://{account}.blob.core.windows.net"


def _assert_configured() -> None:
    if not is_configured():
        raise KBStorageError(
            "Knowledge Base storage não configurado. "
            "Defina KB_AZURE_CONNECTION_STRING (ou KB_AZURE_STORAGE_ACCOUNT + KB_AZURE_STORAGE_KEY) "
            "e KB_AZURE_CONTAINER."
        )


def build_key(article_id: str, filename: str) -> str:
    safe_name = "".join(c for c in filename if c.isalnum() or c in ("-", "_", ".")).strip(".")
    if not safe_name:
        safe_name = "video"
    return f"kb/articles/{article_id}/{uuid.uuid4().hex}-{safe_name}"


def presigned_put(blob_key: str, content_type: str, max_mb: Optional[int] = None) -> str:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise KBStorageError(f"Content-type não permitido: {content_type}")
    _assert_configured()
    account, key = _get_account_and_key()
    try:
        expiry = datetime.now(timezone.utc) + timedelta(seconds=settings.KB_PRESIGN_PUT_EXPIRE_SECONDS)
        sas = generate_blob_sas(
            account_name=account,
            container_name=settings.KB_AZURE_CONTAINER,
            blob_name=blob_key,
            account_key=key,
            permission=BlobSasPermissions(write=True, create=True),
            expiry=expiry,
            content_type=content_type,
        )
        return f"{_account_url()}/{settings.KB_AZURE_CONTAINER}/{blob_key}?{sas}"
    except Exception as e:
        logger.error("Azure SAS put failed: %s", e)
        raise KBStorageError("Falha ao gerar URL de upload")


def presigned_get(blob_key: str) -> str:
    _assert_configured()
    account, key = _get_account_and_key()
    try:
        expiry = datetime.now(timezone.utc) + timedelta(seconds=settings.KB_PRESIGN_GET_EXPIRE_SECONDS)
        sas = generate_blob_sas(
            account_name=account,
            container_name=settings.KB_AZURE_CONTAINER,
            blob_name=blob_key,
            account_key=key,
            permission=BlobSasPermissions(read=True),
            expiry=expiry,
        )
        return f"{_account_url()}/{settings.KB_AZURE_CONTAINER}/{blob_key}?{sas}"
    except Exception as e:
        logger.error("Azure SAS get failed: %s", e)
        raise KBStorageError("Falha ao gerar URL de download")


def delete_object(blob_key: str) -> None:
    if not blob_key:
        return
    if not is_configured():
        return
    _, key = _get_account_and_key()
    try:
        client = BlobServiceClient(account_url=_account_url(), credential=key)
        client.get_blob_client(container=settings.KB_AZURE_CONTAINER, blob=blob_key).delete_blob()
    except Exception as e:
        logger.warning("Azure delete failed for %s: %s", blob_key, e)
