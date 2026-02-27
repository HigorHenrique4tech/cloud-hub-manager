# 07 — Deploy & Infraestrutura

## Desenvolvimento Local

**Pré-requisitos:** Docker Desktop + Docker Compose

```bash
# 1. Subir todos os serviços
docker compose up -d --build

# Serviços disponíveis:
# Frontend:    http://localhost:3000
# Backend:     http://localhost:8000
# Swagger:     http://localhost:8000/docs
# Prometheus:  http://localhost:9090
# Grafana:     http://localhost:3001  (admin / admin)
```

### Reiniciar apenas o backend (após alterações Python)
```bash
docker compose restart backend
```

### Ver logs em tempo real
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

### Rodar migration manualmente (dev)
```bash
docker compose exec backend alembic upgrade head
```

---

## Variáveis de Ambiente

### `backend/.env`

```env
# ── Banco de dados ────────────────────────────────────────
DATABASE_URL=postgresql://cloudhub:cloudhub_pass@postgres:5432/cloudhub_db
POSTGRES_USER=cloudhub
POSTGRES_PASSWORD=cloudhub_pass
POSTGRES_DB=cloudhub_db

# ── Segurança ─────────────────────────────────────────────
SECRET_KEY=gere-com-openssl-rand-hex-32
ENCRYPTION_KEY=gere-com-python-cryptography-fernet-Fernet-generate-key

# ── Aplicação ─────────────────────────────────────────────
DEBUG=False
LOG_LEVEL=INFO
FRONTEND_URL=https://cloudatlas.app.br
ALLOWED_ORIGINS=["https://cloudatlas.app.br"]

# ── SMTP (SendGrid) ──────────────────────────────────────
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=465
SMTP_USER=apikey
SMTP_PASSWORD=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxx
SMTP_FROM=noreply@cloudatlas.app.br
SMTP_USE_TLS=True

# ── SSO OAuth (opcional — botões aparecem apenas se configurados)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GITHUB_CLIENT_ID=Ov23lixxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxx

# ── Pagamentos AbacatePay ─────────────────────────────────
ABACATEPAY_API_KEY=abc_dev_xxxxxxxxxxxx
ABACATEPAY_WEBHOOK_SECRET=webhook-secret

# ── Credenciais cloud globais (fallback por workspace) ────
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=us-east-1

AZURE_SUBSCRIPTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=...

# ── Monitoramento ─────────────────────────────────────────
GRAFANA_PASSWORD=senha-forte-grafana
```

> As credenciais AWS/Azure/GCP/M365 **por workspace** são configuradas pela interface e armazenadas criptografadas no banco. Os valores do `.env` servem apenas como fallback global.

### `frontend/.env`

```env
VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
VITE_GITHUB_CLIENT_ID=Ov23lixxxxxx
```

### Gerar chaves seguras

```bash
# SECRET_KEY
python -c "import secrets; print(secrets.token_hex(32))"

# ENCRYPTION_KEY (Fernet)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## Docker Compose (produção)

Arquivo: `infra/docker-compose.prod.yml`

```yaml
services:
  postgres:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    env_file: ../.env
    restart: always

  backend:
    build:
      context: ../backend
      dockerfile: ../infra/docker/backend.prod.Dockerfile
    depends_on: [postgres]
    env_file: ../.env
    restart: always

  frontend:
    build:
      context: ../frontend
      dockerfile: ../infra/docker/frontend.prod.Dockerfile
    restart: always

  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./docker/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [frontend, backend]
    restart: always

  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    expose: [9090]

  grafana:
    image: grafana/grafana
    expose: [3000]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
```

---

## Entrypoint de Produção

`infra/docker/entrypoint.sh`:

```bash
#!/bin/sh
# 1. Aguarda postgres ficar pronto
until pg_isready -h postgres; do sleep 1; done

# 2. Roda migrations Alembic
python -c "from app.database import run_migrations; run_migrations()"

# 3. Inicia Gunicorn + Uvicorn workers
exec gunicorn app.main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  -b 0.0.0.0:8000 \
  --timeout 120
```

---

## Caddy — Reverse Proxy

`infra/docker/Caddyfile`:

```caddyfile
cloudatlas.app.br {
    # SSL automático Let's Encrypt

    # Bloquear endpoints internos
    @blocked path /docs /redoc /metrics
    respond @blocked 403

    # Proxy API
    handle /api/* {
        reverse_proxy backend:8000
    }

    # Proxy frontend (catch-all)
    handle {
        reverse_proxy frontend:80
    }
}
```

---

## APScheduler — Jobs Permanentes

O `scheduler_service.py` registra jobs no startup:

```python
# Chamado em main.py @app.on_event("startup")
def init_scheduler():
    scheduler.start()
    load_scheduled_actions()      # recarrega start/stop dos workspaces
    load_report_schedules()       # recarrega relatórios automáticos
    register_budget_eval_daily()  # POST /budgets/evaluate às 08:00 UTC diário
```

Jobs são persistidos na tabela `apscheduler_jobs` (PostgreSQL) e sobrevivem a restarts.

---

## Monitoramento

### Prometheus
- Coleta métricas do backend via `/metrics`
- Métricas: latência por endpoint, total de requisições, erros HTTP

### Grafana
- Dashboard pré-carregado: **CloudAtlas - API Monitoring**
- Acesso via SSH tunnel (não exposto publicamente):
```bash
ssh -L 3001:localhost:3001 user@<VM_IP>
# Depois abrir: http://localhost:3001
```
- Login: `admin` / valor de `GRAFANA_PASSWORD`

---

## CI/CD (GitHub Actions)

Push na branch `main` dispara:

```
push → main
  ├── pytest (backend tests)    ─┐
  ├── vite build (frontend)     ─┤─→ ambos OK → Deploy SSH → docker compose up -d
  └── se qualquer falha: deploy bloqueado
```

Secrets necessários no GitHub:
- `VM_HOST` — IP público da VM
- `VM_SSH_KEY` — chave SSH privada

---

## Infraestrutura — VM Azure (produção)

| Recurso | Especificação | Custo/mês |
|---------|--------------|-----------|
| VM Ubuntu 22.04 | Standard_B2s (2 vCPUs, 4 GB) | ~R$140 |
| Disco OS | 30 GB SSD | ~R$15 |
| IP Estático | Standard | ~R$15 |
| Transferência | ~10 GB | ~R$5 |
| **Total estimado** | | **~R$175/mês** |

> Reserva de 1 ano reduz até 40%.

---

## Checklist de Deploy

```
[ ] postgres OK (pg_isready)
[ ] migrations aplicadas (alembic upgrade head)
[ ] GET /health → {"status":"healthy","checks":{"database":"ok"}}
[ ] POST /auth/register → e-mail de verificação recebido
[ ] POST /auth/login → JWT retornado
[ ] GET /docs → 403 (bloqueado pelo Caddy)
[ ] GET /metrics → 403 (bloqueado pelo Caddy)
[ ] POST /billing/checkout → URL PIX válida
[ ] Webhook AbacatePay configurado: https://cloudatlas.app.br/api/v1/billing/webhook
[ ] Grafana acessível via SSH tunnel
[ ] Backup do .env feito
```

---

## Backup

```bash
# Backup do banco (dentro da VM)
docker compose exec postgres pg_dump -U cloudhub cloudhub_db > backup_$(date +%Y%m%d).sql

# Backup do .env (para local)
scp user@<VM_IP>:/app/cloud-hub-manager/.env ./env.backup.$(date +%Y%m%d)
```

Guarde também em **Azure Key Vault** ou **1Password**.
