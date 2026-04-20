FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim

RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

COPY --from=builder /install /usr/local
COPY backend/ .

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 5555

CMD ["celery", "-A", "app.workers.celery_app", "flower", "--port=5555", "--address=0.0.0.0"]
