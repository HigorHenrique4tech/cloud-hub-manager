# Plano de Implementação — Melhorias no Painel MSP (Organizações Gerenciadas)

## Objetivo

Implementar 5 melhorias no painel de Organizações Gerenciadas para clientes MSP/Enterprise:

1. **Status visual mais rico** nos cards de parceiros
2. **Dashboard widgets MSP** no painel principal
3. **Paginação** para escalar com muitas parceiras
4. **Batch operations** para ações em massa
5. **Auto-refresh** com polling e indicador de atualização

---

## 1. Status Visual Mais Rico nos Cards

Tornar os Partner Cards muito mais informativos e visuais, sem precisar clicar para saber o estado de cada parceira.

### Backend

#### [MODIFY] orgs.py

Na função `_managed_org_to_dict()` (linha ~650), enriquecer a resposta com dados adicionais:

- **`health_status`** (`healthy` | `warning` | `critical`): calculado com base em contas cloud conectadas vs. com erro
- **`cloud_providers`**: lista de providers distintos (ex: `["aws", "azure"]`) para mostrar ícones
- **`last_activity_at`**: timestamp da última ação na org (query na tabela `ActivityLog` ordenando por `created_at DESC LIMIT 1`)
- **`connected_accounts`** / **`error_accounts`**: contagem de CloudAccounts com status ok vs. com erro

```python
# Novo cálculo dentro de _managed_org_to_dict:
cloud_accounts = (
    db.query(CloudAccount)
    .join(Workspace, CloudAccount.workspace_id == Workspace.id)
    .filter(Workspace.organization_id == org.id, CloudAccount.is_active == True)
    .all()
)
providers = list(set(a.provider for a in cloud_accounts))
error_count = sum(1 for a in cloud_accounts if getattr(a, 'last_error', None))
connected_count = len(cloud_accounts) - error_count

if len(cloud_accounts) == 0:
    health = "critical"
elif error_count > 0:
    health = "warning"
else:
    health = "healthy"
```

Campos adicionais no dict retornado:
```python
"health_status": health,
"cloud_providers": providers,
"connected_accounts": connected_count,
"error_accounts": error_count,
"last_activity_at": last_activity.created_at.isoformat() if last_activity else None,
```

### Frontend

#### [MODIFY] ManagedOrgsPage.jsx

No componente `PartnerCard` (linha ~279):

1. **Health dot** no canto superior do card:
   - 🟢 `healthy` → dot verde com pulse animation
   - 🟡 `warning` → dot amarelo
   - 🔴 `critical` → dot vermelho
   
2. **Badges de providers** ao lado das stats:
   - Ícones pequenos (AWS laranja, Azure azul, GCP vermelho) com tooltip

3. **Última atividade** no rodapé do card:
   - `"Última atividade: há 2h"` com formatação relativa (usar `Intl.RelativeTimeFormat` ou helper simples)

4. **Barra resumo de conexões**:
   - Mini barra `3/4 contas conectadas` com cor verde/amarelo/vermelho proporcional

---

## 2. Dashboard Widgets para MSP

Adicionar 2 novos widgets ao dashboard principal, visíveis apenas para orgs `master`/Enterprise.

### Backend

#### [MODIFY] orgs.py

Novo endpoint `GET /{org_slug}/managed-orgs/widget-summary`:
```python
@router.get("/{org_slug}/managed-orgs/widget-summary")
async def managed_orgs_widget_summary(...):
    """Resumo leve para widgets do dashboard MSP."""
    # Retorna:
    return {
        "total_partners": len(partners),
        "healthy": count_healthy,
        "warning": count_warning,
        "critical": count_critical,
        "partners_summary": [
            {"name": p.name, "slug": p.slug, "health": health, "providers": [...]}
            for p in partners[:10]  # top 10 para widget
        ],
    }
```

### Frontend

#### [NEW] MspHealthWidget.jsx

Widget "Saúde dos Parceiros" em `frontend/src/components/dashboard/widgets/`:
- Grid de mini cards com dot de saúde + nome da parceira
- Contadores: `X saudáveis · Y com alertas · Z críticas`
- Botão "Ver todas" → navega para `/managed-orgs`
- Segue o mesmo padrão do `StatsWidget` (usa `useQuery`, card layout)
- Só renderiza se `currentOrg.org_type === 'master'`

#### [MODIFY] DashboardConfigContext.jsx

Adicionar ao `DEFAULT_WIDGETS` e `WIDGET_META`:
```js
// DEFAULT_WIDGETS - adicionar:
{ id: 'msp_health', visible: false, order: 6 },

// WIDGET_META - adicionar:
msp_health: { label: 'Saúde dos Parceiros (MSP)' },
```

#### [MODIFY] Dashboard.jsx

Adicionar import e entry no `WIDGET_COMPONENTS`:
```js
import MspHealthWidget from '../components/dashboard/widgets/MspHealthWidget';

const WIDGET_COMPONENTS = {
  // ... existentes
  msp_health: <MspHealthWidget />,
};
```

#### [MODIFY] orgService.js

Adicionar método:
```js
getMspWidgetSummary: async (slug) =>
  (await api.get(`/orgs/${slug}/managed-orgs/widget-summary`)).data,
```

---

## 3. Paginação

### Backend

#### [MODIFY] orgs.py

No endpoint `GET /{org_slug}/managed-orgs` (linha ~704), adicionar query params:

```python
from fastapi import Query

@router.get("/{org_slug}/managed-orgs")
async def list_managed_orgs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    sort_by: str = Query("recent"),  # recent | name | workspaces
    member: MemberContext = Depends(get_current_member),
    db: Session = Depends(get_db),
):
```

Lógica:
- Aplicar filtro `ilike` no `name` e `slug` se `search` fornecido
- Ordenar conforme `sort_by`
- Aplicar `offset` / `limit`
- Retornar metadata de paginação:

```python
return {
    "managed_orgs": [...],
    "pagination": {
        "page": page,
        "per_page": per_page,
        "total": total_count,
        "total_pages": ceil(total_count / per_page),
    }
}
```

### Frontend

#### [MODIFY] ManagedOrgsPage.jsx

- Mover search e sort para query params no backend (em vez de filtrar no frontend)
- Adicionar state `page` e componente de paginação:
  - Botões `« Anterior | Página X de Y | Próximo »`
  - Debounce no search input (300ms)
- Atualizar `queryKey` para incluir `[page, search, sortBy]`
- Remover `useMemo` de `filteredOrgs` (filtering agora é no backend)

#### [MODIFY] orgService.js

Atualizar `listManagedOrgs` para aceitar params:
```js
listManagedOrgs: async (slug, { page = 1, perPage = 20, search, sortBy } = {}) =>
  (await api.get(`/orgs/${slug}/managed-orgs`, {
    params: { page, per_page: perPage, search, sort_by: sortBy }
  })).data,
```

---

## 4. Batch Operations

### Backend

#### [MODIFY] orgs.py

Novos endpoints:

**`POST /{org_slug}/managed-orgs/batch-suspend`**
```python
class BatchSuspend(BaseModel):
    partner_slugs: list[str]

@router.post("/{org_slug}/managed-orgs/batch-suspend")
async def batch_suspend_partners(payload: BatchSuspend, ...):
    """Suspender múltiplas parceiras de uma vez."""
    # Para cada slug: org.is_active = False
    # Log activity para cada
    return {"suspended": len(updated), "slugs": updated_slugs}
```

**`POST /{org_slug}/managed-orgs/batch-activate`**
```python
@router.post("/{org_slug}/managed-orgs/batch-activate")
async def batch_activate_partners(payload: BatchActivate, ...):
    """Reativar múltiplas parceiras de uma vez."""
    return {"activated": len(updated), "slugs": updated_slugs}
```

### Frontend

#### [MODIFY] ManagedOrgsPage.jsx

1. Adicionar state `selectedOrgs` (Set de slugs) e `batchMode` (boolean)
2. Botão **"Selecionar"** no toolbar que ativa modo de seleção
3. Em cada `PartnerCard`, quando `batchMode === true`:
   - Checkbox no canto superior esquerdo
   - Card com borda highlight quando selecionado
4. **Floating action bar** na parte inferior quando há seleção:
   - `"3 selecionadas"` + botões: `Suspender` | `Reativar` | `Cancelar`
   - Estilo: barra fixa na parte inferior com blur backdrop, similar a um toast
5. Botão **"Selecionar todos"** / **"Limpar seleção"**

#### [MODIFY] orgService.js

```js
batchSuspendPartners: async (slug, partnerSlugs) =>
  (await api.post(`/orgs/${slug}/managed-orgs/batch-suspend`, { partner_slugs: partnerSlugs })).data,
batchActivatePartners: async (slug, partnerSlugs) =>
  (await api.post(`/orgs/${slug}/managed-orgs/batch-activate`, { partner_slugs: partnerSlugs })).data,
```

---

## 5. Auto-Refresh

### Frontend

#### [MODIFY] ManagedOrgsPage.jsx

1. Adicionar `refetchInterval` ao `useQuery` dos managed orgs:
```js
const orgsQ = useQuery({
  queryKey: ['managed-orgs', currentOrg?.slug, page, search, sortBy],
  queryFn: () => orgService.listManagedOrgs(currentOrg.slug, { page, search, sortBy }),
  enabled: Boolean(currentOrg?.slug),
  refetchInterval: 60_000, // 60 segundos
  retry: false,
});
```

2. Mesma coisa para `summaryQ` (refetch a cada 60 s)

3. **Indicador visual** no header:
   - `"Atualizado há X min"` com ícone de refresh
   - Botão manual "↻ Atualizar agora" que chama `orgsQ.refetch()`
   - Usar `orgsQ.dataUpdatedAt` para calcular o tempo relativo

```jsx
const lastUpdated = orgsQ.dataUpdatedAt;
const timeAgo = lastUpdated ? formatRelativeTime(lastUpdated) : null;

// No header, ao lado do botão "Adicionar Parceira":
<div className="flex items-center gap-2 text-xs text-gray-400">
  {orgsQ.isFetching && <RefreshCw size={12} className="animate-spin" />}
  {timeAgo && <span>Atualizado {timeAgo}</span>}
  <button onClick={() => orgsQ.refetch()} title="Atualizar agora">
    <RefreshCw size={13} />
  </button>
</div>
```

4. **Helper `formatRelativeTime`**:
```js
const formatRelativeTime = (timestamp) => {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
};
```

---

## Resumo de Arquivos

| Arquivo | Ação | Feature |
|---------|------|---------|
| `backend/app/api/orgs.py` | MODIFY | 1, 2, 3, 4 |
| `frontend/src/pages/ManagedOrgsPage.jsx` | MODIFY | 1, 3, 4, 5 |
| `frontend/src/services/orgService.js` | MODIFY | 2, 3, 4 |
| `frontend/src/contexts/DashboardConfigContext.jsx` | MODIFY | 2 |
| `frontend/src/pages/Dashboard.jsx` | MODIFY | 2 |
| `frontend/src/components/dashboard/widgets/MspHealthWidget.jsx` | NEW | 2 |

---

## Verification Plan

### Testes Automatizados

Os testes existentes em `backend/tests/test_orgs.py` cobrem apenas listagem básica de orgs e permissão de workspace. Após implementação, adicionar os seguintes testes:

#### [MODIFY] test_orgs.py

1. **`test_list_managed_orgs_pagination`** — Verificar que `page`, `per_page` e `search` funcionam corretamente
2. **`test_managed_orgs_health_status`** — Verificar que o campo `health_status` é retornado e tem valor válido
3. **`test_batch_suspend_partners`** — Verificar suspensão em massa de parceiras
4. **`test_batch_activate_partners`** — Verificar reativação em massa
5. **`test_widget_summary_endpoint`** — Verificar retorno do endpoint de widget summary

Comando para rodar:
```bash
cd backend
pytest tests/test_orgs.py -v
```

### Verificação Manual (solicitar ao usuário)

Após implementação, pedir ao usuário para:
1. Fazer login com conta Enterprise que tenha parceiras
2. Verificar se os cards mostram o dot de saúde e os ícones de providers
3. Testar a paginação (criar/ter mais de 20 parceiras ou mudar per_page para 2)
4. Ativar modo batch e tentar suspender/reativar múltiplas parceiras
5. Aguardar 60s e verificar se o auto-refresh atualiza os dados
6. Ativar o widget "Saúde dos Parceiros" no customizer do Dashboard e verificar que aparece

---

## Ordem de Implementação Sugerida

1. **Status visual** (menor risco, mais visível)
2. **Auto-refresh** (simples, melhora UX imediata)
3. **Paginação** (fundação para escalar)
4. **Batch operations** (depende da paginação estar ok)
5. **Dashboard widgets** (independente, pode ser paralelo)
