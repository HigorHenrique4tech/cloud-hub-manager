# Plano — Reestruturação de Domínios CloudAtlas

## Visão geral da mudança

| Antes | Depois | Conteúdo |
|-------|--------|---------|
| `cloudatlas.app.br` | `cloudatlas.app.br` | Landing page estática |
| `cloudatlas.app.br` | `hub.cloudatlas.app.br` | Aplicação principal CloudAtlas |
| (integrado no hub) | `desk.cloudatlas.app.br` | Portal de helpdesk/tickets separado |

---

## Por que é viável

- **Landing page**: arquivo HTML estático — Caddy serve diretamente com `file_server`, zero custo adicional.
- **hub subdomain**: mesma aplicação atual, apenas muda o domínio no Caddy e variáveis de ambiente.
- **desk portal**: reaproveita toda a lógica de tickets já existente (`Support.jsx`, `TicketDetails.jsx`, `Suporte.jsx`) — é uma nova casca React com menos páginas, usando o mesmo backend/JWT.
- **Backend**: permanece único. O CORS é expandido para os novos origens. Nenhuma migration de banco necessária.

---

## Fase 1 — Caddy: reorganizar os domínios

### Caddyfile atual (`infra/docker/Caddyfile`)

```
cloudatlas.app.br {
    reverse_proxy /api/* backend:8000
    reverse_proxy /* frontend:80
}
www.cloudatlas.app.br {
    redir https://cloudatlas.app.br{uri} permanent
}
```

### Caddyfile novo

```
# ── Landing Page ──────────────────────────────────────────────
cloudatlas.app.br {
    root * /srv/landing
    file_server
    # Redireciona www para raiz
}

www.cloudatlas.app.br {
    redir https://cloudatlas.app.br{uri} permanent
}

# ── Aplicação principal ───────────────────────────────────────
hub.cloudatlas.app.br {
    @blocked path /docs /redoc /openapi.json /metrics
    respond @blocked 403

    reverse_proxy /api/* backend:8000
    reverse_proxy /health backend:8000
    reverse_proxy /* frontend:80
}

# ── Portal de Helpdesk ────────────────────────────────────────
desk.cloudatlas.app.br {
    @blocked path /docs /redoc /openapi.json /metrics
    respond @blocked 403

    reverse_proxy /api/* backend:8000
    reverse_proxy /* desk-frontend:80
}
```

### Mudança no docker-compose.prod.yml

```yaml
volumes:
  # Montar a landing page no Caddy
  caddy:
    volumes:
      - ./cloudatlas-landing.html:/srv/landing/index.html:ro
      # ou pasta inteira: - ./landing/:/srv/landing/:ro

services:
  # Novo serviço para o portal de helpdesk
  desk-frontend:
    build:
      context: ./desk-frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    networks:
      - internal
```

### DNS — registros a criar no provedor do domínio

```
cloudatlas.app.br     A     <IP_DA_VM>
www.cloudatlas.app.br CNAME cloudatlas.app.br
hub.cloudatlas.app.br A     <IP_DA_VM>
desk.cloudatlas.app.br A    <IP_DA_VM>
```

> Caddy gera os certificados TLS automaticamente via Let's Encrypt para todos os domínios — nenhuma configuração extra necessária.

---

## Fase 2 — Ajustar módulo de tickets no hub

O hub **não perde o acesso a tickets** — mantém um botão "Abrir Ticket" no canto superior direito do topbar para o usuário criar chamados sem sair da plataforma. O que sai do hub é o **painel de gestão** (fila Jira-style) e a **listagem completa de tickets**, que ficam no desk.

### O que FICA no hub
- Botão **"Abrir Ticket"** no topbar (canto superior direito), abre modal inline de criação
- Modal minimalista: título, descrição, prioridade → chama `POST /api/orgs/{slug}/tickets`
- Link **"Ver meus tickets →"** no rodapé do modal, aponta para `https://desk.cloudatlas.app.br`

### O que SAI do hub
- Página `/support` (lista completa de tickets do usuário) → vai para o desk
- Página `/support/:ticketId` (detalhe do ticket) → vai para o desk
- Página `/suporte` (painel admin/helpdesk Jira-style) → vai para o desk
- Item "Helpdesk" da sidebar → removido

### Arquivos a modificar

#### `frontend/src/App.jsx`
```jsx
// REMOVER estas rotas:
<PR><Support /></PR>          // /support
<PR><TicketDetails /></PR>    // /support/:ticketId
<PR><Suporte /></PR>          // /suporte

// MANTER o import de supportService (ainda usado pelo modal de criação)
```

#### `frontend/src/components/layout/sidebar.jsx`
```jsx
// REMOVER:
{ label: "Helpdesk", path: "/suporte", icon: ..., roles: ["admin","helpdesk"] }
```

#### `frontend/src/components/layout/Topbar.jsx` (ou equivalente)
Adicionar botão no canto superior direito:
```jsx
// ADICIONAR — botão que abre o modal de criação de ticket
<button
  onClick={() => setTicketModalOpen(true)}
  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg
             bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600
             text-gray-700 dark:text-gray-200 transition"
>
  <TicketIcon className="w-4 h-4" />
  Abrir Ticket
</button>
```

#### Novo componente: `frontend/src/components/support/NewTicketModal.jsx`
Modal leve de criação de ticket, sem depender das páginas removidas:
```jsx
// Campos: título (text), descrição (textarea), prioridade (select: baixa/média/alta/urgente)
// Submete: POST /api/orgs/{slug}/tickets via supportService.createTicket()
// Rodapé: link "Ver todos os tickets →" abre desk.cloudatlas.app.br em nova aba
```

#### `frontend/src/services/supportService.js`
Manter no hub — o `createTicket()` ainda é usado pelo modal. O restante dos métodos continuam disponíveis para o desk-frontend (que importa o mesmo arquivo ou sua cópia).

---

## Fase 3 — Criar o portal desk.cloudatlas.app.br

### Estrutura do novo projeto

```
desk-frontend/
├── Dockerfile
├── package.json          ← mesma stack: Vite + React 18 + Tailwind
├── vite.config.js        ← proxy /api → backend:8000
├── src/
│   ├── main.jsx
│   ├── App.jsx           ← rotas do desk
│   ├── contexts/
│   │   └── AuthContext.jsx   ← cópia/link do hub (mesmo JWT)
│   ├── pages/
│   │   ├── Login.jsx         ← login simples (redireciona para hub se não for helpdesk)
│   │   ├── Support.jsx       ← copiado do hub (visão do usuário)
│   │   ├── TicketDetails.jsx ← copiado do hub
│   │   └── Suporte.jsx       ← copiado do hub (painel admin/helpdesk)
│   ├── components/
│   │   └── layout/
│   │       ├── DeskLayout.jsx    ← layout minimalista (sem sidebar de cloud)
│   │       └── DeskSidebar.jsx   ← sidebar simples: Meus Tickets | Painel Helpdesk
│   └── services/
│       └── supportService.js  ← copiado do hub
```

### Rotas do desk (`desk-frontend/src/App.jsx`)

```jsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/" element={<ProtectedRoute><DeskLayout /></ProtectedRoute>}>
    <Route index element={<Support />} />                    // /  → meus tickets
    <Route path="ticket/:ticketId" element={<TicketDetails />} />
    <Route path="painel" element={<AdminRoute><Suporte /></AdminRoute>} />
  </Route>
</Routes>
```

### DeskSidebar — estrutura

```
┌─────────────────────┐
│  🎫 CloudAtlas Desk │
├─────────────────────┤
│  Meus Tickets       │  → /
│  Painel Helpdesk    │  → /painel  (só admin/helpdesk)
├─────────────────────┤
│  ← Ir para hub      │  → link externo hub.cloudatlas.app.br
└─────────────────────┘
```

### Dockerfile do desk-frontend

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## Fase 4 — Backend: atualizar CORS

### `backend/app/core/config.py` ou `main.py`

```python
# Antes:
allow_origins=["https://cloudatlas.app.br"]

# Depois:
allow_origins=[
    "https://cloudatlas.app.br",
    "https://hub.cloudatlas.app.br",
    "https://desk.cloudatlas.app.br",
]
```

> O backend permanece em `https://hub.cloudatlas.app.br/api/` e `https://desk.cloudatlas.app.br/api/` (ambos proxiados pelo Caddy para o mesmo container `backend:8000`). Nenhuma mudança de lógica ou banco.

---

## Fase 5 — Frontend hub: atualizar referências de domínio

Verificar se há hardcoded `cloudatlas.app.br` no frontend do hub e substituir por `hub.cloudatlas.app.br`. Principais locais:

- `frontend/src/contexts/AuthContext.jsx` — se tiver redirect de login
- `frontend/.env.production` — variável `VITE_APP_URL` se existir
- Qualquer e-mail template ou link de confirmação gerado no backend

---

## Resumo das tarefas

### Infra / Caddy
- [ ] Atualizar `infra/docker/Caddyfile` com 4 blocos (landing, www, hub, desk)
- [ ] Montar `cloudatlas-landing.html` como `/srv/landing/index.html` no Caddy
- [ ] Adicionar registros DNS: `hub.` e `desk.` apontando para o IP da VM
- [ ] Adicionar serviço `desk-frontend` no `docker-compose.prod.yml`

### Hub (aplicação principal)
- [ ] Remover rotas `/support`, `/support/:ticketId`, `/suporte` do `App.jsx`
- [ ] Remover item "Helpdesk" do `sidebar.jsx`
- [ ] Remover imports não utilizados (Support, TicketDetails, Suporte)
- [ ] Adicionar botão "Abrir Ticket" no canto superior direito do Topbar
- [ ] Criar `NewTicketModal.jsx` (título, descrição, prioridade + link para desk)
- [ ] Atualizar CORS no backend para incluir `hub.cloudatlas.app.br` e `desk.cloudatlas.app.br`
- [ ] Verificar/atualizar links hardcoded do domínio antigo

### Desk (portal separado)
- [ ] Criar estrutura `desk-frontend/` com Vite + React + Tailwind
- [ ] Copiar/adaptar: `AuthContext.jsx`, `supportService.js`, `Support.jsx`, `TicketDetails.jsx`, `Suporte.jsx`
- [ ] Criar `DeskLayout.jsx` e `DeskSidebar.jsx` (minimalista)
- [ ] Criar `Dockerfile` e `nginx.conf` do desk-frontend
- [ ] Configurar `vite.config.js` com proxy `/api` → `https://hub.cloudatlas.app.br/api` (ou backend direto)
- [ ] Testar login JWT compartilhado entre hub e desk

---

## Cronograma estimado

| Fase | Complexidade | Esforço |
|------|-------------|---------|
| Fase 1 — Caddy + DNS | Baixa | ~1h |
| Fase 2 — Remover tickets do hub | Baixa | ~30min |
| Fase 3 — Criar desk-frontend | Média | ~4-6h |
| Fase 4 — CORS backend | Mínima | ~15min |
| Fase 5 — Links de domínio | Baixa | ~30min |

**Total**: ~1 dia de desenvolvimento.

---

## Considerações importantes

1. **SEO**: `cloudatlas.app.br` passa a ser a landing page — boa para indexação do produto.
2. **Login compartilhado**: usuários que forem para `desk.cloudatlas.app.br` sem sessão ativa precisarão logar. O token JWT é o mesmo, mas o cookie/localStorage é por domínio — o desk-frontend terá sua própria tela de login (leve, sem onboarding).
3. **Usuários comuns**: acessam `desk.cloudatlas.app.br` para criar tickets. Admins/Helpdesk: acessam `/painel` dentro do desk.
4. **Links de suporte no hub**: pode-se manter um link "Abrir ticket" na sidebar do hub que redireciona para `https://desk.cloudatlas.app.br` em nova aba — mantendo a experiência do usuário sem remover o acesso.
5. **Rollout seguro**: fazer as mudanças de DNS e Caddy juntas, testando hub.cloudatlas.app.br antes de tirar cloudatlas.app.br da aplicação.
