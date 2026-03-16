# GDAP Manager — Planejamento de Feature

## Contexto

O Enterprise master org conecta o **próprio tenant M365** (o tenant do MSP/parceiro) ao CloudAtlas.
Usando esse App Registration, o CloudAtlas chama as APIs de GDAP para gerenciar relações com clientes finais.

Funcionalidade exclusiva para `org_type === "master"` + `plan_tier === "enterprise"`.

---

## Permissões e pré-requisitos no App Registration

| Permissão | Tipo | Finalidade |
|-----------|------|-----------|
| `DelegatedAdminRelationship.ReadWrite.All` | Application | Listar/criar/expirar relações GDAP |

As demais permissões M365 já existentes (User.Read.All etc.) continuam no mesmo App Registration.

### ⚠️ Requisito crítico para Application permissions

Para chamar a API de criação de GDAP via Application (client_credentials), é **obrigatório** provisionar
o service principal da Microsoft no tenant parceiro antes de qualquer chamada:

```
appId: 2832473f-ec63-45fb-976f-5d45a7d4bb91
displayName: Partner Customer Delegated Administration
```

Isso é feito uma única vez via:
```http
POST https://graph.microsoft.com/v1.0/servicePrincipals
Content-Type: application/json
{ "appId": "2832473f-ec63-45fb-976f-5d45a7d4bb91" }
```
Deve ser executado manualmente pelo parceiro (ou via script de setup) no tenant dele.

---

## Fluxo real de criação GDAP (dois passos obrigatórios)

> **IMPORTANTE:** O `inviteUrl` não é retornado no POST de criação. O fluxo correto é:

```
1. POST /tenantRelationships/delegatedAdminRelationships
   Body: { displayName, duration, accessDetails, autoExtendDuration? }
   → Response status: "created"  (ainda sem inviteUrl)

2. POST /tenantRelationships/delegatedAdminRelationships/{id}/requests
   Body: { "action": "lockForApproval" }
   → Response status: "approvalPending"
   → inviteUrl agora disponível no objeto da relação

3. GET /tenantRelationships/delegatedAdminRelationships/{id}
   → Retorna o objeto completo com inviteUrl
```

O backend deve executar os passos 1+2+3 atomicamente e retornar o `inviteUrl` ao frontend em uma única chamada.

---

## Backend — novos métodos em `m365_service.py`

```python
get_gdap_relationships()
# GET /tenantRelationships/delegatedAdminRelationships
# Campos retornados: id, displayName, status, duration, createdDateTime,
#   endDateTime, autoExtendDuration, customer{tenantId, displayName},
#   accessDetails{unifiedRoles[]}, inviteUrl (quando approvalPending)

get_gdap_customers()
# GET /tenantRelationships/delegatedAdminCustomers
# Retorna: tenantId, displayName (clientes que já aprovaram)

create_gdap_relationship(display_name, duration_days, roles, auto_extend=False)
# Passo 1: POST /tenantRelationships/delegatedAdminRelationships
#   Body: { displayName, duration: "P{n}D", accessDetails: { unifiedRoles },
#           autoExtendDuration: "P180D" ou "PT0S" }
# Passo 2: POST /tenantRelationships/delegatedAdminRelationships/{id}/requests
#   Body: { "action": "lockForApproval" }
# Passo 3: GET /tenantRelationships/delegatedAdminRelationships/{id}
# Retorna: objeto completo com inviteUrl

expire_gdap_relationship(relationship_id)
# POST /tenantRelationships/delegatedAdminRelationships/{id}/requests
# Body: { "action": "terminate" }
```

---

## Backend — novos endpoints em `m365.py`

```
GET  /m365/gdap/relationships                    → lista todas as relações
GET  /m365/gdap/customers                        → clientes com GDAP ativo
POST /m365/gdap/relationships                    → cria + retorna inviteUrl
POST /m365/gdap/relationships/{id}/terminate     → expira relação
POST /m365/gdap/relationships/{id}/send-invite   → envia inviteUrl por e-mail
  Body: { emails: ["admin@cliente.com", ...] }
  Usa email_service (SMTP já configurado no backend)
```

Todos gateados por `_require_enterprise()` + verificação `org_type == "master"` no backend.

---

## Frontend — nova página `/m365/gdap`

**Rota**: `/m365/gdap`
**Arquivo**: `frontend/src/pages/m365/GdapManager.jsx`
**Sidebar**: novo item no `M365SecondarySidebar.jsx` — ícone `Link2`, visível apenas se `isMasterOrg`

### Layout da página

```
┌─────────────────────────────────────────────────────────┐
│  GDAP Manager                              + Nova Relação│
│  Gerencie delegações de acesso aos tenants clientes      │
├─────────────────────────────────────────────────────────┤
│  [Ativas: 3]  [Pendentes: 1]  [Expirando: 0]  [Todas]  │
├─────────────────────────────────────────────────────────┤
│  Cliente Alfa S.A.          Ativa    Expira 2026-01-10  │
│  Roles: User Admin, Exchange Admin          [Expirar]   │
│                                                         │
│  Cliente Beta Ltda          Pendente aprovação...       │
│  Criada há 2 dias  [Copiar link] [✉ Reenviar] [Expirar]│
│                                                         │
│  Cliente Gama               Expira em 14 dias  ⚠️       │
│  Roles: Helpdesk Admin                      [Renovar]  │
└─────────────────────────────────────────────────────────┘
```

### Modal "Nova Relação GDAP"

```
Nome da relação  [ex: Cliente X - Suporte M365    ]
Duração          [365 dias ▼]  (90 / 180 / 365 / 730)

Roles a delegar:
  Templates rápidos:
  [Tier 1 — Suporte]  [Tier 2 — Admin]  [Full MSP]

  Ou selecionar manualmente:
  ☑ Helpdesk Administrator
  ☑ User Administrator
  ☐ Exchange Administrator
  ☐ Teams Administrator
  ☐ SharePoint Administrator
  ☐ Security Administrator
  ☐ License Administrator

  [Cancelar]          [Criar e gerar link →]
```

### Modal pós-criação — exibição do inviteUrl + envio por e-mail

```
┌────────────────────────────────────────────────────┐
│  Link gerado com sucesso!                          │
│                                                    │
│  [https://admin.microsoft.com/...] [📋 Copiar]    │
│                                                    │
│  ── Enviar por e-mail ─────────────────────────── │
│  Para  [admin@clienteX.com.br              ] [+]  │
│        [cto@clienteX.com.br               ] [x]  │
│  (pode adicionar múltiplos destinatários)          │
│                                                    │
│  [✉ Enviar convite]                               │
│                                                    │
│  Envie este link para o administrador global do    │
│  tenant cliente. Ele expira em 30 dias se não      │
│  for aprovado.                                     │
│                                      [Fechar]      │
└────────────────────────────────────────────────────┘
```

Ao clicar em **Enviar convite**:
- Frontend chama `POST /m365/gdap/relationships/{id}/send-invite`
- Backend usa o `email_service` (SMTP já configurado) para disparar o e-mail
- Template HTML do e-mail inclui: nome da relação, roles delegadas, botão CTA com o `inviteUrl`, aviso de validade 30 dias e assinatura com o nome da org master

---

## Templates de roles pré-definidos

| Template | Roles incluídas |
|----------|----------------|
| **Tier 1 — Suporte** | Helpdesk Administrator, Service Support Administrator |
| **Tier 2 — Admin** | + User Administrator, Exchange Administrator, Teams Administrator |
| **Full MSP** | + SharePoint Administrator, License Administrator, Security Reader |

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `backend/app/services/m365_service.py` | +4 métodos GDAP |
| `backend/app/api/m365.py` | +5 endpoints `/gdap/*` (inclui send-invite) |
| `frontend/src/pages/m365/GdapManager.jsx` | Novo (lista + modal criação + modal link) |
| `frontend/src/pages/m365/M365SecondarySidebar.jsx` | +1 item "GDAP" condicional a `isMasterOrg` |
| `frontend/src/services/m365Service.js` | +4 métodos GDAP |
| `frontend/src/App.jsx` (ou router) | +1 rota `/m365/gdap` |

**Nenhuma migration de banco necessária** — tudo vem do Graph API em tempo real.

---

## Observações técnicas importantes

### inviteUrl
O link gerado pelo Graph tem validade de **30 dias**. O cliente clica, é redirecionado para o
admin center da Microsoft, loga como Global Admin do tenant dele e aprova. Após aprovação,
o status da relação muda de `approvalPending` para `active`.

### Status possíveis de uma relação GDAP (completo)
| Status | Descrição |
|--------|-----------|
| `created` | Criada pelo parceiro. Pode ser editada. Sem inviteUrl ainda. |
| `approvalPending` | `lockForApproval` executado. **inviteUrl disponível.** Aguardando cliente. |
| `approved` | Cliente aprovou via inviteUrl. Sistema provisionando. |
| `activating` | Microsoft provisionando o acesso no tenant do cliente. |
| `active` | Acesso ativo e em vigor. |
| `expiring` | Próxima da data de expiração (badge ⚠️). |
| `expired` | Data de expiração atingida. Acesso removido automaticamente. |
| `terminationRequested` | Parceiro ou cliente solicitou encerramento. |
| `terminating` | Microsoft desaprovisionando o acesso. |
| `terminated` | Relação encerrada manualmente. |

### Alerta de expiração
Relações com `expiresDateTime` dentro de 30 dias devem exibir badge amarelo ⚠️ e
aparecer primeiro na lista. Considerar notificação push via `push_notification()` existente.

### Renovação
Renovar = criar nova relação com o mesmo cliente e roles. Não existe endpoint de
"extensão" — o cliente precisa aprovar novamente via novo inviteUrl.
