# Plano Financeiro — CloudAtlas

> Documento de referência para pricing, limites, features e modelo de receita da plataforma.
> Gerado com base no código-fonte real em 2026-03-07.

---

## 1. Visão Geral dos Planos

| | **Free** | **Pro** | **Enterprise** |
|---|---|---|---|
| **Preço** | R$ 0/mês | R$ 497/mês | R$ 2.497/mês + add-ons |
| **Público-alvo** | Desenvolvedores, projetos pessoais | Equipes com necessidade de controle e automação | MSPs, empresas com múltiplas organizações |
| **Contratação** | Self-service (auto-ativação) | Self-service via AbacatePay (PIX) | Contato com vendas (modal de lead) |
| **Faturamento** | Gratuito | Mensal recorrente | Mensal (negociado com vendas) |

---

## 2. Limites por Plano

| Recurso | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Workspaces | 2 | 10 | 20 (+R$ 290/extra) |
| Contas Cloud | 3 | 20 | Ilimitado |
| Membros por organização | 3 | 20 | Ilimitado |
| Organizações gerenciadas (MSP) | 0 | 0 | Ilimitado (5 inclusas no base) |

> **Fonte:** `backend/app/services/plan_service.py` — constante `PLAN_LIMITS`.

---

## 3. Features por Plano

### 3.1 Infraestrutura e Provedores

| Feature | Free | Pro | Enterprise |
|---------|:----:|:---:|:----------:|
| Amazon Web Services (AWS) | ✓ | ✓ | ✓ |
| Microsoft Azure | ✓ | ✓ | ✓ |
| Google Cloud Platform (GCP) | ✓ | ✓ | ✓ |
| Microsoft 365 (M365) Admin | — | — | ✓ |
| Multi-workspace | ✓ | ✓ | ✓ |
| Multi-conta por provedor | ✓ | ✓ | ✓ |

### 3.2 Visibilidade e Monitoramento

| Feature | Free | Pro | Enterprise |
|---------|:----:|:---:|:----------:|
| Dashboard principal | ✓ | ✓ | ✓ |
| Dashboard customizável (drag-and-drop) | ✓ | ✓ | ✓ |
| Histórico de custos por provedor | ✓ | ✓ | ✓ |
| Alertas de custo | ✓ | ✓ | ✓ |
| Inventário de recursos (EC2, VMs, buckets…) | ✓ | ✓ | ✓ |
| Métricas de recursos em tempo real | ✓ | ✓ | ✓ |
| Logs de auditoria | — | ✓ | ✓ |

### 3.3 FinOps e Otimização

| Feature | Free | Pro | Enterprise |
|---------|:----:|:---:|:----------:|
| Ver recomendações de economia | ✓ (somente leitura) | ✓ | ✓ |
| Aplicar / dismissar recomendações | — | ✓ | ✓ |
| Detecção automática de anomalias de custo | — | ✓ | ✓ |
| Orçamentos (Budgets) com alertas de limites | — | ✓ | ✓ |
| Scan manual de FinOps | — | ✓ | ✓ |
| Agendamento automático de scans | — | ✓ | ✓ |
| Histórico de ações FinOps | — | ✓ | ✓ |

### 3.4 Automação e Agendamentos

| Feature | Free | Pro | Enterprise |
|---------|:----:|:---:|:----------:|
| Agendamento de recursos (ligar/desligar) | — | ✓ | ✓ |
| Policy Engine (políticas de automação) | — | ✓ | ✓ |
| Aprovações de ações críticas | — | ✓ | ✓ |
| Webhooks (notificações externas HMAC-SHA256) | — | ✓ | ✓ |
| Resource Templates | — | ✓ | ✓ |

### 3.5 Relatórios

| Feature | Free | Pro | Enterprise |
|---------|:----:|:---:|:----------:|
| Relatórios automáticos por e-mail (FinOps) | — | ✓ | ✓ |
| Relatório Executivo PDF mensal | ✓ | ✓ | ✓ |
| Relatório com gráfico de evolução de custos | ✓ | ✓ | ✓ |
| Relatório com comparação mês-a-mês (delta %) | ✓ | ✓ | ✓ |
| Relatório com seção de inventário | ✓ | ✓ | ✓ |
| E-mail HTML rico com KPIs inline | ✓ | ✓ | ✓ |
| Retry de relatórios com falha | ✓ | ✓ | ✓ |
| Download de PDF | ✓ | ✓ | ✓ |

### 3.6 Segurança e Acesso

| Feature | Free | Pro | Enterprise |
|---------|:----:|:---:|:----------:|
| MFA — OTP por e-mail | ✓ | ✓ | ✓ |
| MFA — TOTP (Google Authenticator) | ✓ | ✓ | ✓ (planejado) |
| RBAC (controle de acesso por role) | ✓ | ✓ | ✓ |
| SSO Google / GitHub | ✓ | ✓ | ✓ |
| Scan de segurança por provedor | ✓ | ✓ | ✓ |
| Credenciais criptografadas (Fernet) | ✓ | ✓ | ✓ |

### 3.7 Microsoft 365 (Enterprise only)

| Feature | Enterprise |
|---------|:----------:|
| Gestão de usuários M365 | ✓ |
| Gestão de licenças M365 | ✓ |
| Wizard de criação de usuário (multi-step) | ✓ |
| SharePoint — sites e bibliotecas | ✓ |
| Exchange — caixas de correio, auto-reply | ✓ |
| Exchange — caixas compartilhadas | ✓ |
| Exchange — listas de distribuição | ✓ |
| Teams Admin — times, canais, membros | ✓ |
| Auditoria M365 | ✓ |
| Relatório de atividade (D30) | ✓ |

### 3.8 MSP / Orgs Gerenciadas (Enterprise only)

| Feature | Enterprise |
|---------|:----------:|
| Modo MSP (org master gerencia orgs filhas) | ✓ |
| 5 organizações parceiras inclusas no base | ✓ |
| Orgs adicionais (add-on) | R$ 397/org/mês |
| Painel de orgs gerenciadas | ✓ |
| Faturamento consolidado por org | ✓ |

### 3.9 Suporte

| Feature | Free | Pro | Enterprise |
|---------|:----:|:---:|:----------:|
| Portal de suporte (abertura de tickets) | ✓ | ✓ | ✓ |
| Mensagens em tempo real no ticket | ✓ | ✓ | ✓ |
| Picker de workspace no ticket | ✓ | ✓ | ✓ |
| Painel Helpdesk interno (staff) | — | — | — (acesso por role helpdesk) |
| Suporte dedicado / SLA | — | — | ✓ |

---

## 4. Roles e Permissões (RBAC)

Os roles são por organização e independentes do plano. Os planos determinam **o que existe**; os roles determinam **quem pode fazer o quê**.

| Role | Descrição | Restrições vs Owner |
|------|-----------|---------------------|
| **owner** | Controle total | Nenhuma |
| **admin** | Igual ao owner | Não pode deletar a organização |
| **operator** | Operações de nuvem e FinOps | Sem acesso a billing, sem permissão de deletar/recriar org |
| **viewer** | Somente leitura | Não pode criar/modificar nada |
| **billing** | Foco em custos e alertas | Sem acesso a recursos de nuvem |
| **helpdesk** | Gerenciamento de tickets de suporte | Acesso restrito apenas ao painel Helpdesk |

### Permissões Detalhadas por Role

| Permissão | Owner | Admin | Operator | Viewer | Billing | Helpdesk |
|-----------|:-----:|:-----:|:--------:|:------:|:-------:|:--------:|
| org.settings.view/edit | ✓ | ✓ | — | — | — | — |
| org.members.view/manage | ✓ | ✓ | — | — | — | — |
| org.delete | ✓ | — | — | — | — | — |
| workspace.create/edit/delete | ✓ | ✓ | — | — | — | — |
| accounts.view/create/delete | ✓ | ✓ | view | view | — | — |
| resources.view | ✓ | ✓ | ✓ | ✓ | — | — |
| resources.create/start_stop/manage | ✓ | ✓ | ✓ | — | — | — |
| resources.delete | ✓ | ✓ | — | — | — | — |
| costs.view | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| alerts.view/manage | ✓ | ✓ | view | view | ✓ | — |
| logs.view | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| finops.view | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| finops.recommend | ✓ | ✓ | ✓ | — | ✓ | — |
| finops.execute / finops.budget | ✓ | ✓ | — | — | — | — |
| templates.view/manage | ✓ | ✓ | ✓ | view | — | — |
| webhooks.view/manage | ✓ | ✓ | ✓ | view | — | — |
| m365.view/manage | ✓ | ✓ | ✓ | view | view | — |
| helpdesk.manage | ✓ | ✓ | — | — | — | ✓ |

---

## 5. Modelo de Receita

### 5.1 Preços

| Plano | Valor | Forma |
|-------|-------|-------|
| Free | R$ 0,00 | — |
| Pro | R$ 497,00/mês | PIX via AbacatePay (mensal recorrente) |
| Enterprise base | R$ 2.497,00/mês | Negociado com vendas |
| Enterprise add-on (org extra) | R$ 397,00/org/mês | Cobrado automaticamente |

> **Fonte:** `backend/app/services/plan_service.py` — constante `PLAN_PRICES`.

### 5.2 Add-ons (Enterprise)

| Add-on | Valor | Detalhe |
|--------|-------|---------|
| Organização parceira adicional | R$ 397,00/org/mês | As primeiras 5 orgs estão inclusas no base |

**Cálculo de faturamento Enterprise com add-ons:**
```
Total = R$ 2.497 + (orgs_extras × R$ 397)

Exemplo: 8 orgs parceiras
= R$ 2.497 + (3 × R$ 397)
= R$ 2.497 + R$ 1.191
= R$ 3.688/mês
```

### 5.3 Gateway de Pagamento

- **Provider:** AbacatePay
- **Método:** PIX (links de pagamento)
- **Webhook:** `POST /billing/webhook` com header `X-AbacatePay-Token` (segredo compartilhado)
- **Fluxo:**
  1. Usuário clica "Assinar Pro" → backend cria cobrança no AbacatePay → redireciona para URL de pagamento
  2. Usuário paga via PIX → AbacatePay envia webhook → backend ativa o plano
  3. Fallback dev: sem AbacatePay configurado → redirect direto para `/billing/success?payment_id=...`

### 5.4 Ciclo de Vida do Pagamento

```
PENDING → PAID      (plano ativado automaticamente)
PENDING → EXPIRED   (PIX expirou, sem ação)
PENDING → CANCELLED (cancelado pelo usuário)
PAID    → REFUNDED  (reembolso manual)
```

---

## 6. Projeções de Receita

### Cenário Conservador

| Clientes | Mix | MRR |
|----------|-----|-----|
| 100 Free | 0% | R$ 0 |
| 20 Pro | — | R$ 9.940 |
| 3 Enterprise | base | R$ 7.491 |
| — | 2 orgs extras/cliente | R$ 2.382 |
| **Total** | | **R$ 19.813/mês** |

### Cenário Moderado

| Clientes | Mix | MRR |
|----------|-----|-----|
| 500 Free | 0% | R$ 0 |
| 80 Pro | — | R$ 39.760 |
| 10 Enterprise | base | R$ 24.970 |
| — | 3 orgs extras/cliente médio | R$ 11.910 |
| **Total** | | **R$ 76.640/mês** |

### Cenário Otimista

| Clientes | Mix | MRR |
|----------|-----|-----|
| 2.000 Free | 0% | R$ 0 |
| 300 Pro | — | R$ 149.100 |
| 0 Enterprise | base | R$ 74.910 |
| — | 5 orgs extras/cliente médio | R$ 59.550 |
| **Total** | | **R$ 283.560/mês** |

> As projeções assumem conversão Free→Pro de ~6% e não incluem custos operacionais (infra, suporte, etc.).

---

## 7. Custos Operacionais Estimados

| Item | Custo estimado |
|------|----------------|
| Infraestrutura (Docker / VPS) | R$ 300–800/mês |
| SendGrid (email) | R$ 0–200/mês (free tier até 100/dia) |
| AbacatePay (taxa) | ~1,5% por transação PIX |
| Domínio + SSL | R$ 50/ano |
| Backup de banco de dados | R$ 50–150/mês |

---

## 8. Conversão e Upgrade Flow

```
Registro → Onboarding (4 steps) → Escolha de Plano
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                  Free             Pro          Enterprise
              (auto-ativo)    (AbacatePay)    (Form de lead
                                  PIX)        → vendas em 24h)
```

- O downgrade para **Free** é feito pelo admin via painel ou admin interno.
- O upgrade para **Enterprise** abre o `SalesModal` (formulário de contato) → lead salvo na tabela `EnterpriseLead` → equipe entra em contato em até 24h.
- Upgrades e downgrades são refletidos imediatamente no `org.plan_tier`.

---

## 9. Controle de Limites no Backend

Os limites são verificados **no momento da operação** (não em background):

| Operação | Verificação |
|----------|-------------|
| Criar workspace | `check_workspace_limit()` — retorna 403 se atingiu |
| Adicionar conta cloud | `check_account_limit()` — retorna 403 se atingiu |
| Convidar membro | `check_member_limit()` — retorna 403 se atingiu |
| Adicionar org gerenciada | `check_managed_org_limit()` — retorna 403 se atingiu |

O frontend exibe barras de uso na página `/billing` com aviso visual quando uso ≥ 80% do limite.

---

## 10. Estratégia de Preço — Justificativa

| Fator | Decisão | Motivo |
|-------|---------|--------|
| Free generoso (2 WS, 3 contas) | Aquisição orgânica, low-friction onboarding | Reduz CAC |
| Pro R$ 497 | Preço único, sem variáveis de uso | Previsibilidade para o cliente |
| Enterprise base R$ 2.497 | Cobre infra + suporte dedicado | Margens maiores em contas estratégicas |
| Add-on por org R$ 397 | Monetização escalável para MSPs | Receita cresce com o negócio do cliente |
| PIX como gateway | AbacatePay, sem cartão | Menor atrito no Brasil |
| Planos fixos (não por usuário/recurso) | Simplicidade | Clientes não "contam" uso |

---

## 11. Roadmap de Pricing (Sugestões)

| Iniciativa | Impacto | Esforço |
|------------|---------|---------|
| Trial Pro 14 dias | Aumenta conversão Free→Pro | Baixo |
| Plano Anual com desconto (ex: 2 meses grátis) | Reduz churn, melhora fluxo de caixa | Médio |
| Add-on: usuários M365 adicionais (Enterprise) | Monetiza clientes M365 com muitos usuários | Médio |
| Plano Starter (R$ 197/mês, 1 workspace, 5 contas) | Endereça gap entre Free e Pro | Médio |
| Cobrança proporcional (pro-rata) no upgrade | Fairness percebida | Alto |
| Modelo freemium com limites de API calls | Monetização por uso para grandes volumes | Alto |

---

## Referências Técnicas

| Arquivo | Papel |
|---------|-------|
| `backend/app/services/plan_service.py` | `PLAN_LIMITS`, `PLAN_PRICES`, funções de verificação de limite |
| `backend/app/api/billing.py` | Endpoints: checkout, verify, history, webhook AbacatePay |
| `backend/app/services/payment_service.py` | Integração AbacatePay (criar cobrança, verificar status) |
| `frontend/src/pages/PlanSelection.jsx` | Tela de escolha de plano, cards, `SalesModal` para Enterprise |
| `frontend/src/pages/Billing.jsx` | Tela de faturamento: plano atual, barras de uso, histórico |
| `frontend/src/components/common/PlanGate.jsx` | Componente de gate por plano (bloqueia UI com lock + CTA) |
| `backend/app/core/permissions.py` | `ROLE_PERMISSIONS`, `VALID_ROLES` |
