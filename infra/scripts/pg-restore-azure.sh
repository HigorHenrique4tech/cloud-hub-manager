#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# CloudAtlas — Restore PostgreSQL from Azure Blob Storage backup
#
# Usage:
#   ./pg-restore-azure.sh                     # lists available backups
#   ./pg-restore-azure.sh <blob_name>         # restores the specified backup
#
# Example:
#   ./pg-restore-azure.sh backups/cloudatlas_20260512_030000.sql.gz
#
# Required env vars:
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE
#   AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY, AZURE_STORAGE_CONTAINER
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_NAME="${1:-}"

# ── List available backups ────────────────────────────────────────────────────
if [ -z "${BACKUP_NAME}" ]; then
  echo "Available backups (newest first):"
  echo "────────────────────────────────────────────────────────────"
  az-blob list "${AZURE_STORAGE_CONTAINER}" "backups/cloudatlas_"
  echo ""
  echo "Usage: $0 <blob_name>"
  echo "Example: $0 backups/cloudatlas_20260512_030000.sql.gz"
  exit 0
fi

# ── Download backup ───────────────────────────────────────────────────────────
TMP_FILE="/tmp/restore_$(date +%s).sql.gz"

echo "[$(date -u +%FT%TZ)] Downloading ${BACKUP_NAME}..."
az-blob download "${AZURE_STORAGE_CONTAINER}" "${BACKUP_NAME}" "${TMP_FILE}"

FILESIZE_MB=$(echo "scale=2; $(stat -c%s "${TMP_FILE}" 2>/dev/null || stat -f%z "${TMP_FILE}")/1048576" | bc)
echo "[$(date -u +%FT%TZ)] Downloaded: ${FILESIZE_MB} MB"

# ── Confirm ───────────────────────────────────────────────────────────────────
echo ""
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  WARNING: This will DROP and RECREATE '${PGDATABASE}'        │"
echo "│  All current data will be replaced with the backup.          │"
echo "└──────────────────────────────────────────────────────────────┘"
echo ""
read -rp "Type 'RESTORE' to confirm: " CONFIRM

if [ "${CONFIRM}" != "RESTORE" ]; then
  echo "Aborted."
  rm -f "${TMP_FILE}"
  exit 1
fi

# ── Restore ───────────────────────────────────────────────────────────────────
export PGPASSWORD="${PGPASSWORD}"

echo "[$(date -u +%FT%TZ)] Terminating active connections..."
psql -h "${PGHOST}" -U "${PGUSER}" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname = '${PGDATABASE}' AND pid <> pg_backend_pid();" \
  2>/dev/null || true

echo "[$(date -u +%FT%TZ)] Dropping and recreating database..."
dropdb  -h "${PGHOST}" -U "${PGUSER}" --if-exists "${PGDATABASE}"
createdb -h "${PGHOST}" -U "${PGUSER}" "${PGDATABASE}"

echo "[$(date -u +%FT%TZ)] Restoring..."
gunzip -c "${TMP_FILE}" | psql -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" --quiet

rm -f "${TMP_FILE}"

echo "[$(date -u +%FT%TZ)] ✔ Restore complete from: ${BACKUP_NAME}"
echo ""
echo "IMPORTANT: Restart the backend to apply any pending migrations:"
echo "  docker compose -f infra/docker-compose.prod.yml restart backend"
