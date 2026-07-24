#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# CloudAtlas — PostgreSQL backup to Azure Blob Storage
#
# Required env vars:
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE
#   AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY, AZURE_STORAGE_CONTAINER
#
# Optional:
#   RETENTION_DAYS       (default: 30)
#   BACKUP_PREFIX        (default: cloudatlas)
#   BACKUP_NOTIFY_EMAIL  (email to notify on failure — requires SMTP_* vars)
#   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_PREFIX="${BACKUP_PREFIX:-cloudatlas}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
FILENAME="${BACKUP_PREFIX}_${TIMESTAMP}.sql.gz"
TMP_DIR="/tmp/pg-backups"
TMP_FILE="${TMP_DIR}/${FILENAME}"
START_TS="$(date -u +%s)"

mkdir -p "${TMP_DIR}"
echo "[$(date -u +%FT%TZ)] ▶ Starting backup: ${FILENAME}"

# ── Failure notification ──────────────────────────────────────────────────────
_notify_failure() {
  local exit_code="$1"
  local msg="$2"
  echo "[$(date -u +%FT%TZ)] ✗ BACKUP FAILED (exit ${exit_code}): ${msg}"

  [ -z "${SMTP_HOST:-}" ] && return 0
  [ -z "${BACKUP_NOTIFY_EMAIL:-}" ] && return 0

  python3 - <<PYEOF
import smtplib, ssl, os
from email.mime.text import MIMEText

host = os.environ.get('SMTP_HOST', '')
port = int(os.environ.get('SMTP_PORT', 587))
user = os.environ.get('SMTP_USER', '')
pwd  = os.environ.get('SMTP_PASSWORD', '')
to   = os.environ.get('BACKUP_NOTIFY_EMAIL', '')
frm  = os.environ.get('SMTP_FROM', user)

if not host or not to:
    exit(0)

body = (
    "CloudAtlas database backup FAILED.\n\n"
    f"Exit code : ${exit_code}\n"
    f"Error     : ${msg}\n"
    f"Host      : {os.environ.get('PGHOST', '?')}\n"
    f"Database  : {os.environ.get('PGDATABASE', '?')}\n"
    f"Time (UTC): $(date -u +%FT%TZ)\n\n"
    "Action required: check container logs with:\n"
    "  docker logs cloudatlas-backup\n"
    "  docker exec cloudatlas-backup tail -50 /var/log/pg-backup.log\n"
)

msg_obj = MIMEText(body)
msg_obj['Subject'] = '[CloudAtlas] ⚠ Database backup FAILED'
msg_obj['From']    = frm
msg_obj['To']      = to

ctx = ssl.create_default_context()
with smtplib.SMTP(host, port) as s:
    s.ehlo()
    if port != 465:
        s.starttls(context=ctx)
    if user and pwd:
        s.login(user, pwd)
    s.sendmail(frm, [to], msg_obj.as_string())

print(f"Failure notification sent to: {to}")
PYEOF
}

# ── Cleanup trap ──────────────────────────────────────────────────────────────
_cleanup() {
  local exit_code=$?
  rm -f "${TMP_FILE}"
  if [ "${exit_code}" -ne 0 ]; then
    _notify_failure "${exit_code}" "See container logs for details"
  fi
}
trap _cleanup EXIT

# ── 1. pg_dump ────────────────────────────────────────────────────────────────
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

# Sanity check: refuse to upload suspiciously small files (< 10 KB)
FILESIZE_BYTES=$(stat -c%s "${TMP_FILE}" 2>/dev/null || stat -f%z "${TMP_FILE}")
if [ "${FILESIZE_BYTES}" -lt 10240 ]; then
  echo "[$(date -u +%FT%TZ)] ✗ Backup file is too small (${FILESIZE_BYTES} bytes). Aborting."
  exit 1
fi

FILESIZE_MB=$(echo "scale=2; ${FILESIZE_BYTES}/1048576" | bc)
echo "[$(date -u +%FT%TZ)] ✔ Dump complete: ${FILESIZE_MB} MB"

# ── 2. Upload to Azure Blob Storage ──────────────────────────────────────────
az-blob upload \
  "${AZURE_STORAGE_CONTAINER}" \
  "backups/${FILENAME}" \
  "${TMP_FILE}"

echo "[$(date -u +%FT%TZ)] ✔ Uploaded to: ${AZURE_STORAGE_ACCOUNT}/${AZURE_STORAGE_CONTAINER}/backups/${FILENAME}"

# ── 3. Delete backups older than RETENTION_DAYS ───────────────────────────────
az-blob cleanup \
  "${AZURE_STORAGE_CONTAINER}" \
  "backups/${BACKUP_PREFIX}_" \
  "${RETENTION_DAYS}"

# ── 4. Done ───────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date -u +%s) - START_TS ))
echo "[$(date -u +%FT%TZ)] ✔ Backup complete in ${ELAPSED}s: ${FILENAME} (${FILESIZE_MB} MB)"
