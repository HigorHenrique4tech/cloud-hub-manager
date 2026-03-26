#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# CloudAtlas — PostgreSQL backup to Azure Blob Storage
#
# Runs pg_dump, compresses with gzip, uploads to Azure Blob via az CLI,
# and cleans up backups older than RETENTION_DAYS.
#
# Required env vars:
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE
#   AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY, AZURE_STORAGE_CONTAINER
#
# Optional:
#   RETENTION_DAYS  (default: 30)
#   BACKUP_PREFIX   (default: "cloudatlas")
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_PREFIX="${BACKUP_PREFIX:-cloudatlas}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
FILENAME="${BACKUP_PREFIX}_${TIMESTAMP}.sql.gz"
TMP_DIR="/tmp/pg-backups"
TMP_FILE="${TMP_DIR}/${FILENAME}"

mkdir -p "${TMP_DIR}"

echo "[$(date -u +%FT%TZ)] Starting backup: ${FILENAME}"

# ── 1. Dump ───────────────────────────────────────────────────────────────────
export PGPASSWORD="${PGPASSWORD}"

pg_dump \
  -h "${PGHOST}" \
  -U "${PGUSER}" \
  -d "${PGDATABASE}" \
  --no-owner \
  --no-privileges \
  --format=plain \
  --compress=0 \
  | gzip -9 > "${TMP_FILE}"

FILESIZE=$(du -h "${TMP_FILE}" | cut -f1)
echo "[$(date -u +%FT%TZ)] Dump complete: ${FILESIZE}"

# ── 2. Upload to Azure Blob Storage ──────────────────────────────────────────
az storage blob upload \
  --account-name "${AZURE_STORAGE_ACCOUNT}" \
  --account-key "${AZURE_STORAGE_KEY}" \
  --container-name "${AZURE_STORAGE_CONTAINER}" \
  --name "backups/${FILENAME}" \
  --file "${TMP_FILE}" \
  --overwrite \
  --only-show-errors

echo "[$(date -u +%FT%TZ)] Uploaded to Azure: ${AZURE_STORAGE_ACCOUNT}/${AZURE_STORAGE_CONTAINER}/backups/${FILENAME}"

# ── 3. Clean up old backups in Azure ──────────────────────────────────────────
CUTOFF_DATE="$(date -u -d "${RETENTION_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-${RETENTION_DAYS}d +%Y-%m-%dT%H:%M:%SZ)"

echo "[$(date -u +%FT%TZ)] Cleaning backups older than ${RETENTION_DAYS} days (before ${CUTOFF_DATE})..."

OLD_BLOBS=$(az storage blob list \
  --account-name "${AZURE_STORAGE_ACCOUNT}" \
  --account-key "${AZURE_STORAGE_KEY}" \
  --container-name "${AZURE_STORAGE_CONTAINER}" \
  --prefix "backups/${BACKUP_PREFIX}_" \
  --query "[?properties.lastModified < '${CUTOFF_DATE}'].name" \
  --output tsv \
  --only-show-errors 2>/dev/null || echo "")

DELETED=0
if [ -n "${OLD_BLOBS}" ]; then
  while IFS= read -r blob; do
    az storage blob delete \
      --account-name "${AZURE_STORAGE_ACCOUNT}" \
      --account-key "${AZURE_STORAGE_KEY}" \
      --container-name "${AZURE_STORAGE_CONTAINER}" \
      --name "${blob}" \
      --only-show-errors
    DELETED=$((DELETED + 1))
  done <<< "${OLD_BLOBS}"
fi

echo "[$(date -u +%FT%TZ)] Deleted ${DELETED} old backup(s)"

# ── 4. Clean up local temp file ───────────────────────────────────────────────
rm -f "${TMP_FILE}"

echo "[$(date -u +%FT%TZ)] Backup complete: ${FILENAME} (${FILESIZE})"
