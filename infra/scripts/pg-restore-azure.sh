#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# CloudAtlas — Restore PostgreSQL from Azure Blob Storage backup
#
# Usage:
#   ./pg-restore-azure.sh                     # Lists available backups
#   ./pg-restore-azure.sh <backup_filename>   # Restores the specified backup
#
# Required env vars:
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE
#   AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY, AZURE_STORAGE_CONTAINER
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_NAME="${1:-}"

# ── List available backups ────────────────────────────────────────────────────
if [ -z "${BACKUP_NAME}" ]; then
  echo "Available backups:"
  echo "──────────────────────────────────────────────────────────────"
  az storage blob list \
    --account-name "${AZURE_STORAGE_ACCOUNT}" \
    --account-key "${AZURE_STORAGE_KEY}" \
    --container-name "${AZURE_STORAGE_CONTAINER}" \
    --prefix "backups/cloudatlas_" \
    --query "sort_by([].{name:name, size:properties.contentLength, date:properties.lastModified}, &date)" \
    --output table \
    --only-show-errors
  echo ""
  echo "Usage: $0 <blob_name>"
  echo "Example: $0 backups/cloudatlas_20260326_030000.sql.gz"
  exit 0
fi

# ── Download backup ───────────────────────────────────────────────────────────
TMP_FILE="/tmp/restore_$(date +%s).sql.gz"

echo "[$(date -u +%FT%TZ)] Downloading ${BACKUP_NAME}..."
az storage blob download \
  --account-name "${AZURE_STORAGE_ACCOUNT}" \
  --account-key "${AZURE_STORAGE_KEY}" \
  --container-name "${AZURE_STORAGE_CONTAINER}" \
  --name "${BACKUP_NAME}" \
  --file "${TMP_FILE}" \
  --only-show-errors

FILESIZE=$(du -h "${TMP_FILE}" | cut -f1)
echo "[$(date -u +%FT%TZ)] Downloaded: ${FILESIZE}"

# ── Confirm ───────────────────────────────────────────────────────────────────
echo ""
echo "WARNING: This will DROP and RECREATE the database '${PGDATABASE}'."
echo "All current data will be REPLACED with the backup."
read -p "Type 'RESTORE' to confirm: " CONFIRM

if [ "${CONFIRM}" != "RESTORE" ]; then
  echo "Aborted."
  rm -f "${TMP_FILE}"
  exit 1
fi

# ── Restore ───────────────────────────────────────────────────────────────────
export PGPASSWORD="${PGPASSWORD}"

echo "[$(date -u +%FT%TZ)] Dropping and recreating database..."
psql -h "${PGHOST}" -U "${PGUSER}" -d postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PGDATABASE}' AND pid <> pg_backend_pid();
" 2>/dev/null || true

dropdb -h "${PGHOST}" -U "${PGUSER}" --if-exists "${PGDATABASE}"
createdb -h "${PGHOST}" -U "${PGUSER}" "${PGDATABASE}"

echo "[$(date -u +%FT%TZ)] Restoring from backup..."
gunzip -c "${TMP_FILE}" | psql -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" --quiet

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -f "${TMP_FILE}"

echo "[$(date -u +%FT%TZ)] Restore complete from: ${BACKUP_NAME}"
echo "IMPORTANT: Restart the backend container to apply migrations if needed."
