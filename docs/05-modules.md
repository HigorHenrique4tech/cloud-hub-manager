# 05 — Módulos de Funcionalidades

## AWS

**Service:** `backend/app/services/aws_service.py` (classe `AWSService`)
**API:** `backend/app/api/aws.py`
**Frontend:** `frontend/src/pages/aws/`

### Recursos suportados

| Recurso | Listar | Criar | Start | Stop | Delete |
|---------|:------:|:-----:|:-----:|:----:|:------:|
| EC2 | ✅ | ✅ | ✅ | ✅ | — |
| S3 | ✅ | ✅ | — | — | — |
| RDS | ✅ | ✅ | ✅ | ✅ | — |
| Lambda | ✅ | ✅ | — | — | — |
| VPC | ✅ | ✅ | — | — | — |

### Permissões IAM mínimas necessárias

```json
{
  "Effect": "Allow",
  "Action": [
    "ec2:Describe*", "ec2:StartInstances", "ec2:StopInstances",
    "ec2:RunInstances", "ec2:CreateVpc", "ec2:DeleteVolume",
    "ec2:ReleaseAddress", "ec2:DeleteSnapshot",
    "s3:ListAllMyBuckets", "s3:GetBucketLocation", "s3:CreateBucket",
    "rds:Describe*", "rds:CreateDBInstance", "rds:StartDBInstance", "rds:StopDBInstance",
    "lambda:ListFunctions", "lambda:CreateFunction",
    "ce:GetCostAndUsage",
    "cloudwatch:GetMetricStatistics",
    "pricing:GetProducts"
  ],
  "Resource": "*"
}
```

---

## Azure

**Service:** `backend/app/services/azure_service.py` (classe `AzureService`)
**API:** `backend/app/api/azure.py`
**Frontend:** `frontend/src/pages/azure/`

### Recursos suportados

| Recurso | Listar | Criar | Start | Stop |
|---------|:------:|:-----:|:-----:|:----:|
| Virtual Machines | ✅ | ✅ | ✅ | ✅ (deallocate) |
| Storage Accounts | ✅ | ✅ | — | — |
| Virtual Networks | ✅ | ✅ | — | — |
| SQL Databases | ✅ | ✅ | — | — |
| App Services | ✅ | ✅ | ✅ | ✅ |
| Subscriptions | ✅ | — | — | — |
| Resource Groups | ✅ | — | — | — |

### Roles RBAC mínimas no Azure

| Role | Para quê |
|------|---------|
| Reader | Listar todos os recursos |
| Virtual Machine Contributor | Start/stop/resize VMs |
| Website Contributor | App Services |
| Disk Delete | Deletar discos gerenciados |
| Network Contributor | Gerenciar IPs públicos |
| Cost Management Reader | Consultar custos |
| Monitoring Reader | Métricas Azure Monitor (FinOps) |

### Bug conhecido — Subscriptions
`SubscriptionClient.subscriptions.list()` requer Reader a nível de subscription.
Se o SP tiver acesso apenas a Resource Group, usa-se fallback:
`subscriptions.get(subscription_id)` com o ID armazenado nas credenciais.

---

## GCP

**Service:** `backend/app/services/gcp_service.py` (classe `GCPService`)
**API:** `backend/app/api/gcp.py` (prefixo `/gcp`)
**Frontend:** `frontend/src/pages/gcp/`
**Sidebar:** verde (`bg-green-500`)

### Credenciais
Service Account com chave JSON. Campos armazenados: `project_id`, `client_email`, `private_key`, `private_key_id`.

### Recursos suportados

| Recurso | Endpoint |
|---------|---------|
| Compute Engine | `GET /gcp/compute` |
| Cloud Storage | `GET /gcp/storage` |
| Cloud SQL | `GET /gcp/sql` |
| Cloud Functions | `GET /gcp/functions` |
| VPC Networks | `GET /gcp/vpc` |

### SDKs necessárias (requirements.txt)
```
google-cloud-compute
google-cloud-storage
google-cloud-functions
google-api-python-client
google-auth
```

---

## Microsoft 365

**Service:** `backend/app/services/m365_service.py` (classe `M365Service`)
**API:** `backend/app/api/m365.py`
**Frontend:** `frontend/src/pages/m365/M365Dashboard.jsx` (5 tabs)
**Plano:** Enterprise exclusivo

### Autenticação
`msal.ConfidentialClientApplication` com **Client Credentials Flow** (Application permissions, não delegado).

### Permissões necessárias no Azure AD App Registration

| Permissão | Para quê |
|-----------|---------|
| `User.Read.All` | Listar usuários |
| `Organization.Read.All` | Dados do tenant |
| `Reports.Read.All` | Relatórios de uso |
| `Team.ReadBasic.All` | Listar equipes Teams |
| `TeamMember.ReadWrite.All` | Listar e adicionar membros |
| `Directory.Read.All` | Fallback de grupos + MFA |
| `IdentityRiskyUser.Read.All` | Usuários de risco |
| `SubscribedSku.Read.All` | Licenças |

**Todas requerem admin consent.**

### Abas disponíveis

| Tab | Dados |
|-----|-------|
| **Visão Geral** | Total de usuários, licenças, equipes, desativados + barra de utilização |
| **Usuários** | Tabela com MFA, licenças, último acesso, departamento, status |
| **Licenças** | Cards por SKU com barra de progresso + alerta de baixo estoque |
| **Equipes** | Cards expansíveis: visibilidade, arquivamento, descrição, membros |
| **Segurança** | Cobertura MFA + usuários sem MFA + usuários de risco (IdentityProtection) |

### Teams — Fallback de endpoint

O endpoint `/teams` requer `Team.ReadBasic.All`. Se não disponível:
1. Busca **todos os grupos** via `GET /groups?$select=...,resourceProvisioningOptions&$top=999`
2. Filtra client-side: `"Team" in resourceProvisioningOptions`

O campo `signInActivity` nos usuários requer `AuditLog.Read.All` + Entra ID P1/P2.
Se retornar 403, faz retry sem o campo (a lista de usuários ainda funciona).

---

## FinOps

**Service:** `backend/app/services/finops_service.py`
**API:** `backend/app/api/finops.py`
**Frontend:** `frontend/src/pages/FinOps.jsx`
**Plano:** Scan ilimitado + Apply = Pro+

### Regras de detecção de desperdício

**AWS (`AWSFinOpsScanner`):**

| Tipo | Critério | Economia estimada |
|------|---------|-------------------|
| `idle_ec2` | CPU CloudWatch média < 5% em 7 dias | ~50% (right-size) |
| `orphan_ebs` | Volume EBS desanexado > 7 dias | 100% do custo do volume |
| `idle_ip` | Elastic IP sem associação | $7.20/IP/mês |
| `idle_rds` | < 5 conexões/dia em 7 dias | ~90% (stop) |
| `old_snapshot` | Snapshot EBS > 90 dias | 100% |
| `schedule` | Recurso rodando 24/7 (detectado como dev/test) | variável |

**Azure (`AzureFinOpsScanner`):**

| Tipo | Critério | Economia estimada |
|------|---------|-------------------|
| `idle_azure_vm` | CPU Azure Monitor < 5% em 7 dias | ~50% (right-size) |
| `unattached_disk` | Managed Disk state = Unattached | 100% |
| `idle_public_ip` | Public IP sem IP configuration | ~$3.65/mês |

### Prioridades
- `high`: economia > R$50/mês
- `medium`: R$10–50/mês
- `low`: < R$10/mês

### Anomalias (Pro+)
- Baseline: média de custo por serviço nos últimos 14 dias
- Anomalia: custo > baseline + 3 desvios padrão por 2 dias consecutivos

### Orçamentos (Pro+)
- Avaliação via `POST /finops/budgets/evaluate`
- Busca MTD spend no Cost Explorer (AWS) ou Cost Management (Azure)
- Dispara webhook `budget.threshold_crossed` + e-mail
- Dedup: `alert_sent_at` com janela de 24h

### Relatórios automáticos (Pro+)
- Agendamento por workspace (weekly/monthly)
- APScheduler registra cron job: `register_report_schedule()`
- E-mail com 3 seções: custos por serviço, progresso dos orçamentos, top recomendações FinOps
- Job diário global para avaliação de orçamentos: `execute_budget_eval()` 08:00 UTC

---

## Agendamentos

**Service:** `backend/app/services/scheduler_service.py`
**API:** `backend/app/api/schedules.py`
**Frontend:** `frontend/src/pages/Schedules.jsx`
**Plano:** Pro+

### Backend
- APScheduler 3.10.4 com `SQLAlchemyJobStore` (tabela `apscheduler_jobs`)
- Jobs persistem entre restarts do container
- `load_scheduled_actions()` chamado no startup: recarrega todos os jobs ativos

### Tipos de agendamento

| `schedule_type` | Dias |
|-----------------|------|
| `daily` | Todos os dias |
| `weekdays` | Seg–Sex |
| `weekends` | Sáb–Dom |

### Integração com FinOps
Quando uma recomendação com `recommendation_type="schedule"` é aplicada via `POST /finops/recommendations/{id}/apply`:
- Cria automaticamente **2 ScheduledActions**: uma START (07:00 UTC) + uma STOP (19:00 UTC)
- Preenche `resource_id`, `resource_name`, `provider`, `resource_type` da recomendação

### Resource picker dinâmico
O `ScheduleFormModal` busca recursos reais:
- AWS EC2: `GET /aws/ec2`
- Azure VM: `GET /azure/vms`
- Azure App Service: `GET /azure/app-services`
- Normaliza com `toOptions()` → auto-preenche `resource_id` + `resource_name`
- Fallback para campo de texto se API retornar erro

---

## Dashboard Customizável

**Model:** `UserDashboardConfig` (JSONB por user + workspace)
**Context:** `DashboardConfigContext.jsx`
**Components:** `SortableWidget.jsx`, `DashboardCustomizer.jsx`

### 6 Widgets disponíveis

| ID | Widget | Dados | Plano |
|----|--------|-------|-------|
| `stats` | Estatísticas Cloud | Contagens EC2/VMs/S3/etc por cloud | Free |
| `cost` | Custo & Forecast | Gráfico 30d + projeção | Free |
| `finops` | Resumo FinOps | Economia potencial + top recomendações | Pro (gate inline) |
| `alerts` | Alertas de Custo | Últimos 5 eventos de alerta | Free |
| `schedules` | Próximos Agendamentos | Top 5 por `next_run_at` | Pro (gate) |
| `activity` | Atividade Recente | Últimas 8 entradas de audit log | Free |

### Drag-and-drop
- `@dnd-kit/core` com `PointerSensor` (activationConstraint distance=8)
- `closestCenter` + `verticalListSortingStrategy`
- Handle visível ao hover (`GripVertical` icon)
- `DashboardCustomizer` slide-over: toggles de visibilidade + botão restaurar padrão

### Persistência
```
PUT /dashboard-config  →  UserDashboardConfig.config JSONB
UniqueConstraint: (user_id, workspace_id)
```

---

## Webhooks

**Service:** `backend/app/services/webhook_service.py`
**API:** `backend/app/api/webhooks.py`
**Frontend:** `frontend/src/pages/Webhooks.jsx`
**Plano:** Pro+

### Eventos suportados

| Evento | Disparado em |
|--------|-------------|
| `resource.started` | scheduler_service.py — start bem-sucedido |
| `resource.stopped` | scheduler_service.py — stop bem-sucedido |
| `resource.failed` | scheduler_service.py — falha de start/stop |
| `alert.triggered` | alerts.py — threshold cruzado |
| `finops.scan.completed` | scheduler_service.py — scan automático |
| `budget.threshold_crossed` | finops.py — POST /budgets/evaluate |
| `webhook.test` | webhooks.py — POST /test |
| `billing.paid` | billing.py — webhook AbacatePay |
| `org.member.added` | orgs.py — convite aceito |
| `schedule.executed` | scheduler_service.py — após execução |

### Assinatura HMAC-SHA256
```
X-CloudHub-Signature: sha256=HMAC_SHA256(secret, raw_body)
```

### Payload padrão
```json
{
  "event": "resource.started",
  "workspace_id": "uuid",
  "timestamp": "2026-02-27T12:00:00Z",
  "data": { ... }
}
```

### Limites
- Máximo 10 webhooks por workspace
- Timeout de 10s por entrega (httpx)
- Sem retentativa automática (roadmap)

---

## Estimativa de Custo em Tempo Real (Pricing)

**API:** `backend/app/api/pricing.py`
**Service:** consultas diretas AWS Pricing API + Azure Retail Prices API
**Frontend:** `CostEstimatePanel.jsx`

### Fontes

| Provider | API | Auth |
|----------|-----|------|
| AWS EC2 | AWS Pricing API (`pricing:GetProducts`) | credenciais do workspace |
| AWS RDS | AWS Pricing API | credenciais do workspace |
| Azure VM | Azure Retail Prices API (`prices.azure.com/api/retail/prices`) | pública (sem auth) |

### Cache em memória
- `_CACHE` dict no módulo com timestamp
- TTL: 24 horas
- Evita chamadas repetidas para mesma combinação `(type, instance_type, os, region)`

### Licenciamento separado
- **Windows Server (EC2/Azure VM):** Preço Linux + delta Windows = custo de licença
- **SQL Server (RDS):** Preço MySQL + delta SQL Server License Included
- **Oracle (RDS):** Preço MySQL + delta Oracle License Included
- Licenças exibidas com badge âmbar e ícone `Tag`

### Fallback estático
Se a API de pricing falhar (credenciais não configuradas, endpoint 503):
- Frontend usa tabelas hardcoded no `CostEstimatePanel.jsx`
- Badge mostra "Estimado" (cinza, WifiOff)
- Sem erro para o usuário
