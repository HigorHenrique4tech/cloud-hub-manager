# Análise & Melhorias — CloudAtlas Desk (Helpdesk)

## Estado Atual

O Desk é um app separado (Vite + React) com 3 rotas:

| Rota | Visão | Funcionalidades |
|------|-------|----------------|
| `/` (Support.jsx) | **Cliente** | Lista de tickets com stats, filtro por status, modal de criação |
| `/ticket/:id` (TicketDetails.jsx) | **Cliente** | Chat de mensagens, sidebar com detalhes, polling 5s |
| `/painel` (Suporte.jsx) | **Admin/Helpdesk** | Layout 3-panel Jira: filas, lista, detalhe com chat + notas internas |

**Backend**: `support.py` (532 linhas) — CRUD de tickets, mensagens, status, prioridade. Admin com visibilidade cross-org.

---

## O que está BOM ✅

- Layout 3-panel no admin é sólido (estilo Jira)
- Chat com mensagens em bolha, polling real-time
- Notas internas no admin (mensagens visíveis só para staff)
- Status workflow completo (open → in_progress → waiting_client → resolved → closed)
- Prioridades e categorias
- Número sequencial de ticket (TKT-0001)

---

## 🎨 Melhorias de Design

### 1. Empty State mais rico (tela do cliente)
A tela que aparece no screenshot é muito básica. Sugestões:
- Ilustração/ícone maior e mais visual
- Call-to-action mais destacado com dica contextual
- Mostrar um "Quick tip" sobre como usar o suporte

### 2. Sidebar do Desk enriquecida
Hoje só tem 2 links (Meus Tickets, Painel Helpdesk). Adicionar:
- **Badge de contagem** no "Meus Tickets" (tickets abertos)
- **Badge vermelha** no "Painel Helpdesk" (tickets urgentes)
- Seção de **links rápidos** (Base de Conhecimento, FAQ)

### 3. Notificação de novas mensagens
- Badge visual quando o ticket tem nova mensagem não lida
- Highlight de tickets com respostas não lidas na listagem

---

## 🚀 Features — Lado do Cliente

### 4. 📎 Anexos / Upload de Arquivos
**Alta prioridade** — muito esperado em qualquer helpdesk.
- Permitir upload de imagens, logs, PDFs na abertura e nas mensagens
- Backend: salvar em S3/blob ou base64 no DB para simplicidade
- Frontend: drag & drop zone no textarea + preview de imagem

### 5. ⭐ Avaliação de Satisfação (CSAT)
- Quando ticket é marcado como "Resolvido", mostrar popup de avaliação: ⭐⭐⭐⭐⭐ + comentário
- Backend: campo `rating` e `rating_comment` no Ticket
- Admin: ver score médio no painel

### 6. 📚 Base de Conhecimento / FAQ
**Nova página** no Desk com artigos de ajuda:
- Artigos organizados por categoria (Técnico, Financeiro, etc.)
- Busca por texto
- Sugerida ao cliente **antes** de abrir ticket (deflexão)
- Admin pode CRUD de artigos

### 7. 🔄 Reabrir ticket resolvido
Hoje, se o ticket é resolvido/encerrado, o cliente só pode abrir um novo. Permitir:
- Botão "Ainda preciso de ajuda" que reabre o ticket
- Backend: se status = resolved e o cliente manda mensagem → status volta para open

### 8. 🔔 Notificações por Email
- Quando ticket recebe resposta → notificar o cliente por email
- Quando cliente responde → notificar o agente
- Templates com branding (já existe infraestrutura de email no hub)

---

## 🛡️ Features — Lado do Admin

### 9. 👤 Atribuição de Agente (Assignee)
**Alta prioridade** — essencial para equipes.
- Campo `assigned_to` no Ticket
- Admin pode atribuir ticket para si ou para outro agente
- Filtro de filas por "Meus tickets" vs "Não atribuídos"
- Auto-assign opcional quando agente responde

### 10. 💬 Respostas Pré-Definidas (Canned Responses)
- Biblioteca de templates de resposta
- Botão "Usar template" no compose area
- Ex: "Olá! Recebemos seu chamado...", "Poderia nos enviar mais detalhes?"
- Reduz tempo de resposta significativamente

### 11. ⏱️ SLA Tracking
- Definir metas de tempo de resposta por prioridade:
  - Urgente: 1h | Alta: 4h | Normal: 24h | Baixa: 48h
- Mostrar countdown no ticket (ex: "SLA: 3h restantes")
- Badge vermelho quando SLA estourado
- Dashboard de SLA compliance

### 12. 🏷️ Tags / Labels nos tickets
- Permitir adicionar tags customizáveis (ex: "bug", "Azure", "billing")
- Filtrar por tag
- Ajuda na categorização e reporting

### 13. 📊 Dashboard de Analytics
**Nova página** no admin com:
- Tickets abertos por tempo (gráfico de linha)
- Tempo médio de primeira resposta
- Tempo médio de resolução
- Volume por categoria/prioridade (donut chart)
- Tickets por organização (para MSP)
- Performance por agente
- CSAT score por período

### 14. 🔀 Merge de Tickets Duplicados
- Admin pode mesclar 2 tickets duplicados em um
- Preserva todas as mensagens de ambos
- Util quando cliente abre o mesmo problema 2x

### 15. 📋 Ações em Massa (Bulk Actions)
- Selecionar múltiplos tickets na lista
- Ações: mudar status, mudar prioridade, atribuir agente
- Útil para limpar fila de tickets resolvidos

---

## 🛠️ Melhorias Técnicas

### 16. WebSocket para Real-Time
- Substituir polling HTTP (5s) por WebSocket
- Mensagens aparecem instantaneamente
- Indicador "Agente está digitando..."

### 17. Busca Avançada
- Buscar em título + conteúdo das mensagens
- Filtrar por data, agente, organização, tags
- Histórico de tickets do cliente visível ao admin

### 18. Paginação na Lista de Tickets (Cliente)
- Backend já suporta pagination, mas frontend não usa
- Adicionar componente de paginação como no painel MSP

---

## 🎯 Priorização

| Prioridade | Feature | Esforço | Impacto |
|------------|---------|---------|---------|
| 🔴 Alta | Atribuição de agente | Baixo | Alto |
| 🔴 Alta | Anexos de arquivos | Médio | Alto |
| 🔴 Alta | Notificações por email | Médio | Alto |
| 🟡 Média | Respostas pré-definidas | Baixo | Médio |
| 🟡 Média | SLA tracking | Médio | Alto |
| 🟡 Média | CSAT (avaliação) | Baixo | Médio |
| 🟡 Média | Tags/Labels | Baixo | Médio |
| 🟡 Média | Dashboard analytics | Alto | Alto |
| 🟡 Média | Reabrir ticket | Baixo | Médio |
| 🟢 Baixa | Base de conhecimento | Alto | Alto |
| 🟢 Baixa | Merge de tickets | Médio | Baixo |
| 🟢 Baixa | Bulk actions | Médio | Médio |
| 🟢 Baixa | WebSocket real-time | Alto | Médio |
| 🟢 Baixa | Empty state design | Baixo | Baixo |
| 🟢 Baixa | Sidebar badges | Baixo | Baixo |
