# 06 — Planos, Billing & MSP

## Planos

| Plano | Preço | Workspaces | Contas Cloud |
|-------|-------|-----------|-------------|
| **Free** | R$ 0/mês | 2 | 3 |
| **Pro** | R$ 497/mês | 10 | 20 |
| **Enterprise** | R$ 2.497/mês | Ilimitados | Ilimitadas |

Enterprise: base inclui 5 orgs gerenciadas + R$397/org extra.

---

## Feature Gating por Plano

### Backend
```python
# api/finops.py — exemplo
plan = _get_org_plan(db, member.organization_id)
if plan == "free":
    raise HTTPException(403, "Recurso disponível apenas no plano Pro ou superior.")
```

```python
# plan_service.py
PLAN_LIMITS = {
    "free":       {"workspaces": 2, "cloud_accounts": 3, "budgets": 0},
    "pro":        {"workspaces": 10, "cloud_accounts": 20, "budgets": 5},
    "enterprise": {"workspaces": -1, "cloud_accounts": -1, "budgets": -1},
}
```

### Frontend
```jsx
// PlanGate.jsx — bloqueia toda a página
<PlanGate requiredPlan="pro">
  <SchedulesPage />
</PlanGate>

// PlanGate inline — bloqueia trecho dentro da página
<PlanGate requiredPlan="pro" inline>
  <BudgetsSection />
</PlanGate>
```

Queries desabilitadas para usuários Free (evita crash 403):
```jsx
const budgetsQ = useQuery({
  enabled: isPro,  // false para Free → não dispara a query
})
```

---

## Billing — AbacatePay

### Fluxo de pagamento (PIX)

```
1. Usuário clica "Assinar Pro" em /billing
2. POST /billing/checkout → payment_service.create_billing()
   → cria registro payments (status=pending)
   → retorna URL do checkout AbacatePay
3. Usuário paga via PIX no checkout AbacatePay
4. AbacatePay chama POST /billing/webhook (confirmação)
5. billing.py verifica assinatura + atualiza payments.status=paid
   → org.plan_tier = plan_tier do pagamento (transação atômica)
6. Frontend polling GET /billing/verify/{billing_id}
   → quando status=paid → redireciona para /billing/success
```

### Rate limiting
`POST /billing/checkout` limitado a **5 requisições/minuto** por IP (slowapi).

---

## MSP — Enterprise Master/Partner

### Hierarquia

```
Organization (org_type=master, plan_tier=enterprise)
  ├── Managed Org 1 (org_type=partner, parent_org_id=master.id)
  │     └── Workspaces + Cloud Accounts da Org 1
  ├── Managed Org 2 (org_type=partner, parent_org_id=master.id)
  └── ...
```

### Endpoints MSP

| Ação | Endpoint |
|------|---------|
| Listar orgs parceiras | `GET /orgs/{slug}/managed-orgs` |
| Resumo agregado | `GET /orgs/{slug}/managed-orgs/summary` |
| Criar org parceira | `POST /orgs/{slug}/managed-orgs` |
| Desvincular parceira | `DELETE /orgs/{slug}/managed-orgs/{partner_slug}` |

### Limite de orgs gerenciadas

```python
# plan_service.py
def check_managed_org_limit(db, org):
    if org.plan_tier != "enterprise":
        raise HTTPException(403, "Requer Enterprise")
    count = db.query(Organization).filter(parent_org_id=org.id).count()
    if count >= MAX_FREE_ORGS:
        # calcula custo adicional
```

Preço: 5 orgs base no Enterprise. Cada org extra: R$397/mês.

### OrgWorkspaceContext (frontend)
- `isMasterOrg`: `org.org_type === 'master'`
- `isPartnerOrg`: `org.org_type === 'partner'`
- `switchOrg(slug)`: troca org ativa; se slug não encontrado, recarrega lista
- Sidebar mostra "Orgs Gerenciadas" apenas para `isMasterOrg && isEnterprise`

### ManagedOrgsPage
- Cards por org parceira com: nome, slug, workspaces, status M365
- Tab **Tenants M365**: tabela com overview de cada tenant (usuários, licenças, equipes, conexão)
- "Acessar" → `switchOrg(slug)` + `navigate('/m365')`

---

## Admin Panel da Plataforma

Acesso exclusivo para `User.is_admin = true`.

**Ativar admin:**
```sql
UPDATE users SET is_admin = true WHERE email = 'admin@cloudatlas.app.br';
```

### Funcionalidades (`/admin`)

**Tab Leads:**
- Listar solicitações Enterprise (via formulário em `/plan-selection`)
- Filtrar por status: `new` | `contacted` | `converted` | `lost`
- Expandir linha: ver phone, mensagem completa
- Alterar status via dropdown

**Tab Orgs:**
- Busca por nome/slug
- Ver plano atual de qualquer org
- Alterar plano sem pagamento (bypass para operações manuais)

### EnterpriseLead — fluxo
```
1. Usuário na PlanSelection clica "Falar com Vendas" no card Enterprise
2. SalesModal exibe formulário (nome, empresa, telefone, mensagem)
3. POST /admin/leads → cria EnterpriseLead (status=new)
4. Card mostra estado verde de confirmação
5. Admin visualiza em /admin → Tab Leads → altera status conforme progresso
```

---

## Preços — Constantes (plan_service.py)

```python
PLAN_PRICES = {
    "pro":       49_700,   # R$ 497,00
    "enterprise": 249_700,  # R$ 2.497,00 base
}

ENTERPRISE_EXTRA_ORG_PRICE = 39_700   # R$ 397,00 por org extra
ENTERPRISE_BASE_ORGS = 5              # orgs inclusas no base
```

Todos os valores em **centavos** (AbacatePay aceita centavos).
