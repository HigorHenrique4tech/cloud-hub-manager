# 01 — Visão Geral & Arquitetura

## Stack Tecnológica

### Backend
| Tecnologia | Uso |
|-----------|-----|
| Python 3.11 + FastAPI | Framework HTTP, OpenAPI automático |
| SQLAlchemy 2.0 | ORM, engine com pool de conexões |
| PostgreSQL 16 | Banco de dados principal |
| Alembic | Migrations de schema |
| python-jose | JWT (access + refresh + mfa tokens) |
| passlib/bcrypt | Hash de senhas |
| cryptography (Fernet) | Criptografia simétrica de credenciais cloud |
| boto3 | AWS SDK |
| azure-mgmt-* | Azure SDK (compute, network, storage, web, rdbms, costmanagement) |
| google-cloud-* | GCP SDK (compute, storage, functions, sql) |
| msal | Microsoft 365 / Microsoft Graph API |
| APScheduler 3.10.4 | Jobs de start/stop de recursos |
| slowapi | Rate limiting por IP |
| httpx | HTTP client (webhook delivery) |
| Prometheus (fastapi-prometheus) | Métricas de latência e throughput |

### Frontend
| Tecnologia | Uso |
|-----------|-----|
| React 18 + Vite | Framework UI + bundler |
| Tailwind CSS | Estilização utility-first |
| React Router v6 | Roteamento SPA |
| @tanstack/react-query | Cache e sincronização de dados assíncronos |
| @dnd-kit/core + /sortable | Drag-and-drop do dashboard |
| Recharts | Gráficos de custo |
| Lucide React | Ícones |
| Axios | HTTP client com interceptor 401 |

### Infra
| Tecnologia | Uso |
|-----------|-----|
| Docker + Docker Compose | Containerização e orquestração |
| Caddy | Reverse proxy + SSL automático (Let's Encrypt) |
| Grafana + Prometheus | Monitoramento da API |
| Gunicorn + Uvicorn | Servidor WSGI/ASGI em produção |
| SendGrid SMTP | E-mails transacionais |
| AbacatePay | Pagamentos PIX |

---

## Diagrama de Containers

```
Internet
    │
    ▼
┌─────────┐
│  Caddy  │ :443 (prod) — SSL automático, reverse proxy
│  :443   │ Bloqueia /docs e /metrics para o público
└────┬────┘
     │
     ├──────────────────────────────────┐
     ▼                                  ▼
┌──────────────┐              ┌──────────────────┐
│  Frontend    │              │    Backend       │
│  (React/Nginx│              │    FastAPI       │
│  :3000)      │              │    :8000         │
└──────────────┘              └──────┬───────────┘
                                     │
              ┌──────────────────────┤
              │                      │
              ▼                      ▼
     ┌──────────────┐      ┌──────────────────┐
     │  PostgreSQL  │      │  APScheduler     │
     │  :5432       │      │  (in-process     │
     └──────────────┘      │   SQLAlchemyStore│
                           └──────────────────┘
                                     │
              ┌──────────────────────┼───────────────┐
              ▼                      ▼               ▼
         AWS APIs              Azure APIs        Graph API
         (boto3)               (azure-sdk)       (M365/msal)
              │                      │
              └──────────┬───────────┘
                         ▼
                    GCP APIs
                 (google-cloud-*)

┌──────────────┐   ┌──────────────┐
│  Prometheus  │──▶│   Grafana    │
│  :9090       │   │  :3001       │
└──────────────┘   └──────────────┘
```

---

## Modelo Multi-Tenant

```
User (is_admin)
  └── Organization  ←─────────────────────────────── plan_tier: free|pro|enterprise
        │           ←─────────────────────────────── org_type:  standalone|master|partner
        │           ←─────────────────────────────── parent_org_id (FK self-ref)
        │
        ├── OrganizationMember (role: owner|admin|operator|viewer|billing)
        │
        ├── Workspace "Produção"
        │     ├── WorkspaceMember (role override, opcional)
        │     ├── CloudAccount AWS   { encrypted_data: Fernet({access_key, secret_key}) }
        │     ├── CloudAccount Azure { encrypted_data: Fernet({subscription_id, tenant_id, ...}) }
        │     ├── CloudAccount GCP   { encrypted_data: Fernet({project_id, client_email, private_key}) }
        │     └── CloudAccount M365  { encrypted_data: Fernet({tenant_id, client_id, client_secret}) }
        │
        └── Workspace "Desenvolvimento"
              └── CloudAccount AWS
```

---

## Estrutura de Pastas

```
cloud-hub-manager/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py              ← registra todos os routers
│   │   │   ├── auth.py                  ← login, register, refresh, MFA, SSO, convites
│   │   │   ├── orgs.py                  ← CRUD orgs + membros + managed-orgs (MSP)
│   │   │   ├── workspaces.py            ← CRUD workspaces
│   │   │   ├── cloud_accounts.py        ← contas cloud por workspace
│   │   │   ├── aws.py                   ← EC2, S3, RDS, Lambda, VPC, costs
│   │   │   ├── azure.py                 ← VMs, Storage, VNets, SQL, AppServices, costs
│   │   │   ├── gcp.py                   ← Compute, Storage, SQL, Functions, VPC
│   │   │   ├── m365.py                  ← Users, Licenses, Teams, Security (Enterprise)
│   │   │   ├── alerts.py                ← alertas de custo + eventos
│   │   │   ├── finops.py                ← scan, recomendações, budgets, relatórios
│   │   │   ├── schedules.py             ← agendamentos start/stop
│   │   │   ├── webhooks.py              ← endpoints webhook + histórico de entregas
│   │   │   ├── admin.py                 ← painel admin (leads + gestão de orgs)
│   │   │   ├── billing.py               ← planos + AbacatePay (PIX)
│   │   │   ├── pricing.py               ← estimativa de custo em tempo real
│   │   │   ├── dashboard_config.py      ← config de widgets por user+workspace
│   │   │   └── logs.py                  ← logs de atividade
│   │   │
│   │   ├── core/
│   │   │   ├── config.py                ← Settings (Pydantic BaseSettings)
│   │   │   ├── permissions.py           ← Permission enum + ROLE_PERMISSIONS (19 permissões)
│   │   │   ├── auth_context.py          ← MemberContext dataclass
│   │   │   ├── dependencies.py          ← get_current_user, require_permission, get_current_admin
│   │   │   └── limiter.py               ← slowapi singleton
│   │   │
│   │   ├── models/
│   │   │   ├── db_models.py             ← 22+ modelos ORM
│   │   │   ├── schemas.py               ← Pydantic schemas de resposta
│   │   │   └── create_schemas.py        ← schemas de criação de recursos cloud
│   │   │
│   │   ├── services/
│   │   │   ├── auth_service.py          ← JWT, bcrypt, Fernet, OTP/MFA
│   │   │   ├── oauth_service.py         ← Google/GitHub OAuth2
│   │   │   ├── aws_service.py           ← chamadas boto3
│   │   │   ├── azure_service.py         ← chamadas azure-sdk
│   │   │   ├── gcp_service.py           ← chamadas google-cloud-*
│   │   │   ├── m365_service.py          ← chamadas Microsoft Graph API
│   │   │   ├── email_service.py         ← SMTP (verificação, convites, MFA, relatórios)
│   │   │   ├── payment_service.py       ← AbacatePay (PIX checkout + status)
│   │   │   ├── plan_service.py          ← limites por plano + managed_org_limit()
│   │   │   ├── log_service.py           ← log_activity() não-fatal
│   │   │   ├── finops_service.py        ← AWSFinOpsScanner + AzureFinOpsScanner
│   │   │   ├── scheduler_service.py     ← APScheduler + jobs start/stop/FinOps
│   │   │   └── webhook_service.py       ← fire_event() + HMAC-SHA256 delivery
│   │   │
│   │   ├── database.py                  ← engine, SessionLocal, run_migrations()
│   │   └── main.py                      ← app FastAPI, CORS, Prometheus middleware
│   │
│   ├── alembic/versions/                ← 12 migrations (ver doc 02)
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── contexts/
│       │   ├── AuthContext.jsx          ← auth state + refresh automático
│       │   ├── OrgWorkspaceContext.jsx  ← org/workspace selecionados + switch
│       │   ├── ThemeContext.jsx         ← dark/light mode
│       │   └── DashboardConfigContext.jsx ← widget order/visibility + dnd-kit
│       │
│       ├── services/
│       │   ├── api.js                   ← Axios + wsUrl() + interceptor 401
│       │   ├── authService.js
│       │   ├── orgService.js
│       │   ├── awsservices.js
│       │   ├── azureservices.js
│       │   ├── gcpService.js
│       │   ├── m365Service.js
│       │   ├── costService.js
│       │   ├── alertService.js
│       │   ├── finopsService.js
│       │   ├── scheduleService.js
│       │   ├── webhookService.js
│       │   ├── pricingService.js        ← estimativa em tempo real
│       │   ├── adminService.js
│       │   ├── dashboardConfigService.js
│       │   └── logsService.js
│       │
│       ├── components/
│       │   ├── common/                  ← ProtectedRoute, PlanGate, PermissionGate, CostEstimatePanel
│       │   ├── layout/                  ← Layout, Sidebar, Header, WorkspaceSwitcher
│       │   ├── create/                  ← CreateEC2Form, CreateAzureVMForm, etc.
│       │   ├── dashboard/               ← SortableWidget, DashboardCustomizer, widgets/
│       │   ├── finops/                  ← RecommendationCard, WasteSummary, ActionTimeline
│       │   └── schedules/               ← ScheduleCard, ScheduleFormModal
│       │
│       └── pages/
│           ├── login.jsx / register.jsx / OAuthCallback.jsx
│           ├── dashboard.jsx
│           ├── FinOps.jsx / Schedules.jsx / Webhooks.jsx
│           ├── costs.jsx / logs.jsx
│           ├── Billing.jsx / PlanSelection.jsx
│           ├── OrgSettings.jsx / WorkspaceSettings.jsx / settings.jsx
│           ├── ManagedOrgsPage.jsx / AdminPanel.jsx
│           ├── aws/        ← AwsOverview, AwsEC2, AwsS3, AwsRDS, AwsLambda, AwsVPC
│           ├── azure/      ← AzureOverview, AzureVMs, AzureStorage, etc.
│           ├── gcp/        ← GcpOverview, GcpComputeEngine, GcpStorage, etc.
│           └── m365/       ← M365Dashboard (5 tabs)
│
├── infra/
│   ├── docker-compose.prod.yml
│   └── docker/
│       ├── entrypoint.sh               ← run_migrations() + gunicorn
│       ├── Caddyfile                   ← reverse proxy + auto SSL
│       ├── backend.prod.Dockerfile
│       └── frontend.prod.Dockerfile
│
├── docs/                               ← esta documentação
├── docker-compose.yml                  ← desenvolvimento local
├── README.md
├── PROJETO.md
└── DEPLOY.md
```

---

## Proxy e roteamento (desenvolvimento)

O Vite configura um proxy em `vite.config.js`:

```
Frontend :3000
  /api/* → http://localhost:8000  (backend)
```

Todas as chamadas do frontend usam o helper `wsUrl()` de `api.js`:

```js
// api.js
export const wsUrl = (path) =>
  `/api/v1/orgs/${org_slug}/workspaces/${workspace_id}${path}`;
```

---

## Variável de ambiente — padrão de lookup de credenciais

Os endpoints AWS/Azure/GCP seguem este padrão ao buscar credenciais:

```python
# 1. Busca CloudAccount ativo do workspace no banco (Fernet decrypt)
acct = db.query(CloudAccount).filter(workspace_id=X, provider="aws").first()

# 2. Se não encontrado, usa fallback do .env
#    (AWS_ACCESS_KEY_ID, AZURE_CLIENT_ID, etc.)
```

Isso permite que workspaces sem credenciais próprias usem a conta global configurada no `.env`.
