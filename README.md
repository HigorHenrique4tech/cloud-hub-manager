# CloudAtlas

Plataforma multi-cloud centralizada para gerenciar, monitorar e otimizar recursos de nuvem em um único lugar — com hierarquia de organizações, controle de acesso por papel (RBAC), FinOps e monitoramento integrado.

## Visão Geral

O CloudAtlas permite que times de infraestrutura e engenharia visualizem e operem recursos AWS + Azure, controlem custos, recebam alertas, identifiquem desperdícios automaticamente e apliquem economias reais — tudo sem precisar alternar entre consoles.

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI + Python 3.11 |
| Banco de dados | PostgreSQL 16 |
| ORM | SQLAlchemy 2.0 |
| Migrações | Alembic |
| Autenticação | JWT (python-jose) + bcrypt |
| SSO | Google OAuth 2.0 / GitHub OAuth |
| Criptografia de credenciais | Fernet (cryptography) |
| AWS SDK | boto3 + CloudWatch |
| Azure SDK | azure-identity + azure-mgmt-compute + azure-mgmt-network + azure-mgmt-monitor + azure-mgmt-costmanagement |
| Frontend | React 18 + Vite |
| Estilização | Tailwind CSS |
| Gráficos | Recharts |
| Ícones | lucide-react |
| Queries assíncronas | @tanstack/react-query |
| Monitoramento | Prometheus + Grafana |
| Proxy / SSL | Caddy (auto HTTPS) |
| Containerização | Docker + Docker Compose |
| Pagamentos | AbacatePay (PIX/Cartão) |

---

## Arquitetura

```
┌────────────────────────────────────────────────────────────────┐
│                        Docker Compose (Prod)                   │
│                                                                │
│  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌────────────┐  │
│  │  Caddy  │──▶│ Frontend │   │ Backend  │──▶│ PostgreSQL │  │
│  │  (443)  │   │  (nginx) │   │  :8000   │   │   :5432    │  │
│  └─────────┘   └──────────┘   └──────────┘   └────────────┘  │
│       │               │            │                          │
│       └───────────────┘      ┌─────┴──────┐                  │
│                              ▼            ▼                   │
│                          AWS API      Azure API               │
│                                                               │
│  ┌──────────┐   ┌──────────┐                                  │
│  │Prometheus│──▶│ Grafana  │                                   │
│  │  :9090   │   │  :3001   │                                   │
│  └──────────┘   └──────────┘                                   │
└────────────────────────────────────────────────────────────────┘
```

### Modelo de Hierarquia

```
Organization (org)
└── Workspace (ws)
    ├── CloudAccount (credenciais AWS / Azure por workspace)
    ├── Recursos (EC2, VMs, S3, RDS, Lambda, VPC, ...)
    ├── CostAlerts / AlertEvents
    ├── FinOpsRecommendations / FinOpsBudgets / FinOpsActions
    └── ActivityLogs
```

**RBAC — Papéis por organização (com override por workspace):**

| Papel | Permissões |
|-------|-----------|
| `owner` | Todas, incluindo excluir organização |
| `admin` | Todas exceto excluir organização |
| `operator` | Ver e operar recursos, FinOps view/recommend |
| `viewer` | Apenas leitura de recursos e FinOps |
| `billing` | Custos, alertas, FinOps view/recommend |

---

## Funcionalidades

### Autenticação e SSO
- Cadastro com e-mail + senha (verificação de e-mail)
- Login com JWT (access + refresh token)
- SSO via Google OAuth 2.0 e GitHub OAuth
- Convite de membros por e-mail (SMTP)
- Refresh automático de token no frontend

### Organizações e Workspaces
- Criação e gerenciamento de organizações
- Múltiplos workspaces por organização
- Convite de membros com papel (owner / admin / operator / viewer / billing)
- Override de papel por workspace
- Slug único por organização

### Contas Cloud (Credenciais)
- Credenciais AWS e Azure armazenadas criptografadas (Fernet) por workspace
- Múltiplas contas por provedor
- Suporte a `account_id` para identificação na AWS

### AWS
- Overview com contagens por serviço
- **EC2** — listar, iniciar, parar; criar instância (tipo, AMI, SG, subnet, tags)
- **S3** — listar buckets; criar bucket (região, ACL, versioning)
- **RDS** — listar instâncias; criar banco (engine, classe, storage, credenciais)
- **Lambda** — listar funções; criar função (runtime, handler, role, código ZIP)
- **VPC** — listar redes e subnets; criar VPC (CIDR, nome)
- Custos via AWS Cost Explorer (diário, por serviço)

### Azure
- Overview com contagens por serviço
- **Virtual Machines** — listar, iniciar, parar (deallocate); criar VM (tamanho, imagem, rede, credenciais)
- **Storage Accounts** — listar; criar (SKU, kind, tier)
- **Virtual Networks** — listar VNets e subnets; criar VNet (CIDR, região)
- **SQL Databases** — listar servidores e bancos; criar banco (SKU, servidor, credenciais)
- **App Services** — listar, iniciar, parar; criar app (plano, runtime, região)
- Custos via Azure Cost Management

### Dashboard
- Cards KPI (total recursos, em execução, custo do mês)
- Gráfico de custo 30 dias (AWS + Azure)
- Atividades recentes (audit log real)
- Distribuição de recursos por provedor

### Análise de Custos (`/costs`)
- Período customizável (30d / 90d / 6m / 1 ano)
- LineChart diário AWS + Azure + Total
- BarChart por serviço (top 8)
- PieChart distribuição AWS vs Azure
- Projeção de custo fim do mês
- Export CSV e PDF

### Alertas de Custo
- Alertas por provedor, serviço e threshold (valor fixo ou percentual)
- Badge de notificações no header com contagem não lida
- Dropdown com últimos eventos
- Histórico de disparos com marcação de leitura

### FinOps — Otimização de Custos (`/finops`)
Módulo completo de detecção de desperdício e automação de economia:

**Detecção automática (scan manual ou agendável):**
| Regra | Critério | Economia estimada |
|-------|---------|-------------------|
| EC2 ocioso | CPU < 5% média em 7 dias | ~50% (right-size) |
| EBS órfão | Desanexado > 7 dias | 100% |
| Elastic IP ocioso | Sem associação | $7.20/IP/mês |
| RDS ocioso | < 5 conexões/dia em 7 dias | ~90% (stop) |
| Snapshots antigos | > 90 dias | 100% |
| VM Azure ociosa | CPU < 5% em 7 dias | ~50% (right-size) |
| Managed Disk desanexado | `Unattached` state | 100% |
| Public IP Azure ocioso | Sem IP configuration | ~$3.65/mês |

**Recomendações:**
- Prioridade por economia estimada (alto > $50/mês, médio $10–50, baixo < $10)
- Spec atual vs. spec recomendada (tipo de instância, tamanho de VM)
- Aplicar ação com 1 clique (executa direto na AWS/Azure)
- Desfazer ação em janela de 24h com rollback automático
- Descartar recomendação com motivo

**Orçamentos (Pro+):**
- Criar orçamentos por provedor e período (mensal/trimestral/anual)
- Alerta configurável em % do orçamento

**Detecção de anomalias (Pro+):**
- Baseline 14 dias por serviço
- Anomalia detectada quando custo > baseline + 3σ por 2 dias consecutivos

**Histórico de ações:**
- Timeline com status (executado, falhou, revertido)
- Economia acumulada realizada

**Feature gating por plano:**
| Funcionalidade | Free | Pro | Enterprise |
|----------------|:----:|:---:|:----------:|
| Ver recomendações | Top 3 | Ilimitado | Ilimitado |
| Aplicar / Desfazer | ❌ | ✅ | ✅ |
| Orçamentos | ❌ | Até 5 | Ilimitado |
| Anomalias | ❌ | ✅ | ✅ |

### Logs de Auditoria (`/logs`)
- Registro automático de todas as ações: login, credenciais, recursos, alertas, FinOps
- Filtros por ação, provedor, status e período
- Paginação por offset
- Logs preservados após exclusão de usuário

### Planos e Faturamento
- Planos: Free / Pro / Enterprise
- Integração AbacatePay (PIX e Cartão)
- Tela de seleção de plano com comparativo de features
- Webhook de confirmação de pagamento

### Monitoramento
- Prometheus coleta métricas de latência e throughput da API
- Grafana com dashboard pré-configurado
- Health check endpoint `/health`

---

## Estrutura do Projeto

```
cloud-hub-manager/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py            # Registro, login, refresh, SSO callbacks
│   │   │   ├── orgs.py            # CRUD organizações + membros + convites
│   │   │   ├── workspaces.py      # CRUD workspaces
│   │   │   ├── cloud_accounts.py  # Contas cloud por workspace
│   │   │   ├── aws.py             # EC2, S3, RDS, Lambda, VPC, costs
│   │   │   ├── azure.py           # VMs, Storage, VNets, SQL, App Services, costs
│   │   │   ├── alerts.py          # Alertas de custo
│   │   │   ├── logs.py            # Auditoria
│   │   │   ├── finops.py          # Recomendações, scan, orçamentos, ações, anomalias
│   │   │   └── billing.py         # Planos e pagamentos (AbacatePay)
│   │   ├── core/
│   │   │   ├── config.py          # Settings (env vars)
│   │   │   ├── dependencies.py    # Guards: get_current_user, require_permission
│   │   │   ├── auth_context.py    # MemberContext (user + org + workspace + role)
│   │   │   └── permissions.py     # RBAC: Permission enum + ROLE_PERMISSIONS
│   │   ├── models/
│   │   │   ├── db_models.py       # Todos os modelos ORM
│   │   │   └── create_schemas.py  # Schemas de criação de recursos
│   │   ├── services/
│   │   │   ├── auth_service.py    # JWT, bcrypt, Fernet, email verification
│   │   │   ├── aws_service.py     # boto3: todos os recursos AWS
│   │   │   ├── azure_service.py   # Azure SDK: todos os recursos Azure
│   │   │   ├── finops_service.py  # Scanners de desperdício (AWS + Azure)
│   │   │   └── log_service.py     # log_activity() — auditoria non-fatal
│   │   ├── database.py            # Engine, SessionLocal, run_migrations()
│   │   └── main.py
│   ├── alembic/                   # Migrações de banco
│   │   └── versions/
│   ├── alembic.ini
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── contexts/
│       │   ├── AuthContext.jsx        # Estado global de autenticação
│       │   ├── OrgWorkspaceContext.jsx # Org + workspace selecionados
│       │   └── ThemeContext.jsx       # Dark/light mode
│       ├── components/
│       │   ├── common/
│       │   │   ├── ProtectedRoute.jsx
│       │   │   ├── PermissionGate.jsx  # Gate por permissão RBAC
│       │   │   ├── PlanGate.jsx        # Gate por plano (Free/Pro/Enterprise)
│       │   │   ├── CreateResourceModal.jsx
│       │   │   ├── FormSection.jsx
│       │   │   └── TagEditor.jsx
│       │   ├── finops/
│       │   │   ├── RecommendationCard.jsx
│       │   │   ├── WasteSummary.jsx
│       │   │   └── ActionTimeline.jsx
│       │   └── layout/
│       │       ├── layout.jsx
│       │       ├── sidebar.jsx
│       │       ├── header.jsx
│       │       └── WorkspaceSwitcher.jsx
│       ├── pages/
│       │   ├── dashboard.jsx
│       │   ├── costs.jsx
│       │   ├── FinOps.jsx
│       │   ├── logs.jsx
│       │   ├── Billing.jsx
│       │   ├── OrgSettings.jsx
│       │   ├── WorkspaceSettings.jsx
│       │   ├── aws/          # Overview, EC2, S3, RDS, Lambda, VPC
│       │   └── azure/        # Overview, VMs, Storage, VNets, Databases, AppServices
│       ├── services/
│       │   ├── api.js            # Axios + interceptor 401 + wsUrl helper
│       │   ├── authService.js
│       │   ├── orgService.js
│       │   ├── costService.js
│       │   ├── alertService.js
│       │   ├── finopsService.js
│       │   └── logsService.js
│       └── hooks/
└── infra/
    ├── docker-compose.prod.yml
    └── docker/
        ├── backend.prod.Dockerfile
        ├── frontend.prod.Dockerfile
        ├── entrypoint.sh          # run_migrations() + gunicorn
        └── Caddyfile              # Reverse proxy + auto SSL
```

---

## Como Executar

### Desenvolvimento Local

**Pré-requisitos:** Docker e Docker Compose

```bash
# 1. Clone o repositório
git clone <repo> && cd cloud-hub-manager

# 2. Configure o ambiente
cp .env.example .env
# Edite o .env com suas chaves

# 3. Suba os containers
docker-compose up -d --build

# 4. Acesse
# Frontend: http://localhost:3000
# API:      http://localhost:8000
# Swagger:  http://localhost:8000/docs
```

### Produção (VPS com Docker)

```bash
# 1. Configure o .env de produção
cp .env.example .env
# Defina SECRET_KEY, ENCRYPTION_KEY, domínio, SMTP, OAuth, etc.

# 2. Build e deploy
docker compose -f infra/docker-compose.prod.yml up -d --build

# Migrações rodam automaticamente no entrypoint do backend
```

O Caddy gerencia SSL automaticamente via Let's Encrypt.

---

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `POSTGRES_USER` | Usuário do banco | `cloudhub` |
| `POSTGRES_PASSWORD` | Senha do banco | `cloudhub_pass` |
| `POSTGRES_DB` | Nome do banco | `cloudhub_db` |
| `SECRET_KEY` | Chave JWT + criptografia | — |
| `ENCRYPTION_KEY` | Chave Fernet explícita | derivado do `SECRET_KEY` |
| `DEBUG` | Modo debug | `True` |
| `LOG_LEVEL` | Nível de log | `INFO` |
| `ALLOWED_ORIGINS` | CORS origins (JSON array) | `["http://localhost:3000"]` |
| `SMTP_HOST` | Servidor SMTP para convites/verificação | — |
| `SMTP_USER` / `SMTP_PASSWORD` | Credenciais SMTP | — |
| `FRONTEND_URL` | URL base do frontend | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `SECRET` | SSO Google | — |
| `GITHUB_CLIENT_ID` / `SECRET` | SSO GitHub | — |
| `ABACATEPAY_API_KEY` | Chave de pagamentos | — |

> Credenciais AWS/Azure **não ficam no `.env`**. Cada workspace cadastra as próprias contas cloud pela interface.

---

## Permissões Necessárias nas Clouds

### AWS (IAM Policy mínima)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:Describe*", "ec2:StartInstances", "ec2:StopInstances",
      "ec2:DeleteVolume", "ec2:ReleaseAddress", "ec2:ModifyInstanceAttribute",
      "ec2:DeleteSnapshot",
      "s3:ListAllMyBuckets", "s3:GetBucketLocation", "s3:CreateBucket",
      "rds:DescribeDBInstances", "rds:StopDBInstance", "rds:StartDBInstance",
      "lambda:ListFunctions",
      "ce:GetCostAndUsage",
      "cloudwatch:GetMetricStatistics"
    ],
    "Resource": "*"
  }]
}
```

### Azure (RBAC mínimo)

| Role | Para quê |
|------|---------|
| Reader | Listar todos os recursos |
| Virtual Machine Contributor | Start/stop/resize de VMs |
| Disk Delete (ou Contributor) | Deletar discos gerenciados |
| Network Contributor | Gerenciar IPs públicos |
| Cost Management Reader | Consultar custos |
| Monitoring Reader | Métricas via Azure Monitor (FinOps) |

---

## Roadmap

- [ ] Scan FinOps agendado (APScheduler — sem clique manual)
- [ ] Approval workflow para ações FinOps (Enterprise)
- [ ] Chargeback por tag (Enterprise)
- [ ] Export de recomendações CSV/PDF
- [ ] Suporte a múltiplas regiões AWS simultâneas
- [ ] Google Cloud Platform (GCP) — Compute Engine
- [ ] Notificações webhook (Slack, Teams)

---

## Licença

MIT License
