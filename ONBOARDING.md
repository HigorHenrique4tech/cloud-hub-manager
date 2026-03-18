# Cloud Hub Manager — Guia de Onboarding

> Guia completo para novos usuários e clientes configurarem a plataforma do zero.

---

## Índice

1. [Criando sua conta](#1-criando-sua-conta)
2. [Configurando sua Organização](#2-configurando-sua-organização)
3. [Criando um Workspace](#3-criando-um-workspace)
4. [Convidando membros da equipe](#4-convidando-membros-da-equipe)
5. [Conectando AWS](#5-conectando-aws)
6. [Conectando Azure](#6-conectando-azure)
7. [Conectando Google Cloud](#7-conectando-google-cloud)
8. [Conectando Microsoft 365](#8-conectando-microsoft-365)
9. [Planos e funcionalidades](#9-planos-e-funcionalidades)
10. [Papéis e permissões](#10-papéis-e-permissões)
11. [Para MSPs e Parceiros Microsoft (GDAP)](#11-para-msps-e-parceiros-microsoft-gdap)

---

## 1. Criando sua conta

1. Acesse a plataforma e clique em **Criar conta**
2. Preencha nome, e-mail e senha
3. Confirme o e-mail recebido (link de verificação válido por 24h)
4. Ao fazer o primeiro login, o **assistente de onboarding** será iniciado automaticamente — ele guia você pelos passos iniciais

> **Autenticação em dois fatores (MFA):** Recomendamos ativar o MFA em Configurações → Segurança após o primeiro login.

---

## 2. Configurando sua Organização

Durante o onboarding, você criará ou ingressará em uma organização.

| Campo | Descrição |
|---|---|
| Nome da organização | Nome visível para todos os membros |
| Tipo | `Standalone` (padrão), `Master` (MSP com múltiplos clientes) |
| Plano | Free / Pro / Enterprise |

O criador da organização recebe automaticamente o papel de **Owner**.

---

## 3. Criando um Workspace

Workspaces separam ambientes dentro da mesma organização (ex: Produção, Homologação, Dev).

1. No menu lateral, clique em **Workspaces → Novo Workspace**
2. Defina um nome e descrição
3. As credenciais cloud são configuradas por workspace — cada ambiente pode ter contas diferentes

> Recomendação: crie workspaces separados por ambiente (`prod`, `staging`, `dev`) e por cliente (em cenários MSP).

---

## 4. Convidando membros da equipe

1. Vá em **Organização → Membros → Convidar**
2. Informe o e-mail e selecione o papel desejado
3. O convite fica válido por 7 dias
4. O usuário convidado recebe um e-mail com link de acesso direto

Para definir permissões específicas por workspace, acesse **Workspace → Membros** e faça o override de papel.

---

## 5. Conectando AWS

### O que você precisa

Você precisará de uma **chave de acesso IAM** (Access Key ID + Secret Access Key) com as permissões necessárias.

### Passo 1 — Criar usuário IAM dedicado

No console AWS:

1. Acesse **IAM → Usuários → Criar usuário**
2. Nome sugerido: `cloudhub-readonly` (ou `cloudhub-full` para acesso com escrita)
3. Tipo de acesso: **Acesso programático**
4. Salve o **Access Key ID** e **Secret Access Key** gerados (só aparecem uma vez)

### Passo 2 — Atribuir políticas IAM

**Para leitura e monitoramento (recomendado inicialmente):**

```
ReadOnlyAccess        ← visão geral de todos os recursos
CloudWatchReadOnlyAccess
CostExplorerReadOnlyAccess
```

**Para funcionalidades de escrita (criação, start/stop de recursos):**

```
AmazonEC2FullAccess       ← ou uma política personalizada restrita
AmazonS3FullAccess
AmazonRDSFullAccess
```

**Política mínima personalizada (recomendada para produção):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*", "ec2:StartInstances", "ec2:StopInstances",
        "ec2:RebootInstances", "ec2:CreateTags",
        "s3:List*", "s3:Get*",
        "rds:Describe*", "rds:StartDBInstance", "rds:StopDBInstance",
        "cloudwatch:GetMetricData", "cloudwatch:ListMetrics",
        "ce:GetCostAndUsage", "ce:GetRecommendations",
        "iam:ListAccountAliases",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

### Passo 3 — Adicionar na plataforma

1. No workspace, clique em **Configurações → Contas Cloud → Adicionar → AWS**
2. Informe:
   - **Access Key ID**
   - **Secret Access Key**
   - **Região padrão** (ex: `us-east-1`, `sa-east-1`)
3. Clique em **Testar conexão** → salvar

---

## 6. Conectando Azure

### O que você precisa

Um **Service Principal** (Aplicativo no Azure AD) com permissão de leitura/escrita na subscription desejada.

### Passo 1 — Criar o App Registration

No portal Azure:

1. Acesse **Azure Active Directory → Registros de Aplicativo → Novo Registro**
2. Nome sugerido: `CloudHub-Connector`
3. Tipo de conta: **Conta somente neste diretório**
4. URI de redirecionamento: deixar em branco
5. Clique em **Registrar**

### Passo 2 — Criar um Client Secret

1. No app criado, vá em **Certificados e Segredos → Novo segredo do cliente**
2. Defina uma expiração (recomendado: 24 meses)
3. Copie o **Valor** do segredo imediatamente (não será exibido novamente)

### Passo 3 — Anotar os identificadores

Na página do App Registration, copie:

| Campo | Onde encontrar |
|---|---|
| **Application (Client) ID** | Visão geral do app |
| **Directory (Tenant) ID** | Visão geral do app |
| **Subscription ID** | Portal Azure → Assinaturas |
| **Client Secret** | Copiado no passo anterior |

### Passo 4 — Atribuir permissão na Subscription

1. Acesse **Assinaturas → [sua subscription] → Controle de acesso (IAM)**
2. Clique em **Adicionar atribuição de função**
3. Para **somente leitura**: papel `Leitor` (Reader)
4. Para **gerenciamento completo**: papel `Colaborador` (Contributor)
5. Selecione o app `CloudHub-Connector` como membro

> Para recursos específicos como Backup, use papéis adicionais:
> - `Colaborador de Backup` para cofres de recuperação
> - `Colaborador de Máquina Virtual` para VMs

### Passo 5 — Adicionar na plataforma

1. No workspace, clique em **Configurações → Contas Cloud → Adicionar → Azure**
2. Informe os 4 campos coletados acima
3. Clique em **Testar conexão** → salvar

---

## 7. Conectando Google Cloud

### O que você precisa

Uma **Service Account** com as permissões adequadas no projeto GCP desejado.

### Passo 1 — Criar a Service Account

No console GCP:

1. Acesse **IAM e Admin → Contas de Serviço → Criar Conta de Serviço**
2. Nome sugerido: `cloudhub-connector`
3. Clique em **Criar e continuar**

### Passo 2 — Atribuir papéis

Adicione os seguintes papéis à service account:

| Papel | Para que serve |
|---|---|
| `Viewer` | Leitura geral de todos os recursos |
| `Compute Viewer` | Listar VMs e redes |
| `Storage Object Viewer` | Listar buckets e objetos |
| `Cloud SQL Viewer` | Listar instâncias SQL |
| `Cloud Functions Viewer` | Listar Functions |
| `Billing Account Viewer` | Ver custos (se usar billing account) |

> Para gerenciamento completo, substitua `Viewer` por `Editor` nos papéis específicos.

### Passo 3 — Gerar a chave JSON

1. Na service account criada, vá em **Chaves → Adicionar Chave → Criar Nova Chave**
2. Formato: **JSON**
3. Baixe o arquivo gerado — guarde com segurança

### Passo 4 — Adicionar na plataforma

1. No workspace, clique em **Configurações → Contas Cloud → Adicionar → GCP**
2. Cole o conteúdo completo do arquivo JSON no campo **Service Account Key**
3. Informe o **Project ID** (encontrado na primeira linha do JSON como `"project_id"`)
4. Clique em **Testar conexão** → salvar

---

## 8. Conectando Microsoft 365

> Disponível apenas no plano **Enterprise**.

### O que você precisa

Um **App Registration** no Azure AD do tenant M365 com permissões de aplicativo (Application Permissions) — sem necessidade de login interativo.

### Passo 1 — Criar o App Registration

1. Acesse **portal.azure.com** com uma conta de Administrador Global
2. Vá em **Azure Active Directory → Registros de Aplicativo → Novo Registro**
3. Nome sugerido: `CloudHub-M365`
4. Tipo de conta: **Conta somente neste diretório**
5. Clique em **Registrar**

### Passo 2 — Adicionar Permissões de Aplicativo

1. No app criado, vá em **Permissões de API → Adicionar uma permissão → Microsoft Graph → Permissões de aplicativo**
2. Adicione as seguintes permissões:

#### Permissões obrigatórias (funcionalidades básicas)

| Permissão | Para que serve |
|---|---|
| `User.Read.All` | Listar e gerenciar usuários |
| `Group.Read.All` | Listar grupos e equipes |
| `GroupMember.ReadWrite.All` | Gerenciar membros de grupos |
| `Directory.Read.All` | Leitura geral do diretório |
| `Organization.Read.All` | Informações da organização |

#### Permissões para módulos específicos

| Permissão | Módulo |
|---|---|
| `Mail.ReadBasic.All` | Exchange — caixas de correio |
| `MailboxSettings.ReadWrite` | Exchange — configurações de auto-reply, fuso horário |
| `Sites.Read.All` | SharePoint — sites e bibliotecas |
| `TeamSettings.ReadWrite.All` | Teams Admin — criar, editar, arquivar times |
| `Channel.ReadBasic.All` | Teams Admin — listar canais |
| `ChannelMember.ReadWrite.All` | Teams Admin — gerenciar membros |
| `Reports.Read.All` | Relatórios de atividade (Teams, Exchange, SharePoint) |
| `AuditLog.Read.All` | Auditoria — sign-in logs e directory audit |

3. Clique em **Conceder consentimento do administrador para [seu tenant]** (botão azul no topo)
4. Confirme — todas as permissões devem ficar com status **Concedido**

### Passo 3 — Criar Client Secret

1. Vá em **Certificados e Segredos → Novo segredo do cliente**
2. Expiração recomendada: 24 meses
3. Copie o **Valor** imediatamente

### Passo 4 — Anotar os identificadores

| Campo | Onde encontrar |
|---|---|
| **Application (Client) ID** | Visão geral do App Registration |
| **Directory (Tenant) ID** | Visão geral do App Registration |
| **Client Secret** | Copiado no passo anterior |

### Passo 5 — Adicionar na plataforma

1. No workspace, vá em **Configurações → Contas Cloud → Adicionar → Microsoft 365**
2. Informe Client ID, Tenant ID e Client Secret
3. Clique em **Testar conexão** → salvar
4. Acesse o módulo M365 no menu lateral (ícone de grade 3x3)

---

## 9. Planos e funcionalidades

| Funcionalidade | Free | Pro | Enterprise |
|---|:---:|:---:|:---:|
| Dashboards de recursos (AWS/Azure/GCP) | Leitura | Leitura + Escrita | Leitura + Escrita |
| Múltiplos workspaces | 1 | Ilimitado | Ilimitado |
| FinOps (orçamentos, recomendações, relatórios) | — | Sim | Sim |
| Agendamentos (start/stop automático) | — | Sim | Sim |
| Webhooks | — | Sim | Sim |
| Inventário e exportação CSV | — | Sim | Sim |
| Microsoft 365 Admin | — | — | Sim |
| MSP — múltiplas organizações gerenciadas | — | — | Sim |
| GDAP (parceiros Microsoft) | — | — | Sim (Master org) |
| Suporte prioritário | — | — | Sim |

---

## 10. Papéis e permissões

### Papéis na Organização

| Papel | O que pode fazer |
|---|---|
| **Owner** | Tudo, incluindo deletar a organização e gerenciar plano/billing |
| **Admin** | Gerenciar membros, workspaces e integrações |
| **Operator** | Executar ações nos recursos (start/stop, criar, deletar) |
| **Viewer** | Somente leitura em todos os recursos |
| **Billing** | Acesso ao módulo financeiro/FinOps e faturas |

### Override por Workspace

É possível ter um papel diferente em workspaces específicos. Exemplo: um membro com papel `Viewer` na org pode ter papel `Operator` apenas no workspace de Homologação.

---

## 11. Para MSPs e Parceiros Microsoft (GDAP)

> Aplicável apenas a organizações do tipo **Master** no plano **Enterprise**.

### O que é GDAP?

GDAP (Granular Delegated Admin Privileges) é o mecanismo oficial da Microsoft para que parceiros do programa CSP gerenciem tenants de clientes com permissões específicas e auditáveis.

### Pré-requisito: Configurar o Service Principal

Antes de criar relações GDAP pela plataforma, é necessário provisionar o service principal da API de relações delegadas no seu tenant parceiro:

**PowerShell (executar como Administrador Global):**

```powershell
# Instalar módulo se necessário
Install-Module Microsoft.Graph -Scope CurrentUser

# Conectar ao tenant parceiro
Connect-MgGraph -Scopes "Application.ReadWrite.All"

# Provisionar o service principal GDAP
New-MgServicePrincipal -AppId "2832473f-ec63-45fb-976f-5d45a7d4bb91"
```

**Permissão necessária no App Registration do CloudHub-M365:**

Adicione a permissão:
- `DelegatedAdminRelationship.ReadWrite.All` → Permissões de aplicativo → Conceder consentimento

### Criando uma relação GDAP

1. No menu M365, clique em **GDAP** (visível apenas para organizações Master)
2. Aba **Clientes** — lista todos os clientes do Partner Center
3. Clique em **Criar GDAP** ao lado do cliente desejado
4. Configure:
   - Nome da relação
   - Duração (30 a 730 dias)
   - Papéis desejados (selecione um template ou personalizado)
   - Auto-renovação
5. Após criar, copie o **link de convite** e envie ao administrador do tenant cliente
6. O cliente precisa **aceitar o convite** no portal Microsoft 365 Admin Center
7. Após aceite, a relação fica no status **Ativa**

### Templates de papéis disponíveis

| Template | Papéis incluídos | Quando usar |
|---|---|---|
| **Tier 1 — Suporte básico** | Service Support Administrator, Global Reader, Helpdesk Administrator | Suporte N1 sem acesso administrativo completo |
| **Tier 2 — Suporte avançado** | + Exchange Administrator, User Administrator, License Manager | Suporte N2 com gestão de usuários e licenças |
| **Administração completa** | + Teams Administrator, SharePoint Administrator, Security Administrator | Gestão completa do ambiente M365 do cliente |

### Enviando o convite por e-mail

Após criar a relação, clique em **Enviar convite por e-mail**:
- Informe o e-mail do administrador do tenant cliente
- Adicione e-mails adicionais se necessário
- A plataforma envia um e-mail com o link de ativação e lista das permissões solicitadas

### Ciclo de vida das relações

| Status | Significado |
|---|---|
| `approvalPending` | Aguardando aprovação do cliente |
| `active` | Ativa — acesso concedido |
| `expiring` | Expira em menos de 30 dias |
| `expired` | Expirada — sem acesso |
| `terminationRequested` | Encerramento solicitado |

Para encerrar uma relação antecipadamente, clique em **Encerrar relação** no card correspondente.

---

## Perguntas frequentes

**Posso conectar múltiplas contas do mesmo provider?**
Sim. É possível adicionar múltiplas contas AWS, Azure e GCP por workspace.

**As credenciais ficam seguras?**
Todas as credenciais são criptografadas com Fernet (AES-128-CBC) antes de serem armazenadas no banco de dados. Nunca são expostas na interface.

**Como remover o acesso de um membro?**
Acesse **Organização → Membros**, localize o membro e clique em **Remover**. O acesso é revogado imediatamente.

**O que acontece quando o plano expira?**
Os dados são mantidos. O acesso às funcionalidades Pro/Enterprise é suspenso até a renovação. Recursos criados pela plataforma continuam funcionando normalmente nas clouds — apenas o gerenciamento pela plataforma fica restrito.

**Quanto tempo leva para as métricas atualizarem?**
Os dados de recursos têm cache de 2 a 5 minutos dependendo do tipo. Métricas de custo são atualizadas a cada 24h (limitação das APIs das provedoras de cloud).

---

*Última atualização: 2026-03-17*
