FROM postgres:16-alpine

# Install Azure CLI (lightweight, alpine-based)
RUN apk add --no-cache \
    python3 py3-pip bash curl \
  && pip3 install --break-system-packages azure-cli \
  && az version

COPY infra/scripts/pg-backup-azure.sh /usr/local/bin/pg-backup
RUN chmod +x /usr/local/bin/pg-backup

# Default: run backup once. Use cron in docker-compose or host crontab.
CMD ["pg-backup"]
