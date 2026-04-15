# CloudAtlas

Plataforma multi-cloud + Microsoft 365 centralizada para gerenciar, monitorar e otimizar recursos de nuvem em um único lugar — com hierarquia de organizações, controle de acesso por papel (RBAC), FinOps, segurança multi-cloud, observabilidade e monitoramento integrado.

## Visão Geral

O CloudAtlas permite que times de infraestrutura e engenharia visualizem e operem recursos AWS + Azure + GCP, administrem o ambiente Microsoft 365 (usuários, licenças, Exchange, SharePoint, Teams, GDAP), controlem custos, recebam alertas, identifiquem desperdícios automaticamente, apliquem economias reais, gerenciem backup e segurança multi-cloud, e conduzam operações MSP/Enterprise — tudo sem precisar alternar entre consoles.

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, React Router v6, TanStack Query, Lucide Icons, @dnd-kit |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2, slowapi (rate limiting) |
| Banco de dados | PostgreSQL 16 |
| Cache | Redis 7 (graceful degradation via `app/core/cache.py`) |
| ORM / Migrações | SQLAlchemy 2.0 + Alembic |
| Autenticação | JWT (python-jose) + bcrypt + MFA por e-mail (OTP 6 dígitos) |
| SSO | Google OAuth 2.0 / GitHub OAuth |
| Criptografia | Fernet (cryptography) — credenciais cloud |
| AWS SDK | boto3 + CloudWatch + Cost Explorer |
| Azure SDK | azure-identity + azure-mgmt-compute + azure-mgmt-network + azure-mgmt-monitor + azure-mgmt-costmanagement + azure-mgmt-recoveryservices |
| GCP SDK | google-cloud-compute + google-cloud-storage + google-cloud-functions + google-api-python-client |
| Microsoft 365 | MSAL + Microsoft Graph API v1.0 + Exchange Online Admin API (beta + v2.0) |
| Gráficos | Recharts |
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable |
| HTTP Client | httpx (webhook delivery) |
| Scheduler | APScheduler 3.10.4 + SQLAlchemyJobStore |
| Monitoramento | Prometheus + Grafana |
| Proxy / SSL | Caddy (auto HTTPS via Let's Encrypt) |
| Containerização | Docker + Docker Compose |
| Pagamentos | AbacatePay (PIX/Cartão) |
| E-mail | SMTP via SendGrid |
| Desk Frontend | React 18 + Vite + Tailwind CSS (portal helpdesk separado) |

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
│       │               │            │               │          │
│       └───────────────┘      ┌─────┴──────┐   ┌────┴─────┐   │
│                              ▼            ▼   │  Redis   │   │
│                          AWS API    Azure API  │  :6379   │   │
│                              ▼            ▼   └──────────┘   │
│                          GCP API   Microsoft                  │
│                                    Graph API                  │
│                                    Exchange                   │
│                                    Online API                 │
│                                                               │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐              │
│  │Prometheus│──▶│ Grafana  │   │ Desk Frontend│              │
│  │  :9090   │   │  :3001   │   │  (helpdesk)  │              │
│  └──────────┘   └──────────┘   └──────────────┘              │
└────────────────────────────────────────────────────────────────┘
```

### Modelo de Hierarquia

```
Organization (org)
├── org_type: standalone | master | partner
├── plan_tier: free | pro | enterprise
└── Workspace (ws)
    ├── CloudAccount (credenciais AWS / Azure / GCP / M365 por workspace)
    ├── Recursos (EC2, VMs, S3, RDS, Lambda, VPC, GCE, ...)
    ├── CostAlerts / AlertEvents
    ├── FinOpsRecommendations / FinOpsBudgets / FinOpsActions
    ├── ScheduledActions (start/stop automático)
    ├── WebhookEndpoints / WebhookDeliveries
    ├── NotificationChannels (Slack, Teams, e-mail)
    ├── ApprovalRequests
    ├── ResourceTemplates
    ├── BackgroundTasks
    └── ActivityLogs
```

### Hierarquia MSP (Enterprise)

```
Master Org (org_type=master)
├── Managed Org 1 (org_type=partner, parent_org_id=master.id)
├── Managed Org 2 (org_type=partner, parent_org_id=master.id)
└── ...
```

**RBAC — Papéis por organização (com override por workspace):**

| Papel | Recursos | Start/Stop | Custos | Alertas | Logs | Membros | Org Settings | Webhooks |
|-------|----------|------------|--------|---------|------|---------|--------------|----------|
| `owner` | Ver | Sim | Ver | Gerenciar | Ver | Gerenciar | Editar | Gerenciar |
| `admin` | Ver | Sim | Ver | Gerenciar | Ver | Gerenciar | — | Gerenciar |
| `operator` | Ver | Sim | — | — | Ver | — | — | Gerenciar |
| `viewer` | Ver | — | — | — | Ver | — | — | Ver |
| `billing` | — | — | Ver | Gerenciar | Ver | — | — | — |

---

## Funcionalidades

### Autenticação e SSO
- Cadastro com e-mail + senha (verificação de e-mail via SMTP)
- Login com JWT (access token 30min + refresh token 7 dias, single-use rotation)
- SSO via Google OAuth 2.0 e GitHub OAuth
- MFA por e-mail — OTP 6 dígitos, JWT `mfa_token` separado, toggle em configurações
- Convite de membros por e-mail (SMTP)
- Refresh automático de token no frontend (interceptor 401)

### Onboarding
- Wizard 4 etapas pós-cadastro: configurar org → workspace → cloud account → tour do dashboard
- Redirecionamento automático via `ProtectedRoute` se `onboarding_completed = false`

### Organizações e Workspaces
- Criação e gerenciamento de organizações
- Múltiplos workspaces por organização
- Convite de membros com papel (owner / admin / operator / viewer / billing)
- Override de papel por workspace
- Slug único por organização
- Campos opcionais em membros: telefone, departamento, notas

### Contas Cloud (Credenciais)
- Credenciais AWS, Azure, GCP e M365 armazenadas criptografadas (Fernet) por workspace
- Múltiplas contas por provedor
- Suporte a `account_id` para identificação na AWS

### AWS
- Overview com contagens por serviço
- **EC2** — listar, iniciar, parar; criar instância (tipo, AMI, SG, subnet, tags)
- **S3** — listar buckets; criar bucket (região, ACL, versioning)
- **RDS** — listar instâncias; criar banco (engine, classe, storage, credenciais)
- **Lambda** — listar funções; criar função (runtime, handler, role, código ZIP)
- **VPC** — listar redes e subnets; criar VPC (CIDR, nome)
- **Backup** — gerenciamento de backups AWS (EBS snapshots, Recovery Points)
- **Segurança** — scan de segurança (portas abertas, IAM misconfigs, security groups)
- Custos via AWS Cost Explorer (diário, por serviço)

### Azure
- Overview com contagens por serviço
- **Virtual Machines** — listar, iniciar, parar (deallocate); criar VM (tamanho, imagem, rede, credenciais) — criação assíncrona via background tasks (HTTP 202)
- **Storage Accounts** — listar; criar (SKU, kind, tier) — criação assíncrona
- **Virtual Networks** — listar VNets e subnets; criar VNet (CIDR, região)
- **SQL Databases** — listar servidores e bancos; criar banco (SKU, servidor, credenciais)
- **App Services** — listar, iniciar, parar; criar app (plano, runtime, região)
- **Backup** — Recovery Services Vault, enable backup por VM (LRO fire-and-forget)
- **Segurança** — security assessment via Defender for Cloud
- Custos via Azure Cost Management

### GCP
- Overview com contagens por serviço
- **Compute Engine** — listar instâncias, iniciar, parar; criar VM
- **Cloud Storage** — listar buckets; criar bucket
- **Cloud SQL** — listar instâncias; criar banco
- **Cloud Functions** — listar funções; criar função
- **VPC Networks** — listar redes; criar VPC
- **Backup** — backup de instâncias GCP
- **Segurança** — scan GCP (IAM, DLP, firewall rules)
- Custos estimados via Cloud Billing API

### Microsoft 365 (Enterprise)
- **Dashboard M365** — 5 abas: Visão Geral (KPIs), Usuários, Licenças, Equipes, Segurança (MFA)
- **Wizard de Criação de Usuário** — modal 4 etapas: dados básicos → licença → grupos → confirmar/executar
- **Usuários** — listagem, filtro por tipo (membro/guest), offboarding workflow (desabilitar + revogar sessões + remover licenças)
- **Licenças** — SKUs com nomes amigáveis, atribuição/remoção por usuário, contagem disponível/total
- **Equipes** — listar, criar, editar, arquivar; gerenciar canais (CRUD) e membros (roles owner/member)
- **Atividade Teams** — relatório D30: usuários ativos, reuniões, mensagens (via Graph Reports API)

#### Exchange Admin
- **Caixas de Correio** — listagem, MailboxDrawer com auto-reply + timezone + delegação
- **Delegação** — Full Access, Enviar Como, Enviar em Nome de (via Exchange Online Admin API)
- **Caixas Compartilhadas** — listagem via EXO `Get-Mailbox -RecipientTypeDetails SharedMailbox`; criação com seleção de domínio; configuração (auto-reply + delegação)
- **Listas de Distribuição** — listagem, criação com seleção de domínio, gerenciamento de membros (add/remove)
- **Atividade de E-mail** — gráfico barras 30 dias (via Graph Reports API)

#### SharePoint Admin
- **Sites** — listagem, metadados, SiteDrawer com detalhes
- **Bibliotecas** — seleção de site → drives → itens com navegação por pasta
- **Visão Geral** — uso de armazenamento SharePoint + OneDrive

#### Audit Logs M365
- **Sign-in logs** — via Graph `/auditLogs/signIns`
- **Directory audit logs** — via Graph `/auditLogs/directoryAudits`

#### GDAP Manager (MSP — Enterprise/Master)
- **Relações GDAP** — criar, listar, expirar, enviar convite por e-mail
- **Clientes** — lista de `delegatedAdminCustomers`, busca por nome/tenant ID
- **Templates de roles** — tier1/tier2/full com 8 roles GDAP pré-configuradas
- **Convites** — modal com `inviteUrl`, botão copiar + envio de e-mail multi-destinatário

#### Permissões M365 necessárias (Application)
| Permissão | Recurso |
|-----------|---------|
| `User.ReadWrite.All` | Usuários |
| `Group.ReadWrite.All` | Grupos e distribuição |
| `Directory.Read.All` | Leitura do diretório |
| `Sites.Read.All` | SharePoint sites |
| `MailboxSettings.ReadWrite` | Configurações de caixa |
| `TeamSettings.ReadWrite.All` | Times |
| `Channel.ReadBasic.All` | Canais |
| `ChannelMember.ReadWrite.All` | Membros de canais |
| `Reports.Read.All` | Relatórios de atividade |
| `AuditLog.Read.All` | Audit logs |
| `Exchange.ManageAsApp` | Exchange Online (EXO API) |
| `DelegatedAdminRelationship.ReadWrite.All` | GDAP (MSP) |

> **RBAC Azure AD adicional:** Atribuir o papel "Administrador do Exchange" ao service principal para operações EXO.

### Dashboard Customizável
- **6 widgets independentes**, cada um com seus próprios dados:
  - **Estatísticas Cloud** — contagens de VMs, contas e instâncias por cloud
  - **Custo & Forecast** — gráfico 30 dias (AWS + Azure) com projeção
  - **Resumo FinOps** — economia potencial, recomendações e anomalias em destaque
  - **Alertas de Custo** — últimos 5 eventos de alerta com link para detalhes
  - **Próximos Agendamentos** — próximas 5 ações agendadas por `next_run_at` (Pro)
  - **Atividade Recente** — últimas 8 entradas do audit log
- **Reordenação por drag-and-drop** (dnd-kit) com handle visível ao passar o mouse
- **Ativar/desativar widgets** via painel lateral "Personalizar"
- **Preferências salvas no banco** por usuário + workspace — sincroniza entre dispositivos
- Restaurar layout padrão com 1 clique

### Inventário Unificado (`/inventory`)
- Todos os recursos AWS + Azure + GCP em uma única tabela
- Busca full-text, filtro por provedor e tipo de recurso
- Paginação e export CSV

### Agendamentos (`/schedules`) — Pro+

Automação de start/stop de recursos por horário, sem necessidade de cron externo:

- **Criação de agendamentos** com seletor de recurso real (busca EC2, VMs, App Services existentes no workspace)
- Tipos: diário, dias úteis (Seg–Sex), fins de semana (Sáb–Dom)
- Horário em UTC com exibição do fuso configurável
- **Habilitar / desabilitar** agendamento sem excluir
- **Histórico de execuções** com status (sucesso / falha) e próxima execução prevista
- Integração com FinOps: recomendação `schedule` para recursos rodando 24/7 cria automaticamente par START + STOP

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

### Segurança Multi-Cloud
- **Scan por provider** — AWS, Azure, GCP com detecção de vulnerabilidades
- **Severidade** — critical / high / medium / low
- **AWS** — portas abertas, IAM misconfigs, security groups
- **Azure** — Defender for Cloud assessments
- **GCP** — IAM, DLP, firewall rules

### Backup Multi-Cloud
- **AWS** — EBS snapshots, Recovery Points
- **Azure** — Recovery Services Vault, enable backup por VM
- **GCP** — backup de instâncias

### Webhooks de Eventos — Pro+
- **Eventos:** `resource.started`, `resource.stopped`, `resource.failed`, `alert.triggered`, `finops.scan.completed`, `billing.paid`, `org.member.added`, `schedule.executed`
- **Assinatura HMAC-SHA256** via header `X-CloudAtlas-Signature`
- Histórico de entregas com status HTTP e payload
- Máximo 10 webhooks por workspace
- Regeneração de secret

### Canais de Notificação
- **Slack** — webhook de entrada
- **Microsoft Teams** — webhook de entrada
- **E-mail** — via SMTP
- **Webhook custom** — endpoint configurável
- Configuração por workspace

### Aprovações
- Workflow de aprovação de ações por workspace
- Aprovar/rejeitar com comentário
- Badge de contagem no sidebar

### Templates de Recursos
- Salvar configurações de criação como template reutilizável
- Carregar template nos forms de criação de recursos

### Relatórios Executivos
- Custo por período com breakdown por provedor
- Utilização de recursos multi-cloud
- Resumo executivo consolidado

### Políticas de Conformidade
- Definir políticas por workspace
- Avaliar recursos contra políticas
- Remediação automatizada

### Suporte e Tickets
- CRUD de tickets por organização
- Comentários e acompanhamento de status
- Atribuição a agentes helpdesk
- **Desk Frontend** — portal separado para agentes de suporte (React + Vite)

### Logs de Auditoria (`/logs`)
- Registro automático de todas as ações: login, credenciais, recursos, alertas, FinOps
- Filtros por ação, provedor, status e período
- Paginação por offset
- Logs preservados após exclusão de usuário

### Background Tasks
- Criação de recursos pesados de forma assíncrona (Azure VMs, Storage Accounts)
- Endpoint retorna HTTP 202 com `task_id` imediatamente
- Polling automático no frontend a cada 4s com pausa quando aba oculta
- Toasts de conclusão com auto-dismiss
- Cleanup automático de tarefas > 24h

### Planos e Faturamento
| Plano | Preço | Workspaces | Contas Cloud | Funcionalidades |
|-------|-------|------------|--------------|-----------------|
| **Free** | R$ 0/mês | 2 | 3 | Dashboard básico, monitoramento de recursos, alertas simples |
| **Pro** | R$ 497/mês | 10 | 20 | FinOps, Agendamentos, Webhooks, Alertas avançados, Scan automático |
| **Enterprise** | R$ 2.497/mês + R$397/org extra | Ilimitados | Ilimitadas | Tudo do Pro + MSP (orgs gerenciadas), M365, GDAP, suporte dedicado |

- Integração AbacatePay (PIX e Cartão)
- Tela de seleção de plano com comparativo de features
- Webhook de confirmação de pagamento
- Faturamento recorrente com histórico de transições de status

### MSP / Enterprise
- **Orgs Gerenciadas** — painel de controle para master orgs (criar, remover, summary stats)
- **Preço enterprise** — base R$2.497/mês (5 orgs inclusas) + R$397 por org extra
- **Banner partner** — orgs parceiras exibem "Organização gerenciada por [master]"

### Admin Platform
- Tab **Leads** — solicitações Enterprise com filtro por status (novo/contatado/convertido/perdido)
- Tab **Orgs** — buscar orgs, ver plano atual, alterar plano (bypass de pagamento)
- Acesso via `User.is_admin = true`

### Monitoramento & Observabilidade
- Prometheus coleta métricas de latência e throughput da API
- Grafana com dashboard pré-configurado
- Health check endpoint `/health`
- Docker Compose dedicado para stack de observabilidade

### Design System
- Tema dark/light mode com persistência
- Login redesign — dark theme completo com glass morphism, provider badges e animações
- Animações customizadas (`fadeUp`, `slideIn`, `pulse-soft`)
- Classes utilitárias: `.card-interactive`, `.modal-overlay`, `.skeleton`, `.toast`, `.badge-live`
- Componentes: `SkeletonLoader`, `ErrorBoundary`, `EmptyState`, `LoadingSpinner`
- Tipografia Plus Jakarta Sans + DM Sans

### Cache Redis
- Cache automático para listagem de recursos (EC2, S3, RDS, VMs, Storage, VNets, GCP, etc.)
- TTLs configuráveis por tipo de recurso (120s–300s)
- Invalidação automática em create/delete
- Graceful degradation — funciona normalmente sem Redis

---

## Estrutura do Projeto

```
cloud-atlas-manager/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py              # Registro, login, refresh, SSO, MFA
│   │   │   ├── orgs.py              # CRUD organizações + membros + convites + managed-orgs
│   │   │   ├── workspaces.py        # CRUD workspaces
│   │   │   ├── cloud_accounts.py    # Contas cloud por workspace
│   │   │   ├── aws.py               # EC2, S3, RDS, Lambda, VPC, costs, backup, security
│   │   │   ├── azure.py             # VMs, Storage, VNets, SQL, App Services, costs, backup, security
│   │   │   ├── gcp.py               # Compute, Storage, SQL, Functions, VPC, backup, security
│   │   │   ├── m365/                # Microsoft 365 (modularizado)
│   │   │   │   ├── _users.py        # Usuários, criação, offboarding
│   │   │   │   ├── _licenses.py     # Licenças
│   │   │   │   ├── _exchange.py     # Exchange Admin (EXO)
│   │   │   │   ├── _sharepoint.py   # SharePoint Admin
│   │   │   │   ├── _teams.py        # Teams Admin
│   │   │   │   ├── _gdap.py         # GDAP Manager (MSP)
│   │   │   │   ├── _audit.py        # Audit logs
│   │   │   │   ├── _security.py     # MFA status
│   │   │   │   ├── _groups.py       # Grupos e listas de distribuição
│   │   │   │   ├── _guests.py       # Usuários convidados
│   │   │   │   ├── _msp.py          # MSP summary multi-tenant
│   │   │   │   └── _dashboard.py    # Dashboard M365
│   │   │   ├── finops/              # FinOps (modularizado)
│   │   │   │   ├── _recommendations.py
│   │   │   │   ├── _budgets.py
│   │   │   │   ├── _anomalies.py
│   │   │   │   ├── _actions.py
│   │   │   │   ├── _scans.py
│   │   │   │   ├── _schedules.py
│   │   │   │   └── _summary.py
│   │   │   ├── alerts.py            # Alertas de custo
│   │   │   ├── logs.py              # Auditoria
│   │   │   ├── schedules.py         # CRUD agendamentos + APScheduler jobs
│   │   │   ├── dashboard_config.py  # Config de widgets por user+workspace
│   │   │   ├── billing.py           # Planos e pagamentos (AbacatePay)
│   │   │   ├── webhooks.py          # Webhooks CRUD + test + deliveries
│   │   │   ├── inventory.py         # Inventário unificado multi-cloud
│   │   │   ├── support.py           # Sistema de tickets e helpdesk
│   │   │   ├── notification_channels.py  # Canais de notificação
│   │   │   ├── approvals.py         # Workflow de aprovações
│   │   │   ├── resource_templates.py # Templates de recursos
│   │   │   ├── executive_reports.py  # Relatórios executivos
│   │   │   ├── policies.py          # Políticas de conformidade
│   │   │   ├── pricing.py           # Pricing endpoints
│   │   │   ├── background_tasks.py  # Tarefas assíncronas
│   │   │   └── admin.py             # Admin panel: leads + gestão de orgs
│   │   ├── core/
│   │   │   ├── config.py            # Settings (env vars)
│   │   │   ├── dependencies.py      # Guards: get_current_user, require_permission
│   │   │   ├── auth_context.py      # MemberContext (user + org + workspace + role)
│   │   │   ├── permissions.py       # RBAC: Permission enum + ROLE_PERMISSIONS
│   │   │   ├── cache.py             # Redis client com graceful degradation
│   │   │   └── limiter.py           # slowapi rate limiter
│   │   ├── models/
│   │   │   ├── db_models.py         # 20+ tabelas ORM
│   │   │   └── schemas.py           # Pydantic schemas
│   │   ├── services/
│   │   │   ├── auth_service.py      # JWT, bcrypt, Fernet, MFA/OTP
│   │   │   ├── oauth_service.py     # Google/GitHub OAuth2
│   │   │   ├── aws_service.py       # boto3: todos os recursos AWS
│   │   │   ├── azure_service.py     # Azure SDK: todos os recursos Azure
│   │   │   ├── gcp_service.py       # GCP SDK: todos os recursos GCP
│   │   │   ├── m365/               # Microsoft 365 services (modularizado)
│   │   │   ├── finops/             # FinOps scanners (modularizado)
│   │   │   ├── security_service.py  # Scanner multi-cloud (severidade)
│   │   │   ├── scheduler_service.py # APScheduler + SQLAlchemyJobStore
│   │   │   ├── webhook_service.py   # fire_event() + HMAC-SHA256
│   │   │   ├── email_service.py     # SMTP via SendGrid
│   │   │   ├── payment_service.py   # AbacatePay API
│   │   │   ├── plan_service.py      # Limites por plano
│   │   │   ├── log_service.py       # Auditoria non-fatal
│   │   │   ├── policy_service.py    # Avaliação de políticas
│   │   │   ├── report_service.py    # Geração de relatórios
│   │   │   ├── notification_channel_service.py  # Slack, Teams, e-mail
│   │   │   ├── notification_service.py          # Dispatch de notificações
│   │   │   ├── approval_service.py              # Lógica de aprovações
│   │   │   ├── background_task_service.py       # Tarefas assíncronas
│   │   │   ├── branding_service.py              # Branding por org
│   │   │   ├── currency_service.py              # Conversão de moedas
│   │   │   ├── aws_advisor_service.py           # AWS Trusted Advisor
│   │   │   ├── azure_advisor_service.py         # Azure Advisor
│   │   │   └── gcp_recommender_service.py       # GCP Recommender
│   │   ├── database.py              # Engine, SessionLocal, run_migrations()
│   │   └── main.py
│   ├── alembic/                     # Migrações de banco (20+ versões)
│   ├── tests/                       # Testes pytest
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── contexts/
│       │   ├── AuthContext.jsx              # Estado global de autenticação
│       │   ├── OrgWorkspaceContext.jsx      # Org + workspace + isMasterOrg/isPartnerOrg
│       │   ├── ThemeContext.jsx             # Dark/light mode
│       │   ├── DashboardConfigContext.jsx   # Widgets visíveis + ordem (dnd-kit)
│       │   └── BackgroundTasksContext.jsx   # Polling de tarefas assíncronas
│       ├── components/
│       │   ├── common/                # ProtectedRoute, PermissionGate, PlanGate, etc.
│       │   ├── dashboard/             # SortableWidget, DashboardCustomizer, widgets/
│       │   ├── finops/                # RecommendationsTab, BudgetsTab, AnomaliesTab, etc.
│       │   ├── schedules/             # ScheduleCard, ScheduleFormModal
│       │   ├── layout/                # Layout, Sidebar, Header, WorkspaceSwitcher
│       │   └── ui/                    # SkeletonLoader, ErrorBoundary, EmptyState, etc.
│       ├── pages/
│       │   ├── login.jsx / register.jsx / OAuthCallback.jsx
│       │   ├── Onboarding.jsx         # Wizard 4 etapas pós-cadastro
│       │   ├── Dashboard.jsx          # 6 widgets customizáveis via DndKit
│       │   ├── costs.jsx              # Custos com gráficos e exportação
│       │   ├── FinOps.jsx             # Recomendações de otimização (Pro)
│       │   ├── Schedules.jsx          # Agendamentos start/stop (Pro)
│       │   ├── Webhooks.jsx           # Webhooks com histórico (Pro)
│       │   ├── Inventory.jsx          # Inventário unificado multi-cloud
│       │   ├── Support.jsx / Suporte.jsx  # Sistema de tickets
│       │   ├── NotificationChannels.jsx   # Configuração de canais
│       │   ├── ApprovalsPage.jsx      # Workflow de aprovações
│       │   ├── ManagedOrgsPage.jsx    # Painel MSP (Enterprise)
│       │   ├── AdminPanel.jsx         # Admin: Leads + Orgs (is_admin)
│       │   ├── Billing.jsx            # Planos e pagamentos
│       │   ├── aws/                   # Overview, EC2, S3, RDS, Lambda, VPC, Backup, Security
│       │   ├── azure/                 # Overview, VMs, Storage, VNets, Databases, AppServices, Backup, Security
│       │   ├── gcp/                   # Overview, Compute, Storage, SQL, Functions, VPC, Backup, Security
│       │   └── m365/                  # M365Dashboard, Exchange, SharePoint, TeamsAdmin, Audit, GdapManager
│       ├── services/                  # Axios services (workspace-scoped)
│       ├── hooks/                     # Custom hooks (useClipboard, useModal, useDebounce, etc.)
│       └── utils/                     # Formatters, constantes
├── desk-frontend/                     # Portal Helpdesk (React + Vite + Tailwind)
│   └── src/
│       ├── pages/                     # Login, Support, Suporte, TicketDetails
│       ├── components/                # Componentes do portal
│       ├── contexts/                  # Auth + Theme
│       └── services/                  # API client
├── observabilidade/
│   ├── docker-compose.yml             # Prometheus + Grafana stack
│   └── prometheus/
│       └── prometheus.yml             # Configuração do Prometheus
├── infra/
│   ├── docker-compose.prod.yml
│   └── docker/
│       ├── backend.prod.Dockerfile
│       ├── frontend.prod.Dockerfile
│       ├── entrypoint.sh              # run_migrations() + gunicorn
│       └── Caddyfile                  # Reverse proxy + auto SSL
├── docs/                              # Documentação adicional
├── docker-compose.yml                 # Desenvolvimento local
└── landingpage/                       # Landing page do produto
```

---

## Como Executar

### Desenvolvimento Local

**Pré-requisitos:** Docker e Docker Compose

```bash
# 1. Clone o repositório
git clone <repo> && cd cloud-atlas-manager

# 2. Configure o ambiente
cp .env.example .env
# Edite o .env com suas chaves

# 3. Suba os containers
docker-compose up -d --build

# 4. Acesse
# Frontend: http://localhost:3000
# API:      http://localhost:8000
# Swagger:  http://localhost:8000/docs
# Grafana:  http://localhost:3001
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

### Observabilidade (Prometheus + Grafana)

```bash
docker compose -f observabilidade/docker-compose.yml up -d
```

---

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `POSTGRES_USER` | Usuário do banco | `cloudatlas` |
| `POSTGRES_PASSWORD` | Senha do banco | `cloudatlas_pass` |
| `POSTGRES_DB` | Nome do banco | `cloudatlas_db` |
| `SECRET_KEY` | Chave JWT + criptografia | — |
| `ENCRYPTION_KEY` | Chave Fernet explícita | derivado do `SECRET_KEY` |
| `REDIS_URL` | URL do Redis | `redis://redis:6379/0` |
| `DEBUG` | Modo debug | `True` |
| `LOG_LEVEL` | Nível de log | `INFO` |
| `ALLOWED_ORIGINS` | CORS origins (JSON array) | `["http://localhost:3000"]` |
| `SMTP_HOST` | Servidor SMTP para convites/verificação | — |
| `SMTP_PORT` | Porta SMTP | `465` |
| `SMTP_USER` / `SMTP_PASSWORD` | Credenciais SMTP | — |
| `SMTP_FROM` | E-mail remetente | — |
| `FRONTEND_URL` | URL base do frontend | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `SECRET` | SSO Google | — |
| `GITHUB_CLIENT_ID` / `SECRET` | SSO GitHub | — |
| `ABACATEPAY_API_KEY` | Chave de pagamentos | — |

> Credenciais AWS/Azure/GCP/M365 **não ficam no `.env`**. Cada workspace cadastra as próprias contas cloud pela interface.

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
      "ec2:DeleteSnapshot", "ec2:CreateSnapshot",
      "s3:ListAllMyBuckets", "s3:GetBucketLocation", "s3:CreateBucket",
      "rds:DescribeDBInstances", "rds:StopDBInstance", "rds:StartDBInstance",
      "lambda:ListFunctions",
      "ce:GetCostAndUsage",
      "cloudwatch:GetMetricStatistics",
      "iam:GetAccountSummary", "iam:ListUsers",
      "trustedadvisor:Describe*"
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
| Backup Contributor | Gerenciar Recovery Services Vault |
| Security Reader | Defender for Cloud assessments |

---

## Banco de Dados — 20+ Tabelas

```
organizations              ← Orgs (plan_tier, org_type, parent_org_id, notes, suspended_reason)
organization_members       ← Membros com role + phone, department, notes
pending_invitations        ← Convites pendentes por email (token 7 dias)
workspaces                 ← Workspaces por org
workspace_members          ← Override de role por workspace
cloud_accounts             ← Credenciais cloud criptografadas (provider: aws|azure|gcp|m365)
users                      ← Usuários (email, bcrypt, MFA, is_admin, onboarding_completed)
refresh_tokens             ← Refresh tokens (SHA-256, single-use rotation)
payments                   ← Pagamentos AbacatePay
billing_records            ← Faturamento recorrente
billing_status_history     ← Histórico de transições de status
cost_alerts                ← Alertas de custo
alert_events               ← Eventos disparados
activity_logs              ← Logs de atividade
scheduled_actions          ← Agendamentos start/stop
user_dashboard_configs     ← Config de dashboard (JSONB)
finops_recommendations     ← Recomendações FinOps
finops_actions             ← Histórico de ações FinOps
finops_scan_schedules      ← Auto-scan FinOps
enterprise_leads           ← Solicitações Enterprise
webhook_endpoints          ← Webhooks (url, events JSONB, secret, is_active)
webhook_deliveries         ← Histórico de entregas
notification_channels      ← Canais de notificação (Slack, Teams, e-mail)
approval_requests          ← Pedidos de aprovação
resource_templates         ← Templates de criação de recursos
background_tasks           ← Tarefas assíncronas
apscheduler_jobs           ← Jobstore do APScheduler
```

---

## Roadmap

### Concluído recentemente
- [x] Dashboard customizável com drag-and-drop e persistência por usuário
- [x] Agendamentos automáticos de start/stop (APScheduler + SQLAlchemyJobStore)
- [x] FinOps — detecção de desperdício AWS + Azure, aplicar/desfazer com 1 clique
- [x] Webhooks de eventos com assinatura HMAC-SHA256
- [x] Google Cloud Platform (GCP) — Compute Engine, Storage, SQL, Functions, VPC
- [x] MSP / Enterprise — hierarquia master/partner, orgs gerenciadas
- [x] MFA por e-mail — OTP 6 dígitos, JWT separado, toggle em configurações
- [x] Microsoft 365 — painel completo (usuários, licenças, equipes, segurança)
- [x] Microsoft 365 — Exchange Admin (caixas, shared mailboxes, listas de distribuição, delegação)
- [x] Microsoft 365 — SharePoint Admin (sites, bibliotecas, armazenamento)
- [x] Microsoft 365 — Teams Admin (times, canais, membros, atividade)
- [x] Microsoft 365 — Wizard de criação de usuário 4 etapas
- [x] Microsoft 365 — Exchange Online Admin API (EXO)
- [x] Microsoft 365 — GDAP Manager (relações, convites, clientes)
- [x] Microsoft 365 — Audit Logs (sign-in + directory)
- [x] Backup multi-cloud — AWS (EBS/snapshots), Azure (Recovery Services Vault), GCP
- [x] Segurança multi-cloud — scan por provider com severidade
- [x] Inventário unificado — todos os recursos AWS + Azure + GCP com busca, filtro e export CSV
- [x] Suporte e tickets — CRUD de tickets por org, comentários, atribuição a helpdesk
- [x] Desk Frontend — portal separado para agentes de suporte
- [x] Canais de notificação — Slack, Microsoft Teams, e-mail configuráveis por workspace
- [x] Aprovações — workflow de aprovação de ações por workspace
- [x] Templates de recursos — salvar e reutilizar configurações de criação
- [x] Relatórios executivos — custo por período, utilização e resumo multi-cloud
- [x] Políticas de conformidade — definir, avaliar e remediar recursos fora de conformidade
- [x] Onboarding — wizard 4 etapas pós-cadastro (org → workspace → cloud account → tour)
- [x] Login redesign — dark theme completo com glass morphism, provider badges e animações
- [x] Background tasks — criação assíncrona de recursos Azure com polling e toasts
- [x] Cache Redis — cache automático por recurso com invalidação e graceful degradation
- [x] Design System — animações, skeleton loaders, error boundary, dark mode full
- [x] Admin Panel — gestão de leads Enterprise e alteração de planos
- [x] AWS/Azure/GCP Advisor — recomendações via Trusted Advisor, Azure Advisor e GCP Recommender
- [x] Conversão de moedas — currency service integrado
- [x] Branding por organização — personalização visual

### Próximos — Alta Prioridade
- [ ] AWS — ECS/EKS, DynamoDB, CloudFront, Route 53, API Gateway, SNS/SQS
- [ ] Azure — AKS, Container Registry, API Management, Service Bus, Function Apps
- [ ] GCP — Cloud Run, BigQuery, Pub/Sub, Firestore, Cloud Armor
- [ ] M365 — Intune (dispositivos gerenciados e políticas de conformidade)
- [ ] M365 — Defender for M365 (alertas e incidents via Graph Security API)
- [ ] FinOps — Reserved Instance advisor + Spot recommendations + Azure Reservations
- [ ] Testes automatizados (`pytest` backend + `vitest` + Playwright E2E)

### Próximos — Média Prioridade
- [ ] Motor de automação visual (workflows if/then multi-cloud)
- [ ] Integração com IaC (exportar recursos como Terraform / CloudFormation / Bicep)
- [ ] Showback / Chargeback interno por time ou projeto via tags
- [ ] Integrações externas: Jira, ServiceNow, PagerDuty, Datadog
- [ ] SSO/SAML Enterprise (Okta, Azure AD B2C)
- [ ] M365 — Conditional Access — visualizar e auditar políticas
- [ ] M365 — Calendários e salas via Graph API
- [ ] Retentativa automática de webhooks (backoff exponencial)

> Roadmap completo com detalhes técnicos em [`featuresfuturas.md`](./featuresfuturas.md)

---

## Licença

MIT License
