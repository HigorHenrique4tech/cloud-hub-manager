# 📋 Plano de Implementação — Integração com Microsoft Defender (M365)

> **Projeto:** CloudAtlas (cloud-hub-manager)
> **Data:** 08/03/2026  
> **Foco:** Adicionar a visualização de Incidentes e Alertas de Segurança (Defender) ao módulo M365 existente.

---

## 🎯 Visão Geral
Adicionar capacidades avançadas de segurança ao painel administrativo Microsoft 365, trazendo alertas de segurança (incidentes) consolidados pelo Microsoft Defender para visibilidade e auditoria dentro do CloudHub Manager.

## 🛡️ 1. Consentimento e Permissões (Azure AD)
A integração exigirá novas permissões do tipo **Application** no Azure AD (Entra ID) App Registration utilizado no CloudHub Manager.
- O consentimento do administrador global será necessário no portal do Azure para:
  - `SecurityIncident.Read.All` (ou `SecurityEvents.Read.All`)
  - Opcional para endpoints: `Machine.Read.All`

---

## ⚙️ 2. API Endpoints (Backend - FastAPI)

### Modificações no Service (`m365_service.py`)
Adicionar métodos na classe `M365Service` para consumir a Graph API focada em segurança:
- **`get_security_incidents(self)`**: Buscar incidentes de segurança via `/security/incidents`.
  - Retornar lista de incidentes com status, severidade, data e título.
- **`get_security_alerts(self)`**: Buscar alertas de segurança `/security/alerts_v2` (opcional).

### Modificações no Router (`m365.py`)
Adicionar novo endpoint para servir o front-end:
- `GET /orgs/{org_slug}/workspaces/{workspace_id}/m365/security/incidents`
- Integrar com caching (ex: 1 minuto) no backend para não esgotar cotas de chamadas (Throttling) da Graph API.

---

## 💻 3. Interface do Administrador (Frontend)

### Nova Aba "Defender / Ameaças" (`M365Dashboard.jsx`)
Na tela existente de administração do M365 (`/m365`):
- **Nova Tab "Defender"** ou atualização da atual Aba "Segurança".
- **Painel de Indicadores (KPIs)**: Total de alertas ativos, incidentes de Alta Severidade ou Não Resolvidos.
- **Tabela de Incidentes**: Lista detalhada.
  - Colunas: ID do Incidente, Título da Ameaça, Severidade (Alto/Médio/Baixo), Status, Produtos Relacionados (ex: Defender for Endpoint, Defender for Office 365), e Data de Criação.
- **Integração no Service**: Atualizar `m365Service.js` no frontend para fazer fetch do novo endpoint de incidentes.

---

## 🚀 Próximos Passos
1. Validar as permissões de consentimento (`SecurityIncident.Read.All`) no AAD via painel real do usuário.
2. Codificar os métodos de busca na Graph API dentro de `m365_service.py` lidando com paginação e erros de auth.
3. Expor os dados via FastAPI (`m365.py`).
4. Criar a tela visual (Tab Defender) no componente `M365Dashboard.jsx` utilizando os dados consumidos.

---

<br/><hr/><br/>

# 📋 Plano de Implementação — Módulo de Suporte (Helpdesk)

> **Projeto:** CloudAtlas (cloud-hub-manager)
> **Data:** 06/03/2026  
> **Foco:** Criação do Módulo de Suporte (Ticketing System) interativo para clientes e administradores.

---

## 🎯 Visão Geral
Adicionar uma funcionalidade nativa de suporte, permitindo que usuários do sistema abram chamados (tickets) diretamente na plataforma. O administrador master terá um painel centralizado no `/admin` para gerenciar, responder e fechar esses chamados.

## 🗄️ 1. Modelagem de Dados (Backend - SQLAlchemy)

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
