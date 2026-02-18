# CloudAtlas — Infraestrutura

## Estrutura

```
infra/
├── docker/
│   ├── backend.prod.Dockerfile      # Backend: multi-stage, gunicorn, non-root user
│   ├── frontend.prod.Dockerfile     # Frontend: multi-stage, npm build → nginx
│   └── nginx.conf                   # SPA routing, gzip, proxy /api → backend
├── monitoring/
│   ├── prometheus.yml               # Scrape config (backend:8000/metrics)
│   └── grafana/
│       ├── provisioning/            # Auto-provisiona datasource + dashboard
│       └── dashboards/
│           └── cloudatlas.json      # Dashboard pré-pronto
├── docker-compose.prod.yml          # Produção: postgres + backend + frontend + prometheus + grafana
└── README.md                        # Este arquivo

.github/workflows/
├── backend.yml                      # CI: lint (ruff) + test (pytest) + build Docker
├── frontend.yml                     # CI: lint (eslint) + build (vite) + build Docker
└── deploy.yml                       # CD: push ACR + deploy Azure App Service
```

---

## Rodar em Produção (local)

### Pré-requisitos
- Docker e Docker Compose instalados
- Arquivo `.env` na raiz do projeto com todas as variáveis

### Subir

```bash
cd infra
docker compose -f docker-compose.prod.yml up -d --build
```

### Acessar

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost/api/v1 (via nginx proxy) |
| API Docs | http://localhost:8000/docs (direto no backend) |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

### Credenciais Grafana

- **User:** `admin` (ou `GRAFANA_USER` do .env)
- **Password:** `admin` (ou `GRAFANA_PASSWORD` do .env)
- Dashboard pré-carregado: **CloudAtlas - API Monitoring**

### Parar

```bash
docker compose -f docker-compose.prod.yml down
```

Para limpar volumes (dados):
```bash
docker compose -f docker-compose.prod.yml down -v
```

---

## Diferenças Dev vs Prod

| Aspecto | Dev (`docker-compose.yml`) | Prod (`docker-compose.prod.yml`) |
|---------|---------------------------|----------------------------------|
| Backend | uvicorn --reload, volume mount | gunicorn 4 workers, imagem otimizada |
| Frontend | Vite dev server (HMR) | nginx servindo build estático |
| Logging | Texto simples | JSON estruturado |
| Métricas | Não | Prometheus + Grafana |
| Portas | 3000 (frontend), 8000 (backend) | 80 (nginx), 9090, 3001 |
| Debug | True | False |
| User | root | appuser (UID 1000) |

---

## CI/CD — GitHub Actions

### Pipelines

1. **Backend CI** (`backend.yml`) — dispara em push/PR que altera `backend/**`
   - Lint com **ruff** (check + format)
   - Testes com **pytest** (com PostgreSQL service)
   - Build da imagem Docker (somente em push na main)

2. **Frontend CI** (`frontend.yml`) — dispara em push/PR que altera `frontend/**`
   - Lint com **ESLint**
   - Build com **Vite** (valida que compila)
   - Build da imagem Docker (somente em push na main)

3. **Deploy** (`deploy.yml`) — dispara após CI passar na main
   - Build e push de ambas as imagens para Azure Container Registry
   - Deploy para Azure App Service

### Secrets Necessários no GitHub

| Secret | Descrição |
|--------|-----------|
| `AZURE_CREDENTIALS` | JSON do service principal (`az ad sp create-for-rbac`) |
| `ACR_LOGIN_SERVER` | URL do ACR (ex: `cloudatlas.azurecr.io`) |
| `ACR_USERNAME` | Username do ACR |
| `ACR_PASSWORD` | Password do ACR |
| `AZURE_RESOURCE_GROUP` | Resource group no Azure |

### Configurar Azure Container Registry

```bash
# Criar ACR
az acr create --resource-group <rg> --name cloudatlas --sku Basic

# Criar service principal com acesso ao ACR
az ad sp create-for-rbac --name "cloudatlas-ci" \
  --role contributor \
  --scopes /subscriptions/<sub-id>/resourceGroups/<rg> \
  --sdk-auth
```

O JSON retornado vai no secret `AZURE_CREDENTIALS`.

---

## Monitoring — Endpoints

| Endpoint | Descrição |
|----------|-----------|
| `GET /health` | Health check com verificação de DB |
| `GET /metrics` | Métricas Prometheus (request rate, latency, errors) |
| `GET /` | Health check simples |

### Métricas Disponíveis

- `http_requests_total` — Total de requests por método/endpoint/status
- `http_request_duration_seconds` — Histograma de latência
- `http_requests_in_progress` — Requests ativos no momento
- `http_request_size_bytes` — Tamanho dos requests
- `http_response_size_bytes` — Tamanho das respostas
