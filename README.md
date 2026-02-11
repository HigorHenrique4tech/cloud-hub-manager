# Cloud Hub Manager

Plataforma centralizada para gerenciar recursos multi-cloud em um único lugar, com autenticação de usuários e credenciais por conta.

## Visão Geral

O Cloud Hub Manager permite que times de infraestrutura visualizem e operem recursos de múltiplos provedores de nuvem através de uma interface unificada, sem precisar acessar cada console individualmente.

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI + Python 3.11 |
| Banco de dados | PostgreSQL 16 |
| ORM | SQLAlchemy 2.0 + Alembic |
| Autenticação | JWT (python-jose) + bcrypt |
| Criptografia de credenciais | Fernet (cryptography) |
| AWS SDK | boto3 |
| Azure SDK | azure-identity + azure-mgmt-compute |
| Frontend | React 18 + Vite |
| Estilização | Tailwind CSS |
| Ícones | lucide-react |
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
│   │   │   ├── aws.py           # GET /aws/ec2, start, stop
│   │   │   └── azure.py         # GET /azure/vms, start, stop
│   │   ├── core/
│   │   │   ├── config.py        # Settings (env vars)
│   │   │   └── dependencies.py  # get_current_user (JWT guard)
│   │   ├── models/
│   │   │   ├── db_models.py     # SQLAlchemy ORM (User, CloudCredential)
│   │   │   └── schemas.py       # Pydantic schemas
│   │   ├── services/
│   │   │   └── auth_service.py  # JWT, bcrypt, Fernet
│   │   ├── database.py          # Engine, SessionLocal, create_tables
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── contexts/
│       │   └── AuthContext.jsx      # Estado global de autenticação
│       ├── components/
│       │   ├── common/
│       │   │   ├── ProtectedRoute.jsx    # Guard de rota
│       │   │   └── NoCredentialsMessage.jsx
│       │   ├── layout/
│       │   └── resources/
│       ├── pages/
│       │   ├── login.jsx        # Tela de login com animação SVG
│       │   ├── register.jsx
│       │   ├── dashboard.jsx
│       │   ├── AWS.jsx          # Listagem e controle de EC2
│       │   ├── Azure.jsx        # Listagem e controle de VMs Azure
│       │   ├── costs.jsx        # Análise de custos (WIP)
│       │   └── settings.jsx     # Gerenciar credenciais por usuário
│       └── services/
│           ├── api.js           # Axios + interceptor 401
│           ├── authService.js   # login, register, credentials CRUD
│           ├── awsservices.js
│           └── azureservices.js
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
4. Navegue para as abas **AWS** ou **Azure** para ver seus recursos

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
- [x] Listagem de instâncias EC2
- [x] Iniciar instância
- [x] Parar instância
- [x] Visualização em tabela e grade

### Azure
- [x] Listagem de VMs
- [x] Iniciar VM
- [x] Parar VM (desalocação)
- [x] Visualização em tabela e grade

### Interface
- [x] Layout responsivo com sidebar
- [x] Tela de login com animação SVG (nós flutuantes AWS/Azure)
- [x] Dashboard com resumo de recursos
- [x] Indicador de carregamento e atualização
- [x] Tratamento de erros com mensagens amigáveis

---

## Roadmap

### Fase 2 — Múltiplas credenciais e regiões
- [ ] Seletor de credencial ativa por página (quando o usuário tem mais de uma)
- [ ] Suporte a múltiplas regiões AWS simultâneas
- [ ] Suporte a múltiplas subscriptions Azure simultâneas

### Fase 3 — Mais serviços AWS
- [ ] S3 — listagem de buckets e objetos
- [ ] RDS — instâncias de banco de dados
- [ ] Lambda — funções serverless
- [ ] VPC — redes e sub-redes

### Fase 4 — Custos reais
- [ ] Integração com AWS Cost Explorer API
- [ ] Integração com Azure Cost Management API
- [ ] Gráficos de evolução de gastos (Recharts)
- [ ] Alertas de custo por threshold

### Fase 5 — Alertas e Notificações
- [ ] Alertas de instâncias paradas/com erro
- [ ] Notificações por e-mail ou webhook
- [ ] Histórico de eventos por recurso

### Fase 6 — Expansão de provedores
- [ ] Google Cloud Platform (GCP) — Compute Engine
- [ ] Oracle Cloud Infrastructure (OCI)
- [ ] Firewalls de borda (pfSense, FortiGate)

### Fase 7 — Observabilidade
- [ ] Métricas de CPU/memória por instância
- [ ] Logs centralizados
- [ ] Status de saúde dos serviços

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

## Licença

MIT License
