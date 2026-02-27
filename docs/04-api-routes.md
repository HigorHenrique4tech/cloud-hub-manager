# 04 — Rotas da API

Base URL: `/api/v1`

Rotas workspace-scoped: `/api/v1/orgs/{org_slug}/workspaces/{workspace_id}/...`

---

## Autenticação (`/auth`)

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| POST | `/auth/register` | Criar conta | — |
| POST | `/auth/login` | Login (retorna JWT ou inicia MFA) | — |
| POST | `/auth/refresh` | Trocar refresh token por novo par | — |
| POST | `/auth/logout` | Revogar refresh token | Bearer |
| GET | `/auth/me` | Dados do usuário logado | Bearer |
| PUT | `/auth/me` | Atualizar perfil | Bearer |
| PUT | `/auth/me/password` | Alterar senha | Bearer |
| PUT | `/auth/me/mfa` | Habilitar/desabilitar MFA | Bearer |
| GET | `/auth/verify/{token}` | Verificar e-mail | — |
| POST | `/auth/resend-verification` | Reenviar e-mail de verificação | Bearer |
| POST | `/auth/mfa/verify` | Verificar OTP do MFA | Bearer (mfa_token) |
| POST | `/auth/mfa/resend` | Reenviar OTP | Bearer (mfa_token) |
| GET | `/auth/google/login` | Iniciar SSO Google | — |
| GET | `/auth/google/callback` | Callback SSO Google | — |
| GET | `/auth/github/login` | Iniciar SSO GitHub | — |
| GET | `/auth/github/callback` | Callback SSO GitHub | — |
| POST | `/auth/invitations/{token}/accept` | Aceitar convite de org | Bearer |

---

## Organizações (`/orgs`)

| Método | Rota | Permissão |
|--------|------|-----------|
| GET | `/orgs` | listagem das orgs do usuário |
| POST | `/orgs` | criar organização |
| GET | `/orgs/{slug}` | detalhes da org |
| PUT | `/orgs/{slug}` | atualizar org |
| DELETE | `/orgs/{slug}` | excluir org |
| GET | `/orgs/{slug}/members` | listar membros |
| POST | `/orgs/{slug}/members/invite` | convidar membro |
| PUT | `/orgs/{slug}/members/{user_id}` | alterar papel |
| DELETE | `/orgs/{slug}/members/{user_id}` | remover membro |
| GET | `/orgs/{slug}/invitations` | convites pendentes |
| DELETE | `/orgs/{slug}/invitations/{id}` | cancelar convite |
| GET | `/orgs/{slug}/managed-orgs` | listar orgs parceiras (MSP) |
| GET | `/orgs/{slug}/managed-orgs/summary` | resumo agregado (MSP) |
| POST | `/orgs/{slug}/managed-orgs` | criar org parceira (MSP) |
| DELETE | `/orgs/{slug}/managed-orgs/{partner_slug}` | desvincular parceira (MSP) |

---

## Workspaces (`/orgs/{slug}/workspaces`)

| Método | Rota |
|--------|------|
| GET | `/orgs/{slug}/workspaces` |
| POST | `/orgs/{slug}/workspaces` |
| GET | `/orgs/{slug}/workspaces/{id}` |
| PUT | `/orgs/{slug}/workspaces/{id}` |
| DELETE | `/orgs/{slug}/workspaces/{id}` |
| GET | `/orgs/{slug}/workspaces/{id}/members` |
| POST | `/orgs/{slug}/workspaces/{id}/members` |
| DELETE | `/orgs/{slug}/workspaces/{id}/members/{user_id}` |

---

## Contas Cloud (workspace-scoped)

Prefixo: `/orgs/{slug}/workspaces/{ws_id}/cloud-accounts`

| Método | Rota |
|--------|------|
| GET | `/cloud-accounts` |
| POST | `/cloud-accounts` |
| PUT | `/cloud-accounts/{id}` |
| DELETE | `/cloud-accounts/{id}` |

---

## AWS (workspace-scoped) — `/aws`

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/aws/overview` | Contagens por serviço |
| GET | `/aws/ec2` | Listar instâncias EC2 |
| POST | `/aws/ec2` | Criar instância EC2 |
| POST | `/aws/ec2/{id}/start` | Iniciar instância |
| POST | `/aws/ec2/{id}/stop` | Parar instância |
| GET | `/aws/ec2/amis` | Listar AMIs disponíveis |
| GET | `/aws/ec2/security-groups` | Listar Security Groups |
| GET | `/aws/ec2/subnets` | Listar subnets |
| GET | `/aws/s3` | Listar buckets S3 |
| POST | `/aws/s3` | Criar bucket S3 |
| GET | `/aws/rds` | Listar instâncias RDS |
| POST | `/aws/rds` | Criar banco RDS |
| GET | `/aws/lambda` | Listar funções Lambda |
| POST | `/aws/lambda` | Criar função Lambda |
| GET | `/aws/vpc` | Listar VPCs e subnets |
| POST | `/aws/vpc` | Criar VPC |
| GET | `/aws/costs` | Custos (Cost Explorer) |

---

## Azure (workspace-scoped) — `/azure`

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/azure/overview` | Contagens por serviço |
| GET | `/azure/subscriptions` | Listar assinaturas |
| GET | `/azure/resource-groups` | Listar resource groups |
| GET | `/azure/vms` | Listar VMs |
| POST | `/azure/vms` | Criar VM |
| POST | `/azure/vms/{rg}/{name}/start` | Iniciar VM |
| POST | `/azure/vms/{rg}/{name}/stop` | Parar VM (deallocate) |
| GET | `/azure/storage` | Listar Storage Accounts |
| POST | `/azure/storage` | Criar Storage Account |
| GET | `/azure/vnets` | Listar VNets e subnets |
| POST | `/azure/vnets` | Criar VNet |
| GET | `/azure/databases` | Listar SQL Servers + DBs |
| POST | `/azure/databases` | Criar SQL Database |
| GET | `/azure/app-services` | Listar App Services |
| POST | `/azure/app-services` | Criar App Service |
| POST | `/azure/app-services/{rg}/{name}/start` | Iniciar App Service |
| POST | `/azure/app-services/{rg}/{name}/stop` | Parar App Service |
| GET | `/azure/costs` | Custos (Cost Management) |

---

## GCP (workspace-scoped) — `/gcp`

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/gcp/overview` | Contagens por serviço |
| GET | `/gcp/credentials` | Status das credenciais |
| POST | `/gcp/credentials` | Salvar credenciais GCP |
| DELETE | `/gcp/credentials` | Remover credenciais |
| GET | `/gcp/compute` | Listar instâncias Compute Engine |
| POST | `/gcp/compute/{zone}/{name}/start` | Iniciar instância |
| POST | `/gcp/compute/{zone}/{name}/stop` | Parar instância |
| GET | `/gcp/storage` | Listar buckets Cloud Storage |
| GET | `/gcp/sql` | Listar instâncias Cloud SQL |
| GET | `/gcp/functions` | Listar Cloud Functions |
| GET | `/gcp/vpc` | Listar VPC Networks |

---

## Microsoft 365 (workspace-scoped) — `/m365`

| Método | Rota | Permissão | Descrição |
|--------|------|-----------|-----------|
| GET | `/m365/credentials` | `m365.view` | Status da conexão |
| POST | `/m365/credentials` | `m365.manage` | Salvar credenciais |
| DELETE | `/m365/credentials` | `m365.manage` | Remover credenciais |
| GET | `/m365/overview` | `m365.view` | KPIs do tenant |
| GET | `/m365/users` | `m365.view` | Lista usuários com MFA/licenças |
| GET | `/m365/licenses` | `m365.view` | SKUs de licenças |
| GET | `/m365/teams` | `m365.view` | Lista equipes |
| GET | `/m365/teams/{team_id}/members` | `m365.view` | Membros de uma equipe |
| POST | `/m365/teams/{team_id}/members` | `m365.manage` | Adicionar membro |
| GET | `/m365/security` | `m365.view` | Cobertura MFA + usuários de risco |

**Org-level (MSP):**

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/orgs/{slug}/m365/tenants` | Resumo de todos os tenants parceiros |

---

## FinOps (workspace-scoped) — `/finops` — Pro+

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/finops/scan` | Executar scan de desperdício |
| GET | `/finops/recommendations` | Listar recomendações |
| POST | `/finops/recommendations/{id}/apply` | Aplicar recomendação |
| POST | `/finops/recommendations/{id}/undo` | Desfazer (24h window) |
| POST | `/finops/recommendations/{id}/dismiss` | Descartar |
| GET | `/finops/actions` | Histórico de ações |
| GET | `/finops/budgets` | Listar orçamentos |
| POST | `/finops/budgets` | Criar orçamento |
| PUT | `/finops/budgets/{id}` | Atualizar orçamento |
| DELETE | `/finops/budgets/{id}` | Excluir orçamento |
| POST | `/finops/budgets/evaluate` | Avaliar gastos vs orçamentos |
| GET | `/finops/anomalies` | Listar anomalias detectadas |
| GET | `/finops/scan-schedule` | Config do auto-scan |
| POST | `/finops/scan-schedule` | Criar/atualizar auto-scan |
| DELETE | `/finops/scan-schedule` | Remover auto-scan |
| GET | `/finops/report-schedule` | Config de relatório automático |
| POST | `/finops/report-schedule` | Criar/atualizar relatório |
| DELETE | `/finops/report-schedule` | Remover relatório |

---

## Agendamentos (workspace-scoped) — `/schedules` — Pro+

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/schedules` | Listar agendamentos |
| POST | `/schedules` | Criar agendamento |
| PUT | `/schedules/{id}` | Atualizar agendamento |
| DELETE | `/schedules/{id}` | Excluir agendamento |
| POST | `/schedules/{id}/toggle` | Habilitar/desabilitar |

---

## Webhooks (workspace-scoped) — `/webhooks` — Pro+

| Método | Rota | Permissão |
|--------|------|-----------|
| GET | `/webhooks` | `webhooks.view` |
| POST | `/webhooks` | `webhooks.manage` |
| PUT | `/webhooks/{id}` | `webhooks.manage` |
| DELETE | `/webhooks/{id}` | `webhooks.manage` |
| POST | `/webhooks/{id}/test` | `webhooks.manage` |
| POST | `/webhooks/{id}/regenerate-secret` | `webhooks.manage` |
| GET | `/webhooks/{id}/deliveries` | `webhooks.view` |

---

## Alertas (workspace-scoped) — `/alerts`

| Método | Rota |
|--------|------|
| GET | `/alerts` |
| POST | `/alerts` |
| PUT | `/alerts/{id}` |
| DELETE | `/alerts/{id}` |
| GET | `/alerts/events` |
| PUT | `/alerts/events/{id}/read` |
| POST | `/alerts/events/read-all` |

---

## Logs (workspace-scoped) — `/logs`

| Método | Rota |
|--------|------|
| GET | `/logs` |

---

## Dashboard Config (workspace-scoped)

| Método | Rota |
|--------|------|
| GET | `/dashboard-config` |
| PUT | `/dashboard-config` |

---

## Pricing (workspace-scoped) — `/pricing`

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/pricing/estimate` | Estimativa de custo em tempo real (AWS Pricing API + Azure Retail Prices) |

**Body:**
```json
{
  "type": "ec2",
  "instance_type": "t3.medium",
  "os": "linux",
  "region": "us-east-1"
}
```

**Response:**
```json
{
  "monthly": 30.42,
  "hourly": 0.0418,
  "items": [
    {"label": "t3.medium (Linux)", "monthly": 30.42},
    {"label": "Licença Windows Server", "monthly": 18.98}
  ],
  "source": "live",
  "region": "us-east-1"
}
```

---

## Billing — `/billing`

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/billing/plans` | Listar planos disponíveis |
| POST | `/billing/checkout` | Criar checkout AbacatePay (PIX) |
| GET | `/billing/verify/{billing_id}` | Verificar status do pagamento |
| POST | `/billing/webhook` | Webhook AbacatePay (confirmação) |
| GET | `/billing/history` | Histórico de pagamentos da org |
| GET | `/billing/usage` | Uso atual (workspaces, contas, etc.) |

---

## Admin — `/admin`

| Método | Rota | Acesso |
|--------|------|--------|
| POST | `/admin/leads` | Qualquer usuário autenticado |
| GET | `/admin/leads` | is_admin only |
| PUT | `/admin/leads/{id}` | is_admin only |
| GET | `/admin/orgs` | is_admin only |
| PUT | `/admin/orgs/{slug}/plan` | is_admin only |

---

## Health Check

```
GET /health
→ { "status": "healthy", "checks": { "database": "ok" } }
```

---

## Padrões de Resposta

**Paginação (webhook deliveries, admin):**
```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "pages": 10,
  "page_size": 10
}
```

**Erro padrão:**
```json
{
  "detail": "Mensagem de erro descritiva"
}
```

**Códigos HTTP usados:**
- `200` — Sucesso
- `201` — Criado
- `400` — Dados inválidos
- `401` — Não autenticado
- `403` — Sem permissão (papel insuficiente ou plano insuficiente)
- `404` — Não encontrado
- `422` — Validação Pydantic
- `429` — Rate limit excedido
- `502` — Falha ao chamar API cloud externa
- `503` — Serviço de pricing indisponível (retorna estimativa estática)
