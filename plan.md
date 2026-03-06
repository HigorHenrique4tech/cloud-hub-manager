# 📋 Plano Completo — Melhorias de Frontend & UX/UI

> **Projeto:** CloudAtlas (cloud-hub-manager)
> **Data:** 06/03/2026
> **Base:** Avaliação realizada na conversa anterior (`project_evaluation.md`)

---

## 📑 Índice

1. [Visão Geral](#1-visão-geral)
2. [Fase 1 — Design System & Fundações CSS](#2-fase-1--design-system--fundações-css)
3. [Fase 2 — Refatoração de Componentes Monolíticos](#3-fase-2--refatoração-de-componentes-monolíticos)
4. [Fase 3 — Empty States, Loading & Skeleton Screens](#4-fase-3--empty-states-loading--skeleton-screens)
5. [Fase 4 — Micro-Interações & Animações Premium](#5-fase-4--micro-interações--animações-premium)
6. [Fase 5 — Acessibilidade & Responsividade](#6-fase-5--acessibilidade--responsividade)
7. [Fase 6 — Custom Hooks & Separação de Lógica](#7-fase-6--custom-hooks--separação-de-lógica)
8. [Fase 7 — Testes de Frontend](#8-fase-7--testes-de-frontend)
9. [Cronograma Sugerido](#9-cronograma-sugerido)
10. [Priorização Final](#10-priorização-final)

---

## 1. Visão Geral

### Problemas Identificados

| Categoria | Problema | Impacto |
|-----------|----------|---------|
| **Arquitetura** | Componentes monolíticos (ex: `FinOps.jsx` com **1.684 linhas**) | Manutenção difícil, re-renders desnecessários, bugs difíceis de localizar |
| **Design System** | `index.css` possui apenas ~75 linhas, sem tokens de animação ou utilitários avançados | Inconsistência visual entre páginas |
| **UX - Empty States** | Tabelas vazias mostram apenas texto simples sem CTAs | Usuário não sabe o próximo passo |
| **UX - Loading** | `LoadingSpinner` básico (spinner genérico), sem skeleton screens | UI parece lenta e instável durante carregamento |
| **Visual** | Cards sem hover effects, sem transições suaves, sem micro-interações | Plataforma não transmite sensação "premium" |
| **Hooks** | Apenas 2 custom hooks (`useCreateResource`, `useFormValidation`) | Lógica de negócio acoplada à UI |
| **Acessibilidade** | Sem foco visível, sem atributos ARIA em modais/dropdowns | Não acessível via teclado ou screen readers |

### Arquivos Críticos (por tamanho)

| Arquivo | Linhas | Bytes | Status |
|---------|--------|-------|--------|
| `pages/FinOps.jsx` | 1.684 | 82 KB | 🔴 Crítico — necessita fragmentação urgente |
| `pages/costs.jsx` | 549 | 27 KB | 🟡 Grande — pode ser fragmentado |
| `pages/WorkspaceSettings.jsx` | 525 | 26 KB | 🟡 Grande — pode ser fragmentado |
| `pages/Webhooks.jsx` | 549 | 24 KB | 🟡 Grande — já possui sub-componentes mas tudo no mesmo arquivo |
| `pages/ManagedOrgsPage.jsx` | — | 21 KB | 🟡 Grande |
| `pages/AdminPanel.jsx` | 377 | 20 KB | 🟢 Aceitável, mas pode melhorar |
| `components/finops/CostReportModal.jsx` | — | 27 KB | 🟡 Grande para um componente |

---

## 2. Fase 1 — Design System & Fundações CSS

> **Objetivo:** Criar uma base sólida de tokens de design e utilitários reutilizáveis antes de tocar nos componentes.

### 2.1 Melhorar `tailwind.config.js`

**Arquivo:** `frontend/tailwind.config.js`

Adicionar:
- **Tipografia** — fontFamily customizada (Inter/Outfit via Google Fonts)
- **Animações** — keyframes para `fadeIn`, `slideUp`, `slideDown`, `scaleIn`, `pulse-soft`
- **Transições** — durations e easings customizados
- **Sombras** — sombras suaves para cards hover (`shadow-card-hover`)
- **Espaçamento** — tokens adicionais se necessário
- **Box Shadow com Cores** — Shadows coloridas para cards de status

```js
// Exemplo de extensão proposta
theme: {
  extend: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
    },
    animation: {
      'fade-in':    'fadeIn 0.3s ease-out',
      'slide-up':   'slideUp 0.3s ease-out',
      'slide-down': 'slideDown 0.2s ease-out',
      'scale-in':   'scaleIn 0.2s ease-out',
      'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
    },
    keyframes: {
      fadeIn:    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      slideUp:   { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      slideDown: { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      scaleIn:   { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.7' } },
    },
    boxShadow: {
      'card':       '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
      'card-hover': '0 10px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)',
      'modal':      '0 20px 60px rgba(0,0,0,0.15)',
    },
  },
},
```

### 2.2 Expandir `index.css`

**Arquivo:** `frontend/src/styles/index.css`

Adicionar novos utilitários:

```css
@layer components {
  /* ── Card Premium ──────────────────────────── */
  .card-interactive {
    @apply card transition-all duration-200 ease-out
           hover:-translate-y-0.5 hover:shadow-card-hover
           cursor-pointer;
  }

  /* ── Overlay de Modais ─────────────────────── */
  .modal-overlay {
    @apply fixed inset-0 z-50 flex items-center justify-center
           bg-black/40 backdrop-blur-sm animate-fade-in;
  }

  .modal-content {
    @apply bg-white dark:bg-gray-800 rounded-2xl shadow-modal
           w-full max-h-[90vh] overflow-y-auto animate-scale-in;
  }

  /* ── Tabela Premium ────────────────────────── */
  .table-row-hover {
    @apply transition-colors duration-150
           hover:bg-gray-50 dark:hover:bg-gray-800/50;
  }

  /* ── Skeleton Loading ──────────────────────── */
  .skeleton {
    @apply bg-gray-200 dark:bg-gray-700 rounded animate-pulse-soft;
  }

  /* ── Focus Ring Acessível ──────────────────── */
  .focus-ring {
    @apply focus:outline-none focus-visible:ring-2
           focus-visible:ring-primary/50 focus-visible:ring-offset-2
           dark:focus-visible:ring-offset-gray-900;
  }

  /* ── Badge com Dot Animado ─────────────────── */
  .badge-live {
    @apply badge relative;
  }
  .badge-live::before {
    content: '';
    @apply absolute -left-1 top-1/2 -translate-y-1/2
           w-2 h-2 rounded-full bg-green-500 animate-pulse-soft;
  }

  /* ── Toast / Notification ──────────────────── */
  .toast {
    @apply fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg
           text-sm font-medium animate-slide-up;
  }
}
```

### 2.3 Adicionar Fonte Inter

**Arquivo:** `frontend/index.html`

Adicionar no `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

## 3. Fase 2 — Refatoração de Componentes Monolíticos

> **Objetivo:** Quebrar arquivos grandes (> 300 linhas) em componentes menores, reutilizáveis e testáveis.

### 3.1 `FinOps.jsx` (1.684 linhas → ~15 arquivos)

Este é o caso mais crítico. A refatoração proposta:

```
src/
├── pages/
│   └── FinOps.jsx                          # Orquestrador (~100-150 linhas)
│
├── components/finops/
│   ├── BudgetModal.jsx                     # Extrair linhas 32-124
│   ├── ScanScheduleModal.jsx               # Extrair linhas 141-285
│   ├── ReportScheduleModal.jsx             # Extrair linhas 304-535
│   ├── FinOpsTabBar.jsx                    # Tabs de navegação (novo)
│   ├── FinOpsSummaryCards.jsx              # Cards de resumo de custos (novo)
│   ├── RecommendationsTab.jsx             # Tab de recomendações (novo)
│   ├── BudgetsTab.jsx                     # Tab de orçamentos (novo)
│   ├── ScanSchedulesTab.jsx               # Tab de scan schedules (novo)
│   ├── ReportsTab.jsx                     # Tab de relatórios (novo)
│   ├── AnomaliesTab.jsx                   # Tab de anomalias (novo)
│   ├── ActionsHistoryTab.jsx              # Tab de histórico (novo)
│   ├── (existentes já ok:)
│   │   ├── ActionTimeline.jsx             ✓ mantém
│   │   ├── CostReportModal.jsx            ✓ mantém (mas avaliar sub-divisão)
│   │   ├── RecommendationCard.jsx         ✓ mantém
│   │   └── WasteSummary.jsx               ✓ mantém
│
├── hooks/
│   └── useFinOps.js                        # Custom hook com TODOS os useQuery/useMutation
│   └── useFinOpsBudgets.js                 # Hook específico de budgets (novo)
│   └── useFinOpsScans.js                   # Hook específico de scan schedules (novo)
│   └── useFinOpsReports.js                 # Hook específico de reports (novo)
```

**Regras da refatoração:**
1. O `FinOps.jsx` final deve conter **apenas** o estado de tab ativo e renderizar o componente de tab correspondente.
2. Cada tab component recebe seus dados via custom hooks.
3. Modais ficam na pasta `components/finops/` e são importados pelo tab que os usa.
4. Constantes (`TIMEZONES`, `SCHED_TYPES`, `WEEK_DAYS`, etc.) vão para `utils/finops-constants.js`.
5. Funções utilitárias (`fmtUSD`) ficam em `utils/formatters.js`.

### 3.2 `costs.jsx` (549 linhas → ~6 arquivos)

```
src/
├── pages/
│   └── costs.jsx                           # Orquestrador (~80 linhas)
│
├── components/costs/                       # (nova pasta)
│   ├── MetricCard.jsx                      # Extrair componente MetricCard
│   ├── AlertModal.jsx                      # Extrair componente AlertModal
│   ├── CostCharts.jsx                      # Gráficos (LineChart, BarChart, PieChart)
│   ├── CostTable.jsx                       # Tabela de custos detalhados
│   └── CostExport.jsx                      # Lógica de exportação CSV/PDF
│
├── hooks/
│   └── useCosts.js                         # Custom hook com queries e mutations
```

### 3.3 `WorkspaceSettings.jsx` (525 linhas → ~5 arquivos)

```
src/
├── pages/
│   └── WorkspaceSettings.jsx               # Orquestrador (~80 linhas)
│
├── components/workspace/                   # (nova pasta)
│   ├── CloudAccountsSection.jsx            # Seção de contas cloud
│   ├── WorkspaceGeneralSection.jsx         # Configurações gerais
│   ├── WorkspaceMembersSection.jsx         # Gestão de membros
│   ├── WorkspaceDangerZone.jsx             # Zona de perigo (deletar workspace)
│   └── GcpJsonImporter.jsx                # Lógica de importação GCP JSON
│
├── hooks/
│   └── useWorkspaceSettings.js             # Custom hook
```

### 3.4 `Webhooks.jsx` (549 linhas → ~5 arquivos)

```
src/
├── pages/
│   └── Webhooks.jsx                        # Orquestrador (~100 linhas)
│
├── components/webhooks/                    # (nova pasta)
│   ├── WebhookModal.jsx                    # Extrair componente existente
│   ├── SecretBanner.jsx                    # Extrair componente existente
│   ├── DeliveryHistory.jsx                 # Extrair componente existente
│   ├── WebhookCard.jsx                     # Extrair componente existente
│   └── CopyButton.jsx                     # Extrair componente existente (genérico → mover para common/)
│
├── hooks/
│   └── useWebhooks.js                      # Custom hook
```

### 3.5 `AdminPanel.jsx` (377 linhas → ~3 arquivos)

```
src/
├── pages/
│   └── AdminPanel.jsx                      # Orquestrador (~60 linhas)
│
├── components/admin/                       # (nova pasta)
│   ├── LeadsTab.jsx                        # Extrair
│   └── OrgsTab.jsx                         # Extrair
│
├── hooks/
│   └── useAdminPanel.js                    # Custom hook
```

---

## 4. Fase 3 — Empty States, Loading & Skeleton Screens

> **Objetivo:** Melhorar a experiência do usuário em todos os estados da aplicação (vazio, carregando, erro).

### 4.1 Melhorar `EmptyState` existente

**Arquivo:** `components/common/emptystate.jsx`

Melhorias propostas:
- Adicionar **ilustração/ícone animado** em vez de ícone estático
- Gradiente sutil no fundo do ícone
- Animação `fade-in` ao aparecer
- Suporte a **secondary action** (link adicional além do botão primário)

```jsx
// Melhorias no EmptyState:
// 1. Background com gradiente sutil no ícone
// 2. Animação de fadeIn
// 3. secondaryAction prop
// 4. Tipografia melhorada
```

### 4.2 Criar `SkeletonLoader` avançado

**Arquivo:** `components/common/SkeletonLoader.jsx` (novo)

Variantes necessárias:
- `SkeletonCard` — para cards do dashboard
- `SkeletonTable` — já existe `SkeletonTable.jsx`, melhorar com colunas dinâmicas
- `SkeletonChart` — para gráficos do costs/finops
- `SkeletonText` — para linhas de texto genéricas

```jsx
// Exemplos de uso:
<SkeletonCard count={4} />       // 4 cards skeleton lado a lado
<SkeletonTable rows={5} cols={4} /> // Tabela 5x4 com skeleton
<SkeletonChart type="bar" />     // Gráfico skeleton
```

### 4.3 Melhorar `LoadingSpinner`

**Arquivo:** `components/common/loadingspinner.jsx`

- Adicionar variante de **progress bar linear** (para uploads/imports)
- Adicionar variante de **dot animation** (para estados de espera)
- Melhorar suporte a dark mode (atualmente `text-gray-600` sem dark)

### 4.4 Criar componente `ErrorBoundary`

**Arquivo:** `components/common/ErrorBoundary.jsx` (novo)

- Capturar erros de renderização do React
- Mostrar UI amigável com opção de "tentar novamente"
- Integrar com o sistema de logs

### 4.5 Onde aplicar Empty States (cada página)

| Página | Estado atual | Estado proposto |
|--------|-------------|-----------------|
| Dashboard | ✅ Já tem `EmptyWorkspaceState` | Melhorar visual com animação |
| FinOps (Recomendações) | ❌ Texto simples | CTA: "Rode seu primeiro scan FinOps" |
| FinOps (Budgets) | ❌ Texto simples | CTA: "Crie seu primeiro orçamento" |
| Costs | ❌ Sem empty state | CTA: "Conecte uma conta cloud para ver custos" |
| Webhooks | ❌ Sem empty state | CTA: "Crie seu primeiro webhook" |
| Logs | ❌ Sem empty state | Ícone + "Nenhum log encontrado para o período" |
| Inventory | ❌ Sem empty state | CTA: "Conecte AWS/Azure para ver inventário" |

---

## 5. Fase 4 — Micro-Interações & Animações Premium

> **Objetivo:** Fazer a plataforma transmitir uma sensação de produto premium.

### 5.1 Cards de Dashboard

**Arquivo:** `components/dashboard/statscard.jsx`

```diff
- <div className="card">
+ <div className="card-interactive group">
    <div className="flex items-center justify-between">
      <div>
-       <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">{title}</p>
+       <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1 
+                      group-hover:text-gray-700 dark:group-hover:text-gray-200
+                      transition-colors duration-200">{title}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      </div>
-     {Icon && <div className={colorClasses[color]}><Icon className="w-12 h-12" /></div>}
+     {Icon && (
+       <div className={`${colorClasses[color]} transition-transform duration-200 
+                         group-hover:scale-110`}>
+         <Icon className="w-12 h-12" />
+       </div>
+     )}
    </div>
  </div>
```

### 5.2 Linhas de Tabela

Todas as tabelas (EC2, VMs Azure, Inventário, etc.) devem usar:

```jsx
<tr className="table-row-hover cursor-pointer">
```

### 5.3 Botões

Adicionar efeito de `active:scale-95` em todos os botões para feedback tátil:

```css
.btn-primary {
  @apply ... transition-all duration-150 active:scale-[0.97];
}
```

### 5.4 Modais

- Overlay com `backdrop-blur-sm` e `animate-fade-in`
- Conteúdo do modal com `animate-scale-in`
- Transição de saída (close) com opacidade

### 5.5 Sidebar

**Arquivo:** `components/layout/sidebar.jsx`

- Hover com highlight suave e borda esquerda colorida no item ativo
- Transição de ícones ao expandir/colapsar
- Tooltip nos ícones quando sidebar está colapsada

### 5.6 Badges e Status

- Badges com dot animado para status "live" / "running"
- Transição de cores ao mudar status
- Tamanho consistente em toda a aplicação

### 5.7 Gráficos (Recharts)

- Adicionar `animationDuration={800}` em charts
- Custom tooltips com sombras e bordas arredondadas
- Hover em barras/linhas com highlight sutil

---

## 6. Fase 5 — Acessibilidade & Responsividade

### 6.1 Acessibilidade (a11y)

- [  ] Adicionar `role="dialog"` e `aria-modal="true"` em todos os modais
- [  ] Focus trap nas modais (quando abre, foco fica dentro do modal)
- [  ] `aria-label` nos botões de ícone (que não possuem texto)
- [  ] `aria-live="polite"` nas áreas de notificação/toast
- [  ] Melhorar contraste nos badges no dark mode
- [  ] Skip-to-content link na `Layout`
- [  ] Navegação da sidebar por teclado (`Tab` + `Enter`)

### 6.2 Responsividade

- [  ] Sidebar colapsável em telas < 1024px (atualmente sempre visível)
- [  ] Dashboard widgets em grid responsivo (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`)
- [  ] Tabelas com scroll horizontal em telas pequenas
- [  ] Modais com `max-w-lg` em mobile vs `max-w-2xl` em desktop
- [  ] Header com menu hambúrguer em mobile

---

## 7. Fase 6 — Custom Hooks & Separação de Lógica

> **Objetivo:** Desacoplar lógica de negócio da UI, tornando componentes puramente visuais.

### Hooks a criar:

| Hook | Arquivo | Responsabilidade |
|------|---------|-----------------|
| `useFinOps` | `hooks/useFinOps.js` | Todas as queries/mutations do FinOps |
| `useFinOpsBudgets` | `hooks/useFinOpsBudgets.js` | CRUD de budgets |
| `useFinOpsScans` | `hooks/useFinOpsScans.js` | Scan schedules |
| `useFinOpsReports` | `hooks/useFinOpsReports.js` | Report schedules |
| `useCosts` | `hooks/useCosts.js` | Queries de custo + exportação |
| `useCostAlerts` | `hooks/useCostAlerts.js` | CRUD de alertas de custo |
| `useWebhooks` | `hooks/useWebhooks.js` | CRUD de webhooks |
| `useWorkspaceSettings` | `hooks/useWorkspaceSettings.js` | Configurações do workspace |
| `useAdminPanel` | `hooks/useAdminPanel.js` | Leads + Orgs admin |
| `useClipboard` | `hooks/useClipboard.js` | Copy-to-clipboard reutilizável |
| `useModal` | `hooks/useModal.js` | Estado de modal genérico |
| `useDebounce` | `hooks/useDebounce.js` | Debounce para buscas |

### Padrão de cada hook:

```js
// hooks/useFinOpsBudgets.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import finopsService from '../services/finopsService';

export function useFinOpsBudgets(orgSlug, wsId) {
  const qc = useQueryClient();

  const budgetsQuery = useQuery({
    queryKey: ['finops-budgets', orgSlug, wsId],
    queryFn: () => finopsService.getBudgets(orgSlug, wsId),
    enabled: !!orgSlug && !!wsId,
  });

  const createBudget = useMutation({
    mutationFn: (data) => finopsService.createBudget(orgSlug, wsId, data),
    onSuccess: () => qc.invalidateQueries(['finops-budgets']),
  });

  // ... deleteBudget, updateBudget

  return { budgetsQuery, createBudget, /* ... */ };
}
```

---

## 8. Fase 7 — Testes de Frontend

### 8.1 Estado Atual

- Apenas 1 arquivo de teste: `components/finops/RecommendationCard.test.jsx`
- Setup mínimo: `test/setup.js` (36 bytes)
- Sem cobertura significativa

### 8.2 Testes Propostos (pós-refatoração)

| Teste | Tipo | O que valida |
|-------|------|-------------|
| `EmptyState.test.jsx` | Unit | Renderização com/sem ação, com/sem descrição |
| `SkeletonLoader.test.jsx` | Unit | Variantes skeleton renderizam corretamente |
| `BudgetModal.test.jsx` | Unit | Formulário, validação, submit |
| `useFinOpsBudgets.test.js` | Hook | Queries e mutations disparam corretamente |
| `useCosts.test.js` | Hook | Lógica de exportação CSV/PDF |
| `StatsCard.test.jsx` | Unit | Hover class aplicada, props renderizadas |

### 8.3 Comando para executar testes

```bash
cd frontend
npx vitest run          # roda todos os testes
npx vitest --ui         # abre UI interativa de testes
npx vitest --coverage   # gera relatório de cobertura
```

---

## 9. Cronograma Sugerido

| Fase | Descrição | Tempo Estimado | Dependências |
|------|-----------|---------------|-------------|
| **Fase 1** | Design System & CSS | 1-2 dias | Nenhuma |
| **Fase 2** | Refatoração FinOps.jsx | 2-3 dias | Fase 1 |
| **Fase 2b** | Refatoração costs/Webhooks/Settings | 2 dias | Fase 1 |
| **Fase 3** | Empty States & Skeletons | 1-2 dias | Fase 1 |
| **Fase 4** | Micro-Interações | 1 dia | Fase 1 |
| **Fase 5** | Acessibilidade & Responsividade | 1-2 dias | Fases 1-4 |
| **Fase 6** | Custom Hooks | 2-3 dias | Fase 2 |
| **Fase 7** | Testes | 2-3 dias | Fases 2, 6 |
| **Total** | | **~12-18 dias de desenvolvimento** | |

---

## 10. Priorização Final

### 🔴 P0 — Fazer Primeiro (impacto imediato)
1. **Fase 1** — Design System (é pré-requisito para tudo)
2. **Fase 2 (FinOps.jsx)** — O arquivo mais crítico e maior risco de bugs
3. **Fase 6 (Hooks do FinOps)** — Acompanha a refatoração do FinOps

### 🟡 P1 — Fazer em Seguida (alto valor visual)
4. **Fase 4** — Micro-Interações nos cards/tabelas/botões
5. **Fase 3** — Empty States e Skeleton Screens
6. **Fase 2b** — Refatorar costs, Webhooks, Settings

### 🟢 P2 — Fazer Depois (melhoria contínua)
7. **Fase 5** — Acessibilidade
8. **Fase 6b** — Hooks restantes
9. **Fase 7** — Testes

---

## Regras de Ouro da Refatoração

> ⚠️ **Estas regras devem ser seguidas em todas as fases:**

1. **Nenhum arquivo de componente deve ter mais de 300 linhas.** Se passou, precisa quebrar.
2. **Lógica de React Query sempre em hooks customizados**, nunca diretamente no componente de UI.
3. **Componentes de UI devem ser "burros"** — recebem dados por props e renderizam.
4. **Cada commit deve manter a aplicação funcional** — refatorações incrementais, não big bang.
5. **Nomenclatura PascalCase** para componentes, **camelCase** para hooks e utils.
6. **Imports absolutos** — considerar configurar alias `@/` no Vite para evitar `../../../`.
7. **Testes unitários** para todo componente novo ou hook novo.

---

> **Nota:** Este plano foi elaborado após análise completa do código-fonte do frontend.
> Cada fase pode ser executada independentemente das posteriores, permitindo entregas incrementais e seguras.
