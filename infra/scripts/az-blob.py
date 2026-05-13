#!/usr/bin/env python3
"""
Lightweight Azure Blob Storage CLI for backup scripts.
Replaces the full azure-cli to keep the Docker image small.

Commands:
  az-blob upload   <container> <blob_name> <local_file>
  az-blob download <container> <blob_name> <local_file>
  az-blob delete   <container> <blob_name>
  az-blob list     <container> [prefix]
  az-blob cleanup  <container> <prefix> <retention_days>
"""
import os
import sys
from datetime import datetime, timedelta, timezone

from azure.storage.blob import BlobServiceClient


def _service() -> BlobServiceClient:
    account = os.environ["AZURE_STORAGE_ACCOUNT"]
    key = os.environ["AZURE_STORAGE_KEY"]
    return BlobServiceClient(
        f"https://{account}.blob.core.windows.net",
        credential=key,
    )


def upload(container: str, blob_name: str, file_path: str) -> None:
    with open(file_path, "rb") as fh:
        _service().get_blob_client(container, blob_name).upload_blob(fh, overwrite=True)
    size = os.path.getsize(file_path)
    print(f"Uploaded: {blob_name} ({size:,} bytes)")


def download(container: str, blob_name: str, file_path: str) -> None:
    blob = _service().get_blob_client(container, blob_name)
    with open(file_path, "wb") as fh:
        fh.write(blob.download_blob().readall())
    size = os.path.getsize(file_path)
    print(f"Downloaded: {blob_name} -> {file_path} ({size:,} bytes)")


def delete(container: str, blob_name: str) -> None:
    _service().get_blob_client(container, blob_name).delete_blob()
    print(f"Deleted: {blob_name}")


def list_blobs(container: str, prefix: str = "") -> None:
    cc = _service().get_container_client(container)
    for b in cc.list_blobs(name_starts_with=prefix):
        ts = b.last_modified.strftime("%Y-%m-%d %H:%M UTC") if b.last_modified else "unknown"
        size_mb = round((b.size or 0) / 1024 / 1024, 2)
        print(f"{b.name}\t{size_mb} MB\t{ts}")


def cleanup(container: str, prefix: str, retention_days: int) -> None:
    """Delete blobs older than retention_days whose names start with prefix."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    cc = _service().get_container_client(container)
    deleted = 0
    for b in cc.list_blobs(name_starts_with=prefix):
        if b.last_modified and b.last_modified <= cutoff:
            cc.delete_blob(b.name)
            print(f"Deleted old backup: {b.name}")
            deleted += 1
    print(f"Cleanup complete: {deleted} backup(s) removed (older than {retention_days} days)")


COMMANDS = {
    "upload":   (upload,   ["container", "blob_name", "file_path"]),
    "download": (download, ["container", "blob_name", "file_path"]),
    "delete":   (delete,   ["container", "blob_name"]),
    "list":     (list_blobs, ["container"]),
    "cleanup":  (cleanup,  ["container", "prefix", "retention_days"]),
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__, file=sys.stderr)
        sys.exit(1)

    cmd, (fn, arg_names) = sys.argv[1], COMMANDS[sys.argv[1]]
    args = sys.argv[2:]

    if len(args) < len(arg_names):
        print(f"Usage: az-blob {cmd} {' '.join('<' + a + '>' for a in arg_names)}", file=sys.stderr)
        sys.exit(1)

    # retention_days must be an int
    if cmd == "cleanup":
        fn(args[0], args[1], int(args[2]))
    else:
        fn(*args[:len(arg_names)])
