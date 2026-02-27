# 02 — Banco de Dados

## Cadeia de Migrations (Alembic)

```
9776e03cc232  →  a1b2c3d4e5f6  →  b2c3d4e5f6a7  →  c3d4e5f6a7b8  →  d4e5f6a7b8c9
     │                │                │                │                │
  Esquema         +OAuth fields    +FinOps tables   +templates       +scheduled_actions
  inicial          (oauth_provider  (recommendations,  (resource        (APScheduler
  (12 tabelas)      oauth_id,        actions, scan      templates)       job store)
                    avatar_url)      schedules)

     ↓                ↓                ↓                ↓                ↓

e5f6a7b8c9d0  →  f6a7b8c9d0e1  →  g7b8c9d0e1f2  →  h8c9d0e1f2g3  →  i9d0e1f2g3h4
     │                │                │                │                │
+user_dashboard  +MFA fields       +finops_scan     +org_type +       +is_admin
 _configs         (mfa_enabled,      _schedules       parent_org_id     +enterprise
 (JSONB)           mfa_secret,       (UniqueConstraint (org hierarchy)   _leads
                   mfa_token,         workspace_id)
                   mfa_token_exp)

     ↓                ↓                ↓
j0e1f2g3h4i5  →  k1f2g3h4i5j6
     │                │
+webhook_        +last_spend +
 endpoints +      last_evaluated_at
 webhook_         +alert_sent_at
 deliveries       (finops_budgets)
                 +report_schedules
```

---

## Tabelas

### `users`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| email | String UNIQUE | |
| hashed_password | String | bcrypt |
| full_name | String | |
| is_verified | Boolean | verificação por e-mail |
| is_active | Boolean | |
| is_admin | Boolean | acesso ao AdminPanel da plataforma |
| oauth_provider | String | `google` \| `github` \| null |
| oauth_id | String | ID no provedor OAuth |
| avatar_url | String | foto do perfil (SSO) |
| mfa_enabled | Boolean | MFA por e-mail ativo |
| mfa_secret | String | OTP hashed (bcrypt) |
| mfa_token | String | token JWT em andamento |
| mfa_token_exp | DateTime | expiração do mfa_token (10 min) |
| created_at | DateTime | |

### `organizations`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| name | String | |
| slug | String UNIQUE | identificador URL |
| plan_tier | String | `free` \| `pro` \| `enterprise` |
| org_type | String | `standalone` \| `master` \| `partner` |
| parent_org_id | UUID FK → organizations | hierarquia MSP |
| created_at | DateTime | |

### `organization_members`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| user_id | UUID FK → users | |
| organization_id | UUID FK → organizations | |
| role | String | `owner` \| `admin` \| `operator` \| `viewer` \| `billing` |
| created_at | DateTime | |

UniqueConstraint: `(user_id, organization_id)`

### `workspaces`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| organization_id | UUID FK → organizations | |
| name | String | |
| slug | String | único por organização |
| is_active | Boolean | |
| created_at | DateTime | |

### `workspace_members`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| user_id | UUID FK | |
| role | String | override do papel da org |
| created_at | DateTime | |

### `cloud_accounts`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| provider | String | `aws` \| `azure` \| `gcp` \| `m365` |
| label | String | nome amigável |
| account_id | String | ID da conta / domínio tenant |
| encrypted_data | String | credenciais criptografadas com Fernet |
| is_active | Boolean | |
| created_by | UUID FK → users | |
| created_at | DateTime | |

**Conteúdo de `encrypted_data` por provedor:**

| Provider | Campos criptografados |
|----------|----------------------|
| `aws` | `access_key_id`, `secret_access_key`, `region` |
| `azure` | `subscription_id`, `tenant_id`, `client_id`, `client_secret` |
| `gcp` | `project_id`, `client_email`, `private_key`, `private_key_id` |
| `m365` | `tenant_id`, `client_id`, `client_secret` |

### `refresh_tokens`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| user_id | UUID FK | |
| token_hash | String | SHA-256 do token real |
| expires_at | DateTime | 7 dias |
| revoked | Boolean | revogado (single-use rotation) |
| created_at | DateTime | |

### `cost_alerts`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| created_by | UUID FK | |
| name | String | |
| provider | String | `aws` \| `azure` |
| service | String | nome do serviço ou `*` |
| threshold_type | String | `fixed` \| `percentage` |
| threshold_value | Float | valor do threshold |
| is_active | Boolean | |

### `alert_events`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| alert_id | UUID FK → cost_alerts | |
| workspace_id | UUID FK | |
| triggered_at | DateTime | |
| current_value | Float | custo que disparou |
| threshold_value | Float | |
| is_read | Boolean | |

### `activity_logs`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| user_id | UUID FK (nullable) | null se usuário deletado |
| organization_id | UUID FK | |
| workspace_id | UUID FK (nullable) | |
| action | String | ex: `ec2.start`, `login.success` |
| provider | String | aws \| azure \| gcp \| system |
| resource_id | String | |
| status | String | `success` \| `error` |
| details | JSONB | dados adicionais |
| created_at | DateTime | |

### `scheduled_actions`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| created_by | UUID FK | |
| name | String | |
| provider | String | `aws` \| `azure` |
| resource_type | String | `ec2` \| `azure_vm` \| `app_service` |
| resource_id | String | |
| resource_name | String | |
| action | String | `start` \| `stop` |
| schedule_type | String | `daily` \| `weekdays` \| `weekends` |
| hour | Integer | UTC |
| minute | Integer | |
| is_enabled | Boolean | |
| last_run_at | DateTime | |
| last_run_status | String | `success` \| `failed` |
| next_run_at | DateTime | |
| apscheduler_job_id | String | ID no APScheduler |

### `user_dashboard_configs`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| user_id | UUID FK | |
| workspace_id | UUID FK | |
| config | JSONB | `{widgets: [{id, visible, order}]}` |
| updated_at | DateTime | |

UniqueConstraint: `(user_id, workspace_id)`

### `finops_recommendations`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| provider | String | |
| resource_id | String | |
| resource_name | String | |
| recommendation_type | String | `idle_ec2`, `orphan_ebs`, `idle_ip`, `schedule`, etc. |
| priority | String | `high` \| `medium` \| `low` |
| estimated_monthly_savings | Float | |
| current_spec | JSONB | spec atual do recurso |
| recommended_spec | JSONB | spec recomendada |
| status | String | `active` \| `applied` \| `dismissed` |
| dismiss_reason | String | |
| created_at | DateTime | |
| updated_at | DateTime | |

### `finops_actions`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| recommendation_id | UUID FK | |
| workspace_id | UUID FK | |
| executed_by | UUID FK → users | |
| action_type | String | `apply` \| `undo` \| `dismiss` |
| status | String | `success` \| `failed` \| `rolled_back` |
| previous_state | JSONB | estado antes da ação |
| executed_at | DateTime | |

### `finops_budgets`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| name | String | |
| provider | String | |
| period_type | String | `monthly` \| `quarterly` \| `annual` |
| amount | Float | |
| alert_threshold_pct | Float | % do orçamento para alertar |
| last_spend | Float | gasto atual (atualizado por POST /budgets/evaluate) |
| last_evaluated_at | DateTime | |
| alert_sent_at | DateTime | dedup de alertas (24h) |

### `finops_scan_schedules`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| workspace_id | UUID FK UNIQUE | um por workspace |
| is_enabled | Boolean | |
| frequency | String | `daily` \| `weekly` |
| day_of_week | Integer | 0=segunda (se semanal) |
| hour | Integer | UTC |
| last_run_at | DateTime | |
| last_run_status | String | |
| next_run_at | DateTime | |
| apscheduler_job_id | String | |

### `report_schedules`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| workspace_id | UUID FK UNIQUE | um por workspace |
| schedule_type | String | `weekly` \| `monthly` |
| send_day | Integer | dia do envio |
| send_time | String | `HH:MM` |
| timezone | String | IANA timezone |
| recipients | JSONB | lista de e-mails |
| include_costs | Boolean | |
| include_budgets | Boolean | |
| include_recommendations | Boolean | |
| is_enabled | Boolean | |
| last_run_at | DateTime | |
| last_run_status | String | |

### `enterprise_leads`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| user_id | UUID FK → users | quem enviou |
| org_id | UUID FK → organizations | |
| name | String | |
| email | String | |
| company | String | |
| phone | String | |
| message | String | |
| status | String | `new` \| `contacted` \| `converted` \| `lost` |
| created_at | DateTime | |

### `webhook_endpoints`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| created_by | UUID FK | |
| name | String | |
| url | String | URL de destino |
| events | JSONB | lista de event_types assinados |
| secret | String | segredo para HMAC-SHA256 |
| is_active | Boolean | |
| created_at | DateTime | |

Máximo: 10 webhooks por workspace.

### `webhook_deliveries`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| webhook_id | UUID FK | |
| event_type | String | |
| payload | JSONB | corpo completo enviado |
| status | String | `success` \| `failed` |
| http_status | Integer | código HTTP da resposta |
| response_body | String | primeiros 500 chars |
| attempt_count | Integer | |
| delivered_at | DateTime | |
| created_at | DateTime | |

### `payments`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| organization_id | UUID FK | |
| user_id | UUID FK | |
| billing_id | String | ID no AbacatePay |
| plan_tier | String | plano a ativar após pagamento |
| amount | Integer | em centavos |
| status | String | `pending` \| `paid` \| `failed` |
| created_at | DateTime | |

### `pending_invitations`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID PK | |
| organization_id | UUID FK | |
| invited_by | UUID FK → users | |
| email | String | |
| role | String | |
| token | String UNIQUE | 32 bytes, expira em 7 dias |
| expires_at | DateTime | |
| accepted_at | DateTime | |

---

## Conexão e Pool

Configurado em `database.py`:

```python
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_pre_ping=True,
)
```

---

## Migrations — Como criar nova

```bash
# Dentro do container backend
alembic revision --autogenerate -m "descricao_da_mudanca"
# Editar o arquivo gerado em alembic/versions/
# Ajustar down_revision para apontar para a última migration

# Aplicar manualmente (em dev)
alembic upgrade head

# Em produção, o entrypoint.sh chama run_migrations() automaticamente
```
