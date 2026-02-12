# Cloud Hub Manager

Plataforma centralizada para gerenciar recursos multi-cloud em um único lugar, com autenticação de usuários, credenciais por conta e auditoria de atividades.

## Visão Geral

O Cloud Hub Manager permite que times de infraestrutura visualizem e operem recursos de múltiplos provedores de nuvem através de uma interface unificada, sem precisar acessar cada console individualmente.

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI + Python 3.11 |
| Banco de dados | PostgreSQL 16 |
| ORM | SQLAlchemy 2.0 |
| Autenticação | JWT (python-jose) + bcrypt |
| Criptografia de credenciais | Fernet (cryptography) |
| AWS SDK | boto3 |
| Azure SDK | azure-identity + azure-mgmt-compute + azure-mgmt-costmanagement |
| Frontend | React 18 + Vite |
| Estilização | Tailwind CSS |
| Gráficos | Recharts |
| Ícones | lucide-react |
| Queries assíncronas | @tanstack/react-query |
| Containerização | Docker + Docker Compose |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                   Docker Compose                    │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │ Frontend │───▶│ Backend  │───▶│  PostgreSQL  │  │
│  │  :3000   │    │  :8000   │    │    :5432     │  │
│  └──────────┘    └──────────┘    └──────────────┘  │
│                       │                             │
│               ┌───────┴────────┐                   │
│               ▼                ▼                   │
│            AWS API         Azure API               │
└─────────────────────────────────────────────────────┘
```

### Banco de Dados

```
users
├── id (UUID, PK)
├── email (unique)
├── name
├── hashed_password
├── is_active
└── created_at

cloud_credentials
├── id (UUID, PK)
├── user_id (FK → users)
├── provider  ('aws' | 'azure')
├── label
├── encrypted_data  ← Fernet-encrypted JSON
└── created_at

cost_alerts
├── id (UUID, PK)
├── user_id (FK → users)
├── name, provider, service
├── threshold_type ('fixed' | 'percentage')
├── threshold_value, period ('daily' | 'monthly')
└── is_active

alert_events
├── id (UUID, PK)
├── alert_id (FK → cost_alerts)
├── triggered_at, current_value, threshold_value
├── message
└── is_read

activity_logs
├── id (UUID, PK)
├── user_id (FK → users, SET NULL)
├── user_name, user_email  ← denormalizados
├── action                 ← 'ec2.start' | 'azurevm.stop' | 'auth.login' | ...
├── resource_type, resource_id, resource_name
├── provider  ('aws' | 'azure' | 'system')
├── status    ('success' | 'error')
├── detail
└── created_at
```

As credenciais de cloud são armazenadas criptografadas por usuário. Cada requisição às APIs de cloud usa somente as credenciais do usuário autenticado.

---

## Estrutura do Projeto

```
cloud-hub-manager/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py          # POST /auth/register, /login, GET /auth/me
│   │   │   ├── users.py         # GET/POST/DELETE /users/credentials
│   │   │   ├── aws.py           # EC2, S3, RDS, Lambda, VPC, costs
│   │   │   ├── azure.py         # VMs, storage, vnets, databases, app services, costs
│   │   │   ├── alerts.py        # CRUD alertas de custo + avaliação
│   │   │   └── logs.py          # GET /logs (auditoria)
│   │   ├── core/
│   │   │   ├── config.py        # Settings (env vars)
│   │   │   └── dependencies.py  # get_current_user (JWT guard)
│   │   ├── models/
│   │   │   ├── db_models.py     # SQLAlchemy ORM (User, CloudCredential, CostAlert, AlertEvent, ActivityLog)
│   │   │   └── schemas.py       # Pydantic schemas
│   │   ├── services/
│   │   │   ├── auth_service.py  # JWT, bcrypt, Fernet
│   │   │   ├── aws_service.py   # boto3: EC2, S3, RDS, Lambda, VPC, Cost Explorer
│   │   │   ├── azure_service.py # Azure SDK: VMs, storage, vnets, DB, App Services, Cost Management
│   │   │   └── log_service.py   # log_activity() — persistência de auditoria (non-fatal)
│   │   ├── database.py          # Engine, SessionLocal, create_tables
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── contexts/
│       │   ├── AuthContext.jsx      # Estado global de autenticação
│       │   └── ThemeContext.jsx     # Dark/light mode
│       ├── components/
│       │   ├── common/
│       │   │   ├── ProtectedRoute.jsx
│       │   │   └── NoCredentialsMessage.jsx
│       │   ├── layout/
│       │   │   ├── layout.jsx
│       │   │   ├── sidebar.jsx
│       │   │   ├── header.jsx           # Bell badge com alertas não lidos
│       │   │   ├── AwsSecondarySidebar.jsx
│       │   │   └── AzureSecondarySidebar.jsx
│       │   └── resources/
│       ├── pages/
│       │   ├── login.jsx
│       │   ├── register.jsx
│       │   ├── dashboard.jsx        # Cost Forecast, Instâncias, Atividades Recentes (logs reais)
│       │   ├── costs.jsx            # Gráficos Recharts + alertas de custo
│       │   ├── logs.jsx             # Auditoria com filtros e paginação
│       │   ├── settings.jsx
│       │   ├── aws/                 # Overview, EC2, S3, RDS, Lambda, VPC
│       │   └── azure/               # Overview, VMs, Storage, VNets, Databases, App Services
│       └── services/
│           ├── api.js               # Axios + interceptor 401
│           ├── authService.js       # login, register, credentials CRUD
│           ├── awsservices.js       # EC2, S3, RDS, Lambda, VPC, costs, overview
│           ├── azureservices.js     # VMs, storage, vnets, databases, app services, costs
│           ├── costService.js       # Abstração multi-cloud de custos
│           ├── alertService.js      # CRUD alertas + eventos
│           └── logsService.js       # GET /logs com filtros
├── docker-compose.yml
└── README.md
```

---

## Como Executar

### Pré-requisitos

- Docker e Docker Compose

### 1. Configure o ambiente

```bash
cp .env.example .env
```

Edite o `.env`:

```env
# Banco de dados
POSTGRES_USER=cloudhub
POSTGRES_PASSWORD=cloudhub_pass
POSTGRES_DB=cloudhub_db

# Segurança — gere com: openssl rand -hex 32
SECRET_KEY=seu-secret-key-aqui
ENCRYPTION_KEY=            # opcional; derivado do SECRET_KEY se vazio

# Portas
API_PORT=8000
FRONTEND_PORT=3000
```

> As credenciais AWS/Azure **não precisam** ficar no `.env`. Cada usuário cadastra as próprias credenciais na aba Configurações da aplicação.

### 2. Suba os containers

```bash
docker-compose up -d --build
```

### 3. Acesse

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |

### 4. Primeiro acesso

1. Acesse http://localhost:3000 → você será redirecionado para `/login`
2. Clique em **Criar conta** e cadastre um usuário
3. Vá em **Configurações** e adicione suas credenciais AWS e/ou Azure
4. Navegue pelas abas para gerenciar seus recursos

---

## Funcionalidades Implementadas

### Autenticação
- [x] Cadastro de usuário (email + senha)
- [x] Login com JWT (expira em 24h)
- [x] Rotas protegidas (redirect para `/login` em 401)
- [x] Logout

### Credenciais por Usuário
- [x] Cadastro de credenciais AWS (`access_key_id` + `secret_access_key` + `region`)
- [x] Cadastro de credenciais Azure (`subscription_id` + `tenant_id` + `client_id` + `client_secret`)
- [x] Armazenamento criptografado no banco (Fernet)
- [x] Múltiplas credenciais por provedor (labels diferentes)
- [x] Remoção de credenciais
- [x] Mensagem de orientação quando nenhuma credencial está cadastrada

### AWS
- [x] Overview com contagens por serviço
- [x] EC2 — listagem, iniciar, parar instâncias
- [x] S3 — listagem de buckets
- [x] RDS — listagem de instâncias de banco
- [x] Lambda — listagem de funções serverless
- [x] VPC — listagem de redes
- [x] Custos via AWS Cost Explorer API
- [x] Sidebar secundária com collapse/expand

### Azure
- [x] Overview com contagens por serviço
- [x] VMs — listagem, iniciar, parar (desalocação)
- [x] Storage Accounts — listagem
- [x] VNets — listagem de redes virtuais
- [x] SQL Databases — listagem de servidores e bancos
- [x] App Services — listagem, iniciar, parar
- [x] Custos via Azure Cost Management API
- [x] Sidebar secundária com collapse/expand

### Dashboard
- [x] Stat cards (total VMs, em execução, paradas, clouds)
- [x] Tabs AWS / Azure com contagens
- [x] Cost Forecast — gráfico LineChart 30 dias (lazy loading)
- [x] Card de instâncias compacto com link "Ver todas"
- [x] Atividades Recentes — alimentado por logs reais de auditoria

### Análise de Custos (`/costs`)
- [x] Seletor de período (30d / 90d / 6m / 1 ano)
- [x] Métricas: total, crescimento %, maior serviço, projeção fim do mês
- [x] LineChart — evolução diária AWS + Azure + Total
- [x] BarChart — custos por serviço (top 8)
- [x] PieChart — distribuição AWS vs Azure
- [x] Export CSV e PDF

### Alertas de Custo
- [x] Criar/editar/excluir alertas por provedor, serviço e threshold
- [x] Alertas do tipo valor fixo ou percentual
- [x] Badge de notificações no header com contagem não lida
- [x] Dropdown com últimos 5 eventos não lidos
- [x] Histórico de eventos disparados
- [x] Marcar como lido / marcar todos como lidos

### Logs de Auditoria (`/logs`)
- [x] Registro automático de todas as ações relevantes:
  - Login e cadastro
  - Adição e remoção de credenciais
  - Iniciar/parar EC2, VMs Azure e App Services
  - Criação e exclusão de alertas
- [x] Página `/logs` com tabela filtrável (ação, provedor, período)
- [x] Paginação por offset
- [x] Logs preservados mesmo após exclusão de usuário

### Interface
- [x] Dark mode (toggle no header)
- [x] Layout responsivo com sidebar
- [x] Tela de login com animação SVG (nós flutuantes AWS/Azure)
- [x] Busca local em todas as tabelas de recursos
- [x] Visualização em tabela e grade nos painéis de recursos
- [x] Indicador de carregamento e atualização
- [x] Tratamento de erros com mensagens amigáveis

---

## Permissões Necessárias nas Clouds

### AWS (IAM)

```
ec2:DescribeInstances, ec2:StartInstances, ec2:StopInstances
ec2:DescribeVpcs, ec2:DescribeSubnets
s3:ListAllMyBuckets, s3:GetBucketLocation
rds:DescribeDBInstances
lambda:ListFunctions
ce:GetCostAndUsage
```

### Azure (RBAC)

- **Reader** — para listar recursos (VMs, Storage, VNets, Databases, App Services)
- **Contributor** ou **Virtual Machine Contributor** — para start/stop de VMs e App Services
- **Cost Management Reader** — para consultar custos via Cost Management API

---

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `POSTGRES_USER` | Usuário do banco | `cloudhub` |
| `POSTGRES_PASSWORD` | Senha do banco | `cloudhub_pass` |
| `POSTGRES_DB` | Nome do banco | `cloudhub_db` |
| `SECRET_KEY` | Chave para JWT e criptografia | `changeme-...` |
| `ENCRYPTION_KEY` | Chave Fernet explícita (opcional) | derivado do `SECRET_KEY` |
| `API_PORT` | Porta da API | `8000` |
| `FRONTEND_PORT` | Porta do frontend | `3000` |
| `DEBUG` | Modo debug | `True` |
| `LOG_LEVEL` | Nível de log | `INFO` |

> **Produção**: gere o `SECRET_KEY` com `openssl rand -hex 32` e defina `DEBUG=False`.

---

## Roadmap

### Próximas Funcionalidades
- [ ] Suporte a múltiplas regiões AWS simultâneas
- [ ] Suporte a múltiplas subscriptions Azure simultâneas
- [ ] Alertas de instâncias paradas/com erro
- [ ] Notificações por e-mail ou webhook
- [ ] Métricas de CPU/memória por instância (CloudWatch / Azure Monitor)
- [ ] Google Cloud Platform (GCP) — Compute Engine
- [ ] Oracle Cloud Infrastructure (OCI)

---

## Licença

MIT License
