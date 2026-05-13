FROM postgres:16-alpine

# azure-storage-blob (~15 MB) replaces full azure-cli (~500 MB)
RUN apk add --no-cache python3 py3-pip bash gzip && \
    pip3 install --no-cache-dir --break-system-packages azure-storage-blob

COPY infra/scripts/pg-backup-azure.sh /usr/local/bin/pg-backup
COPY infra/scripts/az-blob.py         /usr/local/bin/az-blob
RUN chmod +x /usr/local/bin/pg-backup /usr/local/bin/az-blob

# Run at 03:00 UTC every day
RUN echo "0 3 * * * /usr/local/bin/pg-backup >> /var/log/pg-backup.log 2>&1" \
    > /etc/crontabs/root

# crond -f = foreground (keeps container alive); -l 2 = log level notice
CMD ["crond", "-f", "-l", "2"]
