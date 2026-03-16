# Migration365 — Portal de Migração de Caixas de Correio para Microsoft 365

## Resposta direta: é possível?

**Sim — e a decisão de ser um portal separado é tecnicamente correta.**

Migrações de caixa de correio são operações longas (horas a dias), com filas de processamento,
progresso em tempo real e possibilidade de falhas parciais. Integrar isso no CloudAtlas principal
pesaria demais no backend. Um portal dedicado é o design certo.

---

## Cenários de migração suportados

| Cenário | Método | Complexidade | Observação |
|---------|--------|-------------|------------|
| **Google Workspace → M365** | IMAP via Migration Endpoint | Média | Precisa de App Password por usuário ou Service Account |
| **Exchange Server (on-prem) → M365** | Cutover / Staged / Hybrid | Alta | Portal precisa de acesso à rede interna do cliente |
| **M365 Tenant → M365 Tenant** | Cross-tenant Migration API | Alta | Requer admin consent em AMBOS os tenants |
| **IMAP genérico (Yahoo, Outlook.com, outros)** | IMAP via Migration Endpoint | Baixa | Funciona para qualquer servidor IMAP |

---

## Arquitetura do portal separado

```
migration365.cloudatlas.app.br   ← subdomínio separado

┌─────────────────────────────────────────────────────────┐
│  Frontend React (Vite + Tailwind)                       │
│  - Wizard de configuração de migração                   │
│  - Dashboard em tempo real (WebSocket)                  │
│  - Relatório por caixa de correio                       │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│  Backend FastAPI                                         │
│  - Autenticação compartilhada com CloudAtlas (JWT)      │
│  - Endpoints de configuração e controle de migração     │
│  - WebSocket para progresso em tempo real               │
└────────────┬────────────────┬────────────────────────────┘
             │                │
    ┌────────▼──────┐ ┌───────▼──────────┐
    │  Celery Worker│ │  Redis           │
    │  (tarefas de  │ │  (fila + cache   │
    │   migração)   │ │   de progresso)  │
    └────────┬──────┘ └──────────────────┘
             │
    ┌────────▼──────────────────────────────────┐
    │  Integrações externas                     │
    │  - Exchange Online (EWS / Migration API)  │
    │  - Google Workspace (IMAP + App Password) │
    │  - Exchange Server on-prem (EWS endpoint) │
    └───────────────────────────────────────────┘
```

### Compartilhamento com CloudAtlas
- **Banco de dados**: tabelas novas no mesmo PostgreSQL (prefixo `migration_*`)
- **Auth**: mesmo JWT — usuário Enterprise do CloudAtlas faz login no portal
- **Redis**: mesmo container, banco 1 separado (CloudAtlas usa banco 0)

---

## Cenário 1 — Google Workspace → M365

### Fluxo técnico
```
1. Admin cria Service Account no Google com Domain-Wide Delegation
   (ou gera App Password por usuário — menos escalável)
2. Portal gera arquivo CSV com: EmailAddress, UserName, Password
3. Portal cria Migration Endpoint no Exchange Online:
   POST outlook.office365.com → New-MigrationEndpoint -Type IMAP
   -RemoteServer imap.gmail.com -Port 993 -Security SSL
4. Portal cria Migration Batch com o CSV:
   New-MigrationBatch -Name "Batch_Gmail_001" -SourceEndpoint "Gmail-IMAP"
   -CSVData $csvBytes -AutoStart
5. Celery monitora status via Get-MigrationUserStatistics
6. Após migração: admin atualiza MX record (guiado pelo portal)
7. Portal deleta batch e encerra sincronização
```

### Permissões necessárias
- **Origem (Google)**: Admin do Google Workspace com Domain-Wide Delegation
- **Destino (M365)**: Global Admin ou Exchange Admin no tenant destino
- **IMPORTANTE**: Migração IMAP só migra **e-mails**. Calendário e contatos precisam
  de exportação manual (.ics / .csv) — portal deve informar isso ao admin.

### Limitações da documentação Microsoft
- Máximo **50.000 caixas de correio por arquivo CSV**
- Arquivo CSV máximo **10 MB**
- Velocidade limitada pela Google: pode throttle em migrações grandes
- Não migra: calendários, contatos, tarefas, chats do Google

---

## Cenário 2 — Exchange Server on-prem → M365

### Modalidades disponíveis

| Modalidade | Quando usar | Máx. caixas |
|-----------|------------|-------------|
| **Cutover** | Migrar tudo de uma vez | 150 recomendado (até 2.000) |
| **Staged** | Em lotes, Exchange 2003/2007 | Ilimitado (em batches) |
| **Hybrid** | Exchange 2010+ ou migração gradual | Ilimitado |

### ⚠️ Desafio crítico: conectividade de rede

Para o portal acessar o Exchange Server on-prem do cliente, o endpoint
EWS (`https://mail.cliente.com.br/EWS/Exchange.asmx`) precisa ser:
- Acessível via internet (HTTPS) **ou**
- O cliente instala um **agente leve** no servidor on-prem que abre
  um túnel reverso para o portal (modelo parecido com Azure Arc)

**Opção mais simples para MVP**: exigir que o cliente exponha o
Autodiscover e EWS publicamente (comum em ambientes Exchange). O portal
verifica conectividade antes de iniciar.

### Fluxo técnico (Cutover)
```
1. Portal solicita credenciais Exchange Admin + URL do EWS
2. Testa conectividade: GET https://mail.cliente.com/EWS/Exchange.asmx
3. Cria Migration Endpoint no Exchange Online apontando para o EWS on-prem
4. Cria Migration Batch (cutover ou staged)
5. Monitora progresso via Get-MigrationBatch / Get-MigrationUser
6. Ao completar: guia admin para atualizar MX e DNS
7. Remove endpoint e batch
```

### Bibliotecas Python para EWS
```python
# exchangelib — cliente EWS Python
pip install exchangelib

from exchangelib import Credentials, Account, Configuration, DELEGATE
creds = Credentials('admin@empresa.local', 'senha')
config = Configuration(server='mail.empresa.com.br', credentials=creds)
account = Account('user@empresa.com.br', config=config, access_type=DELEGATE)
# → pode listar/mover caixas de correio via MAPI over HTTP
```

---

## Cenário 3 — M365 Tenant A → M365 Tenant B (Cross-Tenant)

### Pré-requisitos (ambos os tenants)
1. **Tenant origem**: Criar app `MailboxMigration` com permissão
   `Exchange.ManageAsApp` + certificado
2. **Tenant destino**: Criar `Organization Relationship` apontando para o tenant origem
3. **Usuários destino**: Criar como `MailUser` (não Mailbox) com o atributo `ExchangeGuid`
   mapeado para o Guid da caixa de correio de origem

### Fluxo via API
```
# Origem: criar o Migration Endpoint cross-tenant
New-MigrationEndpoint -Name "CrossTenant-A-to-B"
  -Type ExchangeRemoteMove
  -RemoteTenant "tenantB.onmicrosoft.com"
  -ApplicationId "<app_id>"
  -AppSecretKeyVaultUrl "<cert_url>"

# Criar batch
New-MigrationBatch -Name "CrossTenant-Batch-001"
  -SourceEndpoint "CrossTenant-A-to-B"
  -CSVData $csv  # EmailAddress = UPN no tenant destino
  -TargetDeliveryDomain "tenantB.mail.onmicrosoft.com"
  -AutoStart
```

### Complexidade alta — por quê?
- Requer admin consent em **ambos** os tenants
- Os usuários precisam ser pre-provisionados no tenant destino como MailUser
- O `ExchangeGuid` precisa ser sincronizado manualmente ou via script
- Portal precisa orquestrar **dois** tenants simultaneamente

---

## Como o portal chama as APIs de migração

A Microsoft **não expõe migração como Graph API REST direta**.
O mecanismo oficial é via **Exchange Online PowerShell** (ou EWS).

### Opção A — PowerShell subprocess (MVP rápido)
```python
import subprocess

def run_exo_command(command: str, tenant_token: str) -> str:
    # Usa ExchangeOnlineManagement module via PowerShell
    ps_script = f"""
    Import-Module ExchangeOnlineManagement
    Connect-ExchangeOnline -AccessToken '{tenant_token}'
    {command}
    Disconnect-ExchangeOnline -Confirm:$false
    """
    result = subprocess.run(
        ["pwsh", "-Command", ps_script],
        capture_output=True, text=True, timeout=60
    )
    return result.stdout
```
**Contra**: requer PowerShell Core instalado no container do backend.

### Opção B — Exchange Online REST API (undocumented/beta)
```
Base URL: https://outlook.office365.com/adminapi/beta/{tenantId}/
Endpoints:
  GET  /Migration/Batch          → listar batches
  POST /Migration/Batch          → criar batch
  GET  /Migration/Batch/{id}     → status do batch
  POST /Migration/Batch/{id}/Start
  POST /Migration/Batch/{id}/Complete
  DELETE /Migration/Batch/{id}
```
**Pro**: REST puro, sem PowerShell. **Contra**: não é documentada oficialmente,
pode mudar sem aviso. Usada internamente pelo EAC.

### Opção C — Microsoft Graph (limitado)
Graph API não tem endpoints de migração de mailbox diretamente,
mas pode ser usada para:
- Criar usuários e mailboxes no destino
- Verificar status de licenças
- Criar/listar distribution groups

**Recomendação para MVP**: Opção A (PowerShell) para começar, migrar para B conforme necessidade.

---

## Interface do portal — wireframes

### Tela 1 — Dashboard de migrações

```
┌──────────────────────────────────────────────────────────────────────┐
│  Migration365                                    + Nova Migração      │
│  Portal de migração de caixas de correio para Microsoft 365          │
├──────────────────────────────────────────────────────────────────────┤
│  [Em andamento: 2]  [Concluídas: 5]  [Com erro: 0]  [Agendadas: 1]  │
├──────────────────────────────────────────────────────────────────────┤
│  Empresa Alfa — Gmail → M365                                         │
│  ████████████████░░░░  82% · 164 / 200 caixas · ~45min restantes    │
│  Iniciado: 14/03/2026 09:00                          [Pausar] [Log]  │
│                                                                      │
│  Empresa Beta — Exchange → M365          ⚠️ 3 erros                 │
│  ████████░░░░░░░░░░░░  40% · 40 / 100 caixas                        │
│  Iniciado: 14/03/2026 11:30               [Ver erros] [Pausar]      │
└──────────────────────────────────────────────────────────────────────┘
```

### Tela 2 — Wizard "Nova Migração" (4 passos)

```
Passo 1 — Origem
  ○ Google Workspace (Gmail)
  ● Exchange Server (on-premises)
  ○ M365 Tenant A → Tenant B
  ○ Outro servidor IMAP

Passo 2 — Credenciais e conectividade
  Tenant destino M365: [empresa.onmicrosoft.com          ]
  App Registration Client ID: [________________________  ]
  Client Secret: [______________________________________ ]
  [Testar conexão ✓]

  Origem Exchange:
  EWS URL: [https://mail.empresa.com.br/EWS/Exchange.asmx]
  Admin:   [admin@empresa.local                          ]
  Senha:   [****                                         ]
  [Testar conexão ✓]

Passo 3 — Caixas de correio
  ○ Importar CSV (EmailAddress, UserName, Password)
  ● Descobrir automaticamente via API da origem

  [Descobrir caixas de correio]
  Encontradas: 200 caixas · 450 GB total

  Selecionar: [Todas] [Nenhuma] [Filtrar...]
  ☑ user1@empresa.com  (2.3 GB)
  ☑ user2@empresa.com  (1.1 GB)
  ...

Passo 4 — Agendamento
  ○ Iniciar imediatamente
  ● Agendar para: [15/03/2026 02:00]

  Tamanho do lote:  [50 caixas por batch  ▼]
  Auto-completar:   ☑ Sim — mudar MX ao finalizar
  Notificar admin:  [admin@parceiro.com.br          ]

  [← Voltar]  [Criar e agendar migração →]
```

### Tela 3 — Detalhe de uma migração (tempo real)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Empresa Alfa — Gmail → M365                    [Pausar] [Cancelar] │
│  Batch: Gmail-Alfa-001 · Iniciado: 14/03 09:00                      │
├─────────────────────────────────────────────────────────────────────┤
│  ████████████████████░░░░  82%  164 / 200 caixas                    │
│                                                                     │
│  ✅ Concluídas: 164   ⏳ Em andamento: 3   ❌ Erro: 0  ⏸ Fila: 33  │
├─────────────────────────────────────────────────────────────────────┤
│  Caixa de correio              Status        Tamanho    Duração     │
│  ─────────────────────────────────────────────────────────────────  │
│  ana.lima@empresa.com          ✅ Concluída   1.2 GB    4min        │
│  bruno.silva@empresa.com       ✅ Concluída   850 MB    3min        │
│  carlos.mendes@empresa.com     ⏳ Sincroniz.  2.1 GB    —           │
│  diana.costa@empresa.com       ⏸ Na fila      400 MB    —           │
│  ...                                                                │
├─────────────────────────────────────────────────────────────────────┤
│  Próximos passos após conclusão:                                    │
│  1. ✅ Caixas migradas                                              │
│  2. ⏳ Atualizar registro MX do domínio                             │
│  3. ⏳ Aguardar propagação DNS (até 72h)                            │
│  4. ⏳ Encerrar sincronização com Gmail                             │
│  5. ⏳ Instruir usuários a importar calendário e contatos           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Stack técnica recomendada

### Backend
```
Python 3.12 + FastAPI
Celery 5.x + Redis (tarefas assíncronas de migração)
exchangelib (EWS client para Exchange on-prem)
asyncio + websockets (progresso em tempo real)
PowerShell Core 7 (no container, para cmdlets EXO)
PostgreSQL (compartilhado com CloudAtlas)
```

### Frontend
```
React 18 + Vite + Tailwind (mesma stack do CloudAtlas)
@tanstack/react-query (queries de status)
recharts (barra de progresso e estatísticas)
socket.io-client (WebSocket para progresso live)
```

### Infraestrutura
```yaml
# Novo serviço no docker-compose.prod.yml
migration-backend:
  build: infra/docker/migration.Dockerfile
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - REDIS_URL=redis://redis:6379/1   # banco 1, separado do CloudAtlas

migration-celery:
  command: celery -A migration_worker worker --concurrency=4

migration-frontend:
  # build separado, serve em /migration ou subdomínio
```

### Caddyfile — novo bloco
```
migration.cloudatlas.app.br {
    reverse_proxy /api/* migration-backend:8001
    reverse_proxy /ws/*  migration-backend:8001
    reverse_proxy /*     migration-frontend:80
}
```

---

## Banco de dados — novas tabelas (migration_*)

```sql
migration_jobs (
  id, org_id, created_by, name, type,       -- google|exchange|cross_tenant|imap
  status,                                    -- pending|running|paused|completed|failed
  source_config jsonb,                       -- credenciais origem (criptografadas)
  dest_config jsonb,                         -- credenciais destino (criptografadas)
  total_mailboxes, completed, failed,
  started_at, completed_at, created_at
)

migration_mailboxes (
  id, job_id, source_email, dest_email,
  status,                                    -- queued|syncing|completed|failed
  size_bytes, items_migrated,
  error_message, started_at, completed_at
)

migration_logs (
  id, job_id, mailbox_id, level, message, created_at
)
```

---

## Tempos de migração — dados oficiais Microsoft

> Fonte: documentação oficial `performance-and-migration-limits` do Exchange Online.
> Valores são P50 (mediana) e P90 (90º percentil) em dias de calendário.
> **⚠️ CAIXAS > 200 GB NÃO SÃO SUPORTADAS em nenhum cenário.**

### Exchange on-prem → M365

| Tamanho da caixa | P50 (dias) | P90 (dias) |
|-----------------|-----------|-----------|
| 0 – 10 GB       | 1         | 3         |
| 10 – 50 GB      | 2         | 6         |
| 50 – 100 GB     | 4         | 13        |
| 100 – 200 GB    | 10        | 31        |
| > 200 GB        | ❌ NÃO SUPORTADO | — |

### Cross-Tenant (M365 → M365)

| Tamanho da caixa | P50 (dias) | P90 (dias) |
|-----------------|-----------|-----------|
| 0 – 10 GB       | 1         | 1         |
| 10 – 50 GB      | 1         | 2         |
| 50 – 100 GB     | 2         | 5         |
| 100 – 200 GB    | 3         | 6         |
| > 200 GB        | ❌ NÃO SUPORTADO | — |

### Google Workspace / Gmail → M365

| Tamanho da caixa | P50 (dias) | P90 (dias) |
|-----------------|-----------|-----------|
| 0 – 10 GB       | 1         | 2         |
| 10 – 50 GB      | 1         | 8         |
| 50 – 100 GB     | 3         | 12        |
| 100 – 200 GB    | 5         | 19        |
| > 200 GB        | ❌ NÃO SUPORTADO | — |

### IMAP genérico → M365

| Tamanho da caixa | P50 (dias) | P90 (dias) |
|-----------------|-----------|-----------|
| 0 – 10 GB       | 1         | 1         |
| 10 – 50 GB      | 1         | 2         |
| 50 – 100 GB     | 1         | 8         |
| 100 – 200 GB    | 3         | 29        |
| > 200 GB        | ❌ NÃO SUPORTADO | — |

> **Implicação para o portal**: antes de iniciar, exibir estimativa de duração com base no tamanho total.
> Bloquear caixas > 200 GB com mensagem explicativa ("Caixas acima de 200 GB não são suportadas pela Microsoft").

---

## Formatos de credencial IMAP por servidor de origem

O campo `UserName` no CSV de migração varia conforme o servidor IMAP de origem:

| Servidor IMAP | Formato do campo UserName | Observação |
|--------------|--------------------------|-----------|
| Exchange IMAP | `Domain/Admin_UserName/User_UserName` | Domínio Windows + conta admin + usuário final |
| Dovecot (SASL) | `User_UserName*Admin_UserName` | Separador asterisco |
| Mirapoint | `#user@domain#Admin_Name#` | Formato próprio com `#` |
| Courier IMAP | `User_UserName` | Precisa de pastas virtuais compartilhadas configuradas; coluna opcional `UserRoot` no CSV |
| Gmail / Google Workspace | `user@dominio.com` | Usa App Password ou OAuth2 via Service Account |
| IMAP genérico | `user@dominio.com` | Autenticação básica com senha por usuário |

> **Importante**: o portal deve exibir o formato correto dinamicamente conforme o tipo de servidor selecionado no wizard.

---

## Cenário 3 — Cross-Tenant: detalhes e restrições (dados oficiais Microsoft)

### Recomendação de escala

| Volume de usuários | Recomendação |
|-------------------|-------------|
| < 500 usuários | Script PowerShell nativo via portal |
| ≥ 500 usuários | Ferramenta de terceiros (BitTitan MigrationWiz, CodeTwo Office 365 Migration, Quest/Binary Tree) |

> A própria Microsoft recomenda explicitamente ferramentas de terceiros para migrações cross-tenant acima de 500 usuários.

### Pré-requisitos detalhados (ordem obrigatória)

```
1. [72h antes] Verificar domínio no tenant DESTINO (propagação DNS)
2. [24h antes] Desabilitar sincronização de diretório (DirSync/AAD Connect) no tenant ORIGEM
3. Remover o domínio a ser migrado do tenant ORIGEM
   (um domínio não pode existir em dois tenants simultaneamente)
4. Pre-provisionar usuários no tenant DESTINO como MailUser (não Mailbox):
   - ExchangeGuid = Guid da caixa no tenant origem
   - TargetAddress = user@tenantdestino.mail.onmicrosoft.com
5. Criar Migration Endpoint cross-tenant em AMBOS os tenants
6. Executar migração em múltiplos passes para >500 usuários:
   Passe 1: migrar contatos e calendários
   Passe 2: 1 semana de pré-stage (sincronização de e-mails recentes)
   Passe 3: migração final do histórico
7. Pós-migração: usuários devem limpar o cache de Autocompletar do Outlook
   (File → Options → Mail → Empty Auto-Complete List)
```

### Implicação para o portal

- Wizard cross-tenant deve ter um **checklist de pré-requisitos** que o admin confirma antes de iniciar
- Portal deve detectar se o domínio ainda existe no tenant origem antes de criar o batch
- Exibir aviso de limpeza do cache do Outlook no relatório pós-migração

---

## Limitações importantes a documentar para o cliente

| Limitação | Impacto |
|-----------|---------|
| **Caixas > 200 GB não suportadas** | Caixas acima desse limite precisam de estratégia especial (arquivo + split) |
| IMAP só migra e-mails | Calendário e contatos precisam de exportação manual |
| Cutover máx. 150-2000 caixas | Acima de 150 usar Staged ou Hybrid |
| Velocidade limitada pela Google | Google aplica throttling em migrações grandes |
| Exchange on-prem precisa de EWS exposto | Cliente precisa liberar acesso externo ao EWS |
| Cross-tenant requer admin dos 2 tenants | Processo mais burocrático |
| Cross-tenant: domínio não pode existir nos 2 tenants | Remover do origem antes de adicionar ao destino |
| Cross-tenant ≥ 500 usuários | Microsoft recomenda ferramentas de terceiros (BitTitan, CodeTwo, Quest) |
| Propagação MX pode levar 72h | Janela de manutenção necessária |
| Cache de Autocompletar do Outlook | Usuários precisam limpar após cross-tenant |
| Migração não é instantânea | Grandes caixas (100-200 GB) podem levar até 31 dias (P90) |

---

## Fases de desenvolvimento recomendadas

### Fase 1 — MVP (Google Workspace + IMAP)
- [ ] Setup do portal separado (FastAPI + React + Celery)
- [ ] Wizard de configuração para Gmail/IMAP
- [ ] Criação de Migration Endpoint via PowerShell
- [ ] Upload/geração de CSV
- [ ] Polling de status + dashboard básico
- [ ] Notificação por e-mail ao concluir

### Fase 2 — Exchange Server on-prem
- [ ] Teste de conectividade EWS
- [ ] Suporte a Cutover e Staged migration
- [ ] Guia pós-migração (MX, DNS)

### Fase 3 — Cross-Tenant M365 → M365
- [ ] Wizard de configuração dos dois tenants
- [ ] Pre-provisioning de MailUsers no destino
- [ ] Sincronização de ExchangeGuid
- [ ] Migration batch cross-tenant

### Fase 4 — Recursos avançados
- [ ] Estimativa de tempo e custo antes de iniciar
- [ ] Migração parcial (por data, por pasta)
- [ ] Relatório PDF exportável para o cliente
- [ ] Webhook para notificar sistemas externos ao concluir
