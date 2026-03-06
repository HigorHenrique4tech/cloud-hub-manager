# 📋 Plano de Implementação — Módulo de Suporte (Helpdesk)

> **Projeto:** CloudAtlas (cloud-hub-manager)
> **Data:** 06/03/2026  
> **Foco:** Criação do Módulo de Suporte (Ticketing System) interativo para clientes e administradores.

---

## 🎯 Visão Geral
Adicionar uma funcionalidade nativa de suporte, permitindo que usuários do sistema abram chamados (tickets) diretamente na plataforma. O administrador master terá um painel centralizado no `/admin` para gerenciar, responder e fechar esses chamados.

## �️ 1. Modelagem de Dados (Backend - SQLAlchemy)

Criaremos dois novos modelos no banco de dados (`app/models/db_models.py`):

### Tabela `tickets`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK do ticket |
| `organization_id` | UUID | FK para a Organização do cliente |
| `creator_id` | UUID | FK para o Usuário que abriu o ticket |
| `title` | String | Assunto do chamado |
| `category` | Enum | `billing`, `technical`, `feature_request`, `other` |
| `priority` | Enum | `low`, `normal`, `high`, `urgent` |
| `status` | Enum | `open`, `in_progress`, `waiting_client`, `resolved`, `closed` |
| `created_at` | DateTime | Timestamp de criação |
| `updated_at` | DateTime | Última atualização |
| `resolved_at` | DateTime | Quando foi finalizado |

### Tabela `ticket_messages`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK da mensagem |
| `ticket_id` | UUID | FK para `tickets` |
| `sender_id` | UUID | FK para o Usuário (cliente ou admin) |
| `content` | Text | Conteúdo da resposta (suporta markdown básico) |
| `is_internal` | Boolean | True se for uma nota visível apenas para admins |
| `created_at` | DateTime | Timestamp da resposta |

---

## ⚙️ 2. API Endpoints (Backend - FastAPI)

Novo router `app/api/support.py` com os seguintes endpoints:

### Visão Cliente (Tenant)
- `GET /orgs/{org_slug}/tickets` - Lista os tickets da organização.
- `POST /orgs/{org_slug}/tickets` - Cria um novo ticket (e a primeira mensagem).
- `GET /orgs/{org_slug}/tickets/{ticket_id}` - Detalhes do ticket + mensagens.
- `POST /orgs/{org_slug}/tickets/{ticket_id}/messages` - Cliente envia nova resposta.

### Visão Admin (Global)
- `GET /admin/tickets` - Lista **todos** os tickets do sistema (com filtros por org, status, prioridade).
- `PATCH /admin/tickets/{ticket_id}/status` - Atualiza o status do ticket (ex: in_progress -> resolved).
- `POST /admin/tickets/{ticket_id}/messages` - Admin responde ao cliente.

---

## 💻 3. Interface do Cliente (Frontend)

Nova aba na barra esquerda (Sidebar): **Suporte**.

### Página `Support.jsx`
- **Cabeçalho:** Estatísticas rápidas (Chamados abertos, Resolvidos). Botão "Abrir Chamado".
- **Lista:** Tabela com os tickets da organização (ID, Assunto, Categoria, Status, Prioridade, Atualizado em).
- **Badge de Status coloridos:** 
  - `Aberta`: Vermelho/Laranja
  - `Em Andamento`: Azul
  - `Aguardando Você`: Amarelo
  - `Resolvido`: Verde

### Modal de Criação `NewTicketModal.jsx`
- Formulário simples: Categoria (Dropdown), Prioridade (Dropdown), Assunto (Input), Descrição detalhada (Textarea).

### Página de Detalhes `TicketDetails.jsx`
- **Esquerda:** Timeline de mensagens (chat). Mensagens do cliente à direita (ou de uma cor), mensagens do Admin de outra cor, com logo do CloudAtlas.
- **Rodapé:** Textarea para responder.
- **Direita (Sidebar Fixa):** Detalhes do ticket (Status, Prioridade, Data de Criação).

---

## 🛠️ 4. Painel do Administrador (Frontend)

Expansão da página `/admin` (já existente `AdminPanel.jsx`).

- **Nova Tab "Atendimento":** 
  - Fila Kanban (opcional) ou Tabela avançada listando chamados de todos os clientes.
  - Colunas para indicar de qual Organização veio o ticket.
  - Indicadores de SLA visual (Tempo desde a abertura ou desde a última resposta do cliente).
- **Visão do Ticket no Admin:**
  - Igual à do cliente, mas com permissão para alterar Status e Adicionar Nota Interna (Check "Resposta Invisível ao Cliente").

---

## 🔔 5. Notificações e e-mails (Opcional p/ Fase 2)
- Disparo de email (via AWS SES ou similar) quando um ticket for aberto (para o admin) e quando for respondido (para o cliente).
- Integração com o sistema de alerta/sino (`alertService.py`) da plataforma.

---

## 🚀 Próximos Passos
1. Criar os modelos em `models/db_models.py` e gerar migração (Alembic).
2. Construir o router `support.py` e referenciá-lo em `main.py`.
3. Criar a interface Frontend do Cliente (Lista, Modal e Chat).
4. Implementar a aba de Suporte no Painel Admin.
