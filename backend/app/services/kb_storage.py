"""Azure Blob Storage client for Knowledge Base videos.

All blobs are private; access is granted via SAS tokens (PUT for upload, GET for playback).
Container must exist and be set to private access.
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


def is_configured() -> bool:
    return bool(
        settings.KB_AZURE_STORAGE_ACCOUNT
        and settings.KB_AZURE_STORAGE_KEY
        and settings.KB_AZURE_CONTAINER
    )


def _account_url() -> str:
    return f"https://{settings.KB_AZURE_STORAGE_ACCOUNT}.blob.core.windows.net"


def _assert_configured() -> None:
    if not is_configured():
        raise KBStorageError(
            "Knowledge Base storage não configurado. "
            "Defina KB_AZURE_STORAGE_ACCOUNT, KB_AZURE_STORAGE_KEY e KB_AZURE_CONTAINER."
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
    try:
        expiry = datetime.now(timezone.utc) + timedelta(seconds=settings.KB_PRESIGN_PUT_EXPIRE_SECONDS)
        sas = generate_blob_sas(
            account_name=settings.KB_AZURE_STORAGE_ACCOUNT,
            container_name=settings.KB_AZURE_CONTAINER,
            blob_name=blob_key,
            account_key=settings.KB_AZURE_STORAGE_KEY,
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
    try:
        expiry = datetime.now(timezone.utc) + timedelta(seconds=settings.KB_PRESIGN_GET_EXPIRE_SECONDS)
        sas = generate_blob_sas(
            account_name=settings.KB_AZURE_STORAGE_ACCOUNT,
            container_name=settings.KB_AZURE_CONTAINER,
            blob_name=blob_key,
            account_key=settings.KB_AZURE_STORAGE_KEY,
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
    try:
        client = BlobServiceClient(account_url=_account_url(), credential=settings.KB_AZURE_STORAGE_KEY)
        client.get_blob_client(container=settings.KB_AZURE_CONTAINER, blob=blob_key).delete_blob()
    except Exception as e:
        logger.warning("Azure delete failed for %s: %s", blob_key, e)
