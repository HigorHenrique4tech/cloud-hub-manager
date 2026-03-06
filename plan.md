# 📋 Plano Completo — Melhorias de Frontend & UX/UI (v2)

> **Projeto:** CloudAtlas (cloud-hub-manager)
> **Data:** 06/03/2026  
> **Atualização:** v2 — Refletindo progresso atual + novo bug FinOps Widget

---

## 📊 Status Geral do Progresso

| Fase | Descrição | Status |
|------|-----------|--------|
| **Fase 1** | Design System & CSS | ✅ Concluída |
| **Fase 2a** | Refatoração FinOps.jsx | ✅ Concluída (1684→500 linhas) |
| **Fase 3** | Empty States, Loading & Skeleton Screens | ✅ Concluída |
| **Fase 4** | Micro-Interações & Animações | ✅ Concluída |
| **Fase 6a** | Custom Hooks (FinOps) | ✅ Concluída (12 hooks) |
| **Backend** | Bloqueio de Event Loop | ✅ Concluída (`asyncio.to_thread`) |
| **🔴 BUG** | FinOps Widget no Dashboard zerado | ✅ Concluída |
| **Fase 2b** | Refatoração costs/Webhooks/Settings | ✅ Concluída |
| **Fase 5** | Acessibilidade & Responsividade | ❌ Pendente |
| **Fase 7** | Testes de Frontend | ❌ Pendente |
| **Backend** | Security Scan sem `await _run()` | ❌ Pendente |

---

## 🔴 BUG CRÍTICO — FinOps Widget no Dashboard Zerado

### Descrição
O widget "Resumo FinOps" no **Dashboard** mostra todos os valores como `—` (travessão) e `0`, mesmo quando a página FinOps tem dados reais.

### Causa Raiz

**Desalinhamento de nomes de campos** entre o que o backend retorna e o que o `FinOpsWidget.jsx` espera.

O backend (`GET /finops/summary`) retorna:
```json
{
  "potential_saving_monthly": 120.50,
  "realized_saving_30d": 45.00,
  "open_anomalies": 2,
  "recommendations": {
    "pending": 5,
    "applied": 3,
    "dismissed": 1,
    "total": 9
  }
}
```

Mas o `FinOpsWidget.jsx` lê:
```js
data?.potential_savings_monthly   // ❌ "savings" (com 's') — campo não existe!
data?.realized_savings_30d        // ❌ "savings" (com 's') — campo não existe!
data?.pending_recommendations     // ❌ campo plano — backend retorna recommendations.pending
data?.open_anomalies              // ✅ este funciona
```

> **Nota:** O componente `WasteSummary.jsx` (usado na página FinOps) usa os nomes **corretos** (`potential_saving_monthly`, `realized_saving_30d`), por isso a página FinOps funciona corretamente.

### Correção Necessária

**Arquivo:** `frontend/src/components/dashboard/widgets/FinOpsWidget.jsx`

```diff
- {fmtUSD(data?.potential_savings_monthly)}
+ {fmtUSD(data?.potential_saving_monthly)}

- {data?.pending_recommendations ?? 0}
+ {data?.recommendations?.pending ?? 0}

- {fmtUSD(data?.realized_savings_30d)}
+ {fmtUSD(data?.realized_saving_30d)}
```

Linhas afetadas: **77, 87, 109** do `FinOpsWidget.jsx`.

---

## ✅ O Que Já Foi Concluído

### Fase 1 — Design System ✅
- `tailwind.config.js`: fontFamily (`Inter`), 5 animações, keyframes, boxShadows premium
- `index.css`: ~130 linhas com `.card-interactive`, `.modal-overlay`, `.modal-content`, `.table-row-hover`, `.skeleton`, `.focus-ring`, `.badge-live`, `.toast`

### Fase 2a — FinOps Refatoração ✅
- `FinOps.jsx`: de **1.684** para **500 linhas**
- Novos componentes criados: `BudgetModal`, `ScanScheduleModal`, `ReportScheduleModal`, `RecommendationsTab`, `BudgetsTab`, `ReportsTab`, `AnomaliesTab`, `ActionsHistoryTab`, `CostTrendChart`
- `components/finops/` expandiu de **5** para **14** arquivos

### Fase 3 — Empty States & Skeletons ✅
- `EmptyState.jsx`: gradiente no ícone, animação fadeIn, secondaryAction
- `LoadingSpinner.jsx`: 3 variantes (spinner, dots, bar) com dark mode
- `SkeletonLoader.jsx`: 4 variantes (Card, Table, Chart, Text)
- `ErrorBoundary.jsx`: novo componente para captura de erros

### Fase 4 — Micro-Interações ✅
- Cards com `card-interactive` (hover translate + shadow)
- Botões com `active:scale-[0.97]`
- Modais com `animate-fade-in` + `animate-scale-in`
- Tabelas com `table-row-hover`

### Fase 6a — Custom Hooks ✅
12 hooks criados:
`useFinOpsBudgets`, `useFinOpsScans`, `useFinOpsReports`, `useCosts`, `useWebhooks`, `useWorkspaceSettings`, `useAdminPanel`, `useClipboard`, `useModal`, `useDebounce` + 2 existentes

### Backend — Event Loop ✅
- `aws.py`: Helper `_run()` usando `asyncio.to_thread()` em **todos** os endpoints
- `database.py`: Síncrono mas aceito (FastAPI auto-offload em `def`)

---

## ❌ O Que Falta Fazer

### 🔴 P0 — Fazer Imediatamente

#### 1. Corrigir FinOps Widget (Bug)
- **Arquivo:** `frontend/src/components/dashboard/widgets/FinOpsWidget.jsx`
- Corrigir 3 field names desalinhados (detalhes acima)
- **Tempo:** ~5 minutos

#### 2. Backend: Security Scan sem `await _run()`
- **Arquivo:** `backend/app/api/aws.py` (linha ~589)
- `scanner.scan_all()` é chamado sincronamente dentro de `async def` — bloqueia o event loop
- Corrigir para: `await _run(scanner.scan_all)`
- **Tempo:** ~5 minutos

---

### 🟡 P1 — Refatorações de Componentes Restantes

#### 3. `costs.jsx` (549 linhas → ~6 arquivos)

```
components/costs/        (nova pasta)
├── MetricCard.jsx
├── AlertModal.jsx
├── CostCharts.jsx
├── CostTable.jsx
└── CostExport.jsx

hooks/useCosts.js        (já criado ✅, pode ser expandido)
```

#### 4. `WorkspaceSettings.jsx` (525 linhas → ~5 arquivos)

```
components/workspace/    (nova pasta)
├── CloudAccountsSection.jsx
├── WorkspaceGeneralSection.jsx
├── WorkspaceMembersSection.jsx
├── WorkspaceDangerZone.jsx
└── GcpJsonImporter.jsx

hooks/useWorkspaceSettings.js (já criado ✅)
```

#### 5. `Webhooks.jsx` (549 linhas → ~5 arquivos)

```
components/webhooks/     (nova pasta)
├── WebhookModal.jsx
├── SecretBanner.jsx
├── DeliveryHistory.jsx
├── WebhookCard.jsx
└── CopyButton.jsx → common/

hooks/useWebhooks.js     (já criado ✅)
```

#### 6. `CostReportModal.jsx` (27KB — componente grande)
- Dividir em sub-componentes: `ReportFilters`, `ReportPreview`, `ReportActions`

---

### 🟢 P2 — Melhorias Contínuas

#### 7. Acessibilidade (a11y)
- [ ] `role="dialog"` + `aria-modal="true"` em modais
- [ ] Focus trap nas modais
- [ ] `aria-label` em botões de ícone
- [ ] `aria-live="polite"` em toasts/notificações
- [ ] Melhorar contraste de badges no dark mode
- [ ] Skip-to-content link no Layout
- [ ] Navegação de sidebar por teclado

#### 8. Responsividade
- [ ] Sidebar colapsável em telas < 1024px
- [ ] Dashboard em grid responsivo
- [ ] Tabelas com scroll horizontal em mobile
- [ ] Header com menu hambúrguer

#### 9. Testes de Frontend
- Estado atual: apenas 2 arquivos de teste (`RecommendationCard.test.jsx`, `ResourceMetricsPanel.test.jsx`)
- Testes prioritários após refatorações:
  - `FinOpsWidget.test.jsx` — Garantir que field names estão corretos
  - `EmptyState.test.jsx` — Variantes de renderização
  - `SkeletonLoader.test.jsx` — Variantes skeleton
  - `useFinOpsBudgets.test.js` — Queries e mutations

---

## Priorização Atualizada

| Prioridade | Item | Esforço | Impacto |
|-----------|------|---------|---------|
| 🔴 P0 | Bug FinOps Widget | 5 min | Alto — dados zerados no dashboard |
| 🔴 P0 | Security Scan sync | 5 min | Médio — bloqueia event loop |
| 🟡 P1 | Refatorar `costs.jsx` | 2-3h | Médio — manutenibilidade |
| 🟡 P1 | Refatorar `WorkspaceSettings.jsx` | 2-3h | Médio |
| 🟡 P1 | Refatorar `Webhooks.jsx` | 2-3h | Médio |
| 🟡 P1 | Dividir `CostReportModal.jsx` | 1-2h | Baixo-Médio |
| 🟢 P2 | Acessibilidade completa | 1-2 dias | Médio |
| 🟢 P2 | Responsividade mobile | 1-2 dias | Médio |
| 🟢 P2 | Testes de frontend | 2-3 dias | Alto (longo prazo) |

---

> **Nota:** Este plano é a versão atualizada (v2) refletindo todo o progresso já realizado.
> Os itens P0 podem ser corrigidos imediatamente com mudanças de poucas linhas.
