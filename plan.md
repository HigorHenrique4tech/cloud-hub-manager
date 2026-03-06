# 📋 Plano Completo — Melhorias de Frontend & UX/UI (v3)

> **Projeto:** CloudAtlas (cloud-hub-manager)
> **Data:** 06/03/2026  
> **Atualização:** v3 — Auditoria completa de modo claro + melhorias estéticas

---

## 📊 Status Geral do Progresso

| Fase | Descrição | Status |
|------|-----------|--------|
| **Fase 1** | Design System & CSS | ✅ Concluída |
| **Fase 2a** | Refatoração FinOps.jsx | ✅ Concluída (1684→500 linhas) |
| **Fase 2b** | Refatoração costs/Webhooks/Settings | ✅ Concluída |
| **Fase 3** | Empty States, Loading & Skeleton Screens | ✅ Concluída |
| **Fase 4** | Micro-Interações & Animações | ✅ Concluída |
| **Fase 6a** | Custom Hooks (FinOps) | ✅ Concluída (12 hooks) |
| **Backend** | Bloqueio de Event Loop | ✅ Concluída (`asyncio.to_thread`) |
| **🔴 BUG** | FinOps Widget no Dashboard zerado | ✅ Concluída |
| **🔴 NOVO** | Modo Claro — texto ilegível em Agendamentos | ✅ Concluída |
| **🔴 NOVO** | Modo Claro — modais FinOps dark-only | ✅ Concluída |
| **🟡 NOVO** | Melhorias estéticas gerais | ✅ Concluída |
| **Fase 5** | Acessibilidade & Responsividade | ❌ Pendente |
| **Fase 7** | Testes de Frontend | ❌ Pendente |
| **Backend** | Security Scan sem `await _run()` | ❌ Pendente |

---

## 🔴 Auditoria Modo Claro — Problemas Encontrados

### Resultado da Auditoria

| Página/Componente | Modo Claro | Problema |
|-------------------|:----------:|----------|
| Sidebar, Header, Layout | ✅ OK | Usa `dark:` corretamente |
| Dashboard | ✅ OK | Texto e cards legíveis |
| Costs | ✅ OK | Todas as variantes com `dark:` |
| Webhooks | ✅ OK | Padrão correto |
| Onboarding | ✅ OK | `text-gray-900 dark:text-slate-100` |
| AnomaliesTab | ✅ OK | Componente exemplar |
| **Schedules.jsx** | ❌ CRÍTICO | `text-slate-100` (branco em fundo branco!) |
| **ScheduleCard.jsx** | ❌ CRÍTICO | Badges com `text-orange-300` (ilegível) |
| **BudgetModal** | ❌ MAJOR | `bg-slate-900` fixo (modal todo escuro) |
| **ScanScheduleModal** | ❌ MAJOR | Mesmo problema do BudgetModal |
| **ReportScheduleModal** | ❌ MAJOR | Mesmo padrão |
| **ScheduleFormModal** | ❌ MAJOR | Mesmo padrão |
| **SchedulesWidget** (plan gate) | ⚠️ MINOR | `text-indigo-300` sem variante light |
| **FinOpsWidget** (plan gate) | ⚠️ MINOR | Mesma issue |
| **FinOps.jsx** (toasts de scan) | ⚠️ MINOR | Status banners dark-only |
| PlanSelection | ✅ OK | Dark intencional (landing page) |
| VerifyEmail/Callback | ✅ OK | Dark intencional (auth flow) |

---

### 🔴 Tier 1 — Correção Crítica (Agendamentos)

**Arquivos:** `Schedules.jsx`, `ScheduleCard.jsx`

#### Schedules.jsx — 7 correções
| Linha | De | Para |
|-------|------|------|
| 44 | `text-slate-100` | `text-gray-900 dark:text-slate-100` |
| 45 | `text-slate-400` | `text-gray-500 dark:text-slate-400` |
| 79 | `border-red-700/40 bg-red-900/20 text-red-300` | + variantes light |
| 85 | `border-slate-700 bg-slate-900/40` | + variantes light |
| 87-90 | `text-slate-300`, `text-slate-500` | + variantes light |
| 106 | `text-orange-400` | `text-orange-600 dark:text-orange-400` |
| 121 | `text-sky-400` | `text-sky-600 dark:text-sky-400` |

#### ScheduleCard.jsx — 4 correções
| Constante | De | Para |
|-----------|------|------|
| `PROVIDER_BADGE.aws` | `text-orange-300` | `text-orange-700 dark:text-orange-300` |
| `PROVIDER_BADGE.azure` | `text-sky-300` | `text-sky-700 dark:text-sky-300` |
| `ACTION_STYLES.start` | `text-green-300` | `text-green-700 dark:text-green-300` |
| `ACTION_STYLES.stop` | `text-red-300` | `text-red-700 dark:text-red-300` |
| L103 (Next run) | `text-gray-300` | `text-gray-500 dark:text-slate-500` |

---

### 🔴 Tier 2 — Modais FinOps Dark-Only

**Arquivos:** `BudgetModal.jsx`, `ScanScheduleModal.jsx`, `ReportScheduleModal.jsx`, `ScheduleFormModal.jsx`

Todos os 4 modais usam o mesmo padrão problemático:

| Elemento | Atual (dark-only) | Corrigido |
|----------|-------------------|-----------|
| Container | `bg-slate-900 border-slate-700` | `bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700` |
| Header border | `border-slate-700` | `border-gray-200 dark:border-slate-700` |
| Título | `text-slate-100` | `text-gray-900 dark:text-slate-100` |
| Labels | `text-slate-400` | `text-gray-600 dark:text-slate-400` |
| Inputs | `bg-slate-800 border-slate-700 text-slate-100` | `bg-white border-gray-300 text-gray-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100` |
| Botão cancelar | `border-slate-600 text-slate-300` | `border-gray-300 text-gray-600 dark:border-slate-600 dark:text-slate-300` |
| Botão fechar (X) | `text-slate-400 hover:text-white` | `text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white` |

---

### ⚠️ Tier 3 — Widgets e Toasts

**Arquivos:** `SchedulesWidget.jsx`, `FinOpsWidget.jsx`, `FinOps.jsx`, `AnomaliesTab.jsx`

- Seções "Recurso Pro" nos widgets usam `bg-indigo-900/20 text-indigo-300` → adicionar variantes light (`bg-indigo-50 text-indigo-700`)
- Toasts de status de scan (queued/running/done/error) usam `bg-*-900/20 text-*-300` → adicionar variantes light
- AnomaliesTab toasts (L92, L101): mesma correção

---

## 🟡 Melhorias Estéticas Sugeridas

| # | Melhoria | Impacto |
|---|----------|---------|
| 1 | **Borda lateral colorida nos ScheduleCards** — verde (start) / vermelho (stop), como GitHub issues | Visual premium |
| 2 | **Plan gate cards consistentes** — usar gradiente sutil indigo/purple ao invés de cor sólida dark | Coerência visual |
| 3 | **Padronizar backdrop de modais** — usar `.modal-overlay` (`bg-black/50 backdrop-blur-sm`) em todos | Consistência |
| 4 | **Toasts de scan com variantes light** — `bg-blue-50`, `bg-green-50` para modo claro | Legibilidade |
| 5 | **Badges com contraste WCAG AA** — `*-700` no light, `*-300` no dark | Acessibilidade |

---

## ✅ O Que Já Foi Concluído (resumo)

- **Fase 1:** Design System com Inter font, 5 animações, keyframes, boxShadows premium
- **Fase 2a:** FinOps.jsx de 1.684→500 linhas, 14 componentes extraídos
- **Fase 2b:** Refatoração de costs, Webhooks, Settings
- **Fase 3:** EmptyState, LoadingSpinner (3 variantes), SkeletonLoader (4 variantes), ErrorBoundary
- **Fase 4:** `card-interactive`, `active:scale-[0.97]`, `modal-overlay`, `table-row-hover`
- **Fase 6a:** 12 custom hooks criados
- **Backend:** `asyncio.to_thread()` em todos os endpoints AWS
- **Bug FinOps Widget:** Corrigido (field name mismatch)

---

## ❌ Pendentes (não relacionados a modo claro)

### Backend: Security Scan sem `await _run()`
- **Arquivo:** `backend/app/api/aws.py` (linha ~589)
- `scanner.scan_all()` chamado sincronamente — bloqueia event loop
- **Tempo:** ~5 min

### Fase 5: Acessibilidade & Responsividade
- [ ] `role="dialog"` + `aria-modal="true"` em modais
- [ ] Focus trap nas modais
- [ ] Sidebar colapsável em mobile (< 1024px)
- [ ] Dashboard em grid responsivo
- [ ] Skip-to-content link

### Fase 7: Testes de Frontend
- Apenas 2 arquivos de teste existentes
- Prioridade: `FinOpsWidget.test.jsx`, `EmptyState.test.jsx`, `SkeletonLoader.test.jsx`

---

## Priorização Atualizada

| Prioridade | Item | Esforço | Impacto |
|-----------|------|---------|---------|
| 🔴 P0 | Modo Claro — Agendamentos (Tier 1) | 15 min | Alto — reportado pelo usuário |
| 🔴 P0 | Modo Claro — Modais FinOps (Tier 2) | 30 min | Alto — 4 modais afetados |
| 🟡 P1 | Modo Claro — Widgets/Toasts (Tier 3) | 15 min | Médio |
| 🟡 P1 | Melhorias estéticas (5 itens) | 30 min | Médio-Alto |
| 🟡 P1 | Security Scan sync | 5 min | Médio |
| 🟢 P2 | Acessibilidade completa | 1-2 dias | Médio |
| 🟢 P2 | Responsividade mobile | 1-2 dias | Médio |
| 🟢 P2 | Testes de frontend | 2-3 dias | Alto (longo prazo) |

---

> **Nota:** Este plano é a versão v3, incluindo a auditoria completa de modo claro realizada em 06/03/2026.
> Os itens P0 podem ser corrigidos em ~45 minutos com mudanças focadas nas classes Tailwind.
