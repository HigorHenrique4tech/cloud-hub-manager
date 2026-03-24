# CloudAtlas — Apresentação Comercial

## Visão Geral

O **CloudAtlas** é uma plataforma SaaS de gestão multi-cloud que unifica o gerenciamento de **AWS, Azure, Google Cloud e Microsoft 365** em um único painel. Projetada para empresas, MSPs e consultorias de TI, a plataforma elimina a necessidade de alternar entre múltiplos consoles, reduz custos operacionais com FinOps inteligente e oferece automação, segurança e controle total sobre a infraestrutura de nuvem.

**Stack tecnológico:** FastAPI (Python) + React 18 + PostgreSQL + Tailwind CSS
**Modelo de negócio:** SaaS com planos Free, Pro e Enterprise

---

## Público-Alvo

- **Empresas de médio e grande porte** que usam múltiplos provedores de nuvem
- **MSPs (Managed Service Providers)** que gerenciam a nuvem de múltiplos clientes
- **Consultorias de TI** que precisam de visibilidade centralizada
- **Equipes de FinOps** focadas em otimização de custos
- **Gestores de TI** que precisam de controle e governança

---

## Funcionalidades por Módulo

### 1. Dashboard Centralizado

O dashboard é a porta de entrada da plataforma, oferecendo visão instantânea de toda a infraestrutura:

- **Widgets customizáveis** com drag-and-drop para reorganização
- **Resumo de recursos** por provedor (VMs, storage, bancos de dados, redes)
- **Indicadores de custo** em tempo real (gasto atual, projeção mensal, variação)
- **Alertas ativos** e tarefas pendentes
- **Agendamentos próximos** com contagem regressiva
- **Atividade recente** com log de ações da equipe

---

### 2. Gerenciamento AWS

Painel completo para administração de recursos Amazon Web Services:

- **EC2 (Instâncias):** Listar, iniciar, parar, visualizar detalhes (CPU, memória, discos, IPs, security groups), criar novas instâncias
- **S3 (Armazenamento):** Listar buckets, navegar objetos, gerenciar políticas de ciclo de vida
- **RDS (Bancos de Dados):** Listar instâncias, criar snapshots, restaurar backups
- **Lambda (Funções Serverless):** Listar funções, visualizar código, testar invocação, monitorar métricas
- **VPC (Redes):** Topologia de rede, subnets, VPC peering, tabelas de rotas
- **Security (Segurança):** Auditoria de security groups, revisão de IAM, varredura de conformidade
- **Backup:** Gerenciamento de vaults, pontos de recuperação, restauração
- **Advisor:** Recomendações de custo, performance, confiabilidade e segurança

---

### 3. Gerenciamento Azure

Painel completo para administração de recursos Microsoft Azure:

- **Virtual Machines:** Listar, iniciar, parar, deallocar, criar VMs com wizard completo (OS presets, VNet inline, validação de SKU por região, discos de dados), operações em lote
- **Storage Accounts:** Criar, deletar, visualizar detalhes (segurança, endpoints, replicação)
- **Virtual Networks:** CRUD completo de VNets, gerenciamento de subnets, VNet peering com configuração de gateway/forwarding
- **Bancos de Dados SQL:** Gerenciamento de servidores e databases, regras de firewall
- **App Services:** Listar, iniciar, parar, criar, operações em lote, visualizar configuração
- **Backup:** Snapshots de discos gerenciados, Recovery Services Vaults, políticas de backup, proteção de VMs, backup sob demanda, monitoramento de jobs
- **Segurança:** Varredura de misconfigurações (storage público, NSGs abertos, discos não criptografados)
- **Advisor:** Recomendações categorizadas por impacto (custo, segurança, confiabilidade, performance)

---

### 4. Gerenciamento Google Cloud

Painel completo para administração de recursos GCP:

- **Compute Engine:** Listar, iniciar, parar VMs, criar snapshots, gerenciar metadados
- **Cloud Storage:** Listar buckets, gerenciar objetos e permissões
- **Cloud SQL:** Listar instâncias, backups, replicação
- **Cloud Functions:** Listar funções, implantações, logs de execução
- **VPC Networks:** Redes, subnets, firewalls, peering
- **Segurança:** Cloud Armor, auditoria de IAM, varredura de vulnerabilidades
- **Backup:** Vaults de backup, pontos de recuperação, políticas
- **Advisor:** Recomendações de custo, performance e segurança

---

### 5. Microsoft 365 (Enterprise)

Módulo completo de administração do tenant Microsoft 365 — exclusivo para plano Enterprise:

- **Dashboard:** Saúde do tenant, usuários ativos, consumo de licenças, armazenamento utilizado
- **Gerenciamento de Usuários:** Criar, editar, desabilitar, resetar senha, atribuir licenças, gerenciar grupos, criar Temporary Access Pass (TAP), revogar sessões, visualizar métodos de MFA
- **Licenças:** Inventário de SKUs, atribuição e remoção em lote
- **SharePoint Admin:** Visão geral de armazenamento, navegação de sites, gerenciamento de bibliotecas e drives
- **Exchange Admin:** Lista de caixas de correio, configuração de resposta automática e fuso horário, análise de atividade de e-mail
- **Teams Admin:** Criar, editar, arquivar times; CRUD de canais; gerenciar membros e roles (owner/member); atividade de 30 dias
- **Auditoria:** Logs de sign-in com filtros, auditoria de diretório, exportação de relatórios
- **GDAP Manager:** Gerenciamento de relacionamentos delegados com parceiros, aprovações pendentes, controle de roles

---

### 6. Análise de Custos

Visão completa e detalhada dos gastos em todas as nuvens:

- **Seletor de período** com presets (30d, 90d, 6m, 1 ano) e datas customizadas
- **Filtro por provedor** (AWS, Azure, GCP ou todos)
- **Comparação de períodos** (período atual vs anterior)
- **4 métricas-chave:** Total gasto, média diária, projeção mensal, serviço mais caro
- **Gráficos interativos:**
  - Tendência de custo ao longo do tempo (linha)
  - Breakdown por serviço (barras)
  - Distribuição por provedor (barras empilhadas)
  - Heatmap de gastos (dia da semana × hora)
- **Drill-down por serviço** com drawer de detalhes
- **Alertas de custo** configuráveis com notificação
- **Exportação** em CSV e relatório PDF

---

### 7. FinOps — Otimização Inteligente de Custos (Pro+)

Motor de otimização de custos com IA que identifica desperdícios e sugere ações:

#### Recomendações
- Identificação automática de oportunidades de economia (redimensionar, parar, consolidar, reservar)
- Classificação por severidade (Low, Medium, High, Critical)
- **Aplicação com 1 clique** ou via fluxo de aprovação
- **Rollback** de ações aplicadas
- Seleção em lote para aplicar/descartar múltiplas recomendações
- Filtros por status, provedor e severidade
- Exportação CSV e impressão PDF

#### Orçamentos
- Criar orçamentos mensais com limites e alertas (50%, 80%, 100%)
- Acompanhamento atual vs orçado com gráfico de progresso
- Notificações automáticas ao cruzar limiares

#### Relatórios Automatizados
- Agendamento diário, semanal ou mensal
- Envio por e-mail para lista de distribuição
- PDF com gráficos, resumos e recomendações

#### Detecção de Anomalias
- Identificação automática de gastos fora do padrão
- Confirmação/descarte de anomalias
- Agrupamento por provedor

#### Histórico de Ações
- Log completo de recomendações aplicadas
- Histórico de rollbacks
- Filtro por provedor

---

### 8. Inventário Multi-Cloud

Catálogo unificado de todos os recursos em todas as nuvens:

- Tabela com: Provedor, Tipo, Nome, ID, Resource Group, Status, Região, Especificações
- Filtros por provedor e tipo de recurso
- **Exportação CSV** para planilhas
- Paginação (50 por página)
- Atualização de cache sob demanda

---

### 9. Agendamentos e Automação (Pro+)

#### Agendamentos
- Criar schedules para ligar/desligar recursos automaticamente
- Configuração via cron (diário, semanal, mensal)
- Seleção de timezone
- Cards com próxima execução e histórico

#### Políticas Inteligentes
- Automação baseada em gatilhos (avaliação a cada 15 minutos)
- **Métricas monitoradas:** aumento de custo %, custo absoluto, contagem de instâncias, anomalia detectada, uso de CPU %, uso de memória %
- **Operadores:** maior que, menor que, aumento percentual
- **Ações automáticas:** Notificar, Criar Aprovação, Parar Instância, Desabilitar Agendamento
- Logs de execução com timestamps e valores reais

---

### 10. Fluxo de Aprovações

Sistema de governança para ações sensíveis:

- Abas: Pendente, Aprovada, Rejeitada, Cancelada
- Informações por solicitação: tipo de ação, recurso, solicitante, economia estimada, notas
- Aprovação/rejeição com notas opcionais
- Visualização expandida com payload JSON e informações do resolvedor
- Trilha de auditoria completa
- Badge de contagem na sidebar para itens pendentes

---

### 11. Notificações e Webhooks (Pro+)

Sistema de notificações em tempo real:

- **Canais suportados:** Microsoft Teams, Telegram
- **14 tipos de eventos** assinables (custo, segurança, recurso, backup, etc.)
- Criação/edição de canais com validação
- **Teste individual** por canal
- Assinatura HMAC-SHA256 para verificação de integridade
- Limite de 10 webhooks por workspace

---

### 12. Logs de Atividade

Trilha de auditoria completa de todas as ações na plataforma:

- Filtros: Ação, Provedor, Período, E-mail do usuário
- Tabela: Timestamp, Usuário, Ação, Recurso, Provedor, Status
- **Exportação CSV** para compliance
- Paginação (50 por página)

---

### 13. Faturamento e Billing

Controle financeiro integrado:

- Card do plano atual com lista de funcionalidades
- Informações de trial (dias restantes, status)
- Métricas de uso com barras de progresso (workspaces, membros, chamadas API, storage)
- Histórico de pagamentos com download de invoices em PDF
- Para orgs Enterprise/MSP: resumo de billing por organização parceira
- **Integração com gateway de pagamento** (AbacatePay)
- Configuração de billing automático (geração, valor padrão, dia de vencimento, lembretes)

---

### 14. Multi-Tenancy e Organizações

Arquitetura multi-tenant completa para empresas e MSPs:

#### Organizações
- Criar organizações com nome, slug e tipo
- **3 tipos de org:** Standalone, Master (MSP), Partner (cliente do MSP)
- Convidar membros com 5 níveis de role: Owner, Admin, Operator, Viewer, Billing
- Gerenciar convites pendentes (reenviar, revogar)
- Notas internas e status de suspensão

#### Workspaces
- Isolamento lógico de recursos dentro de uma org
- Credenciais cloud independentes por workspace
- Configuração de moeda e câmbio por workspace
- Gerenciamento de membros por workspace

#### Organizações Gerenciadas (Enterprise/MSP)
- Painel de organizações parceiras
- Visualizar: membros, gastos, plano de cada parceiro
- Adicionar novos parceiros
- **Customizar branding por parceiro** (logo, cores, nome)
- Badge de "Marca herdada" vs "Marca personalizada"

---

### 15. White Label (Enterprise)

Personalização completa da plataforma com a marca do cliente:

- **Nome da Plataforma:** Substitui "CloudAtlas" em toda a interface, e-mails e relatórios
- **Logo Customizado:** Upload de logo para fundo claro e fundo escuro (PNG, SVG, WebP, máx 300KB)
- **Favicon Dinâmico:** Upload de favicon que atualiza a aba do navegador em tempo real
- **Cores Personalizadas:** Cor primária e cor accent com color picker e input hex
- **Toggle "Powered by CloudAtlas":** Opção de exibir ou ocultar crédito no rodapé
- **Nome do Remetente:** Personalizar o nome que aparece nos e-mails enviados
- **Preview ao vivo:** Pré-visualização da sidebar e e-mail com as customizações
- **Herança para orgs filhas:** Parceiros herdam automaticamente o branding da org master
- **Branding por parceiro:** Admin da org master pode customizar marca de cada parceiro individualmente
- **Aplicação completa:** Sidebar, header, título da aba, favicon, e-mails, relatórios PDF — tudo personalizado
- **Reset instantâneo:** Botão para resetar tudo para o padrão com atualização em tempo real (sem reload)

---

### 16. Sistema de Trial (30 dias Pro)

Experiência de trial completa para conversão de leads:

- **30 dias grátis** do plano Pro ao criar organização
- Banner de countdown com cores progressivas de urgência
- Badge "Trial Pro" no header
- E-mails de lembrete automáticos (7, 3 e 1 dia antes do vencimento)
- Resumo de economia FinOps nos e-mails de lembrete
- Administrador pode estender ou expirar trial via painel admin

---

### 17. Multi-Moeda (BRL ↔ USD)

Suporte completo para Real Brasileiro e Dólar:

- Toggle de moeda no header (USD / R$)
- Taxa de câmbio automática via API do Banco Central (BCB) com cache de 1 hora
- Opção de taxa manual para controle do cliente
- Conversão aplicada em: custos, orçamentos, recomendações, relatórios
- Configuração por organização nas settings

---

### 18. Painel Administrativo (System Admin)

Ferramentas de gestão da plataforma:

#### Leads
- Pipeline de vendas com status (Novo, Contatado, Convertido, Perdido)
- Detalhes expandidos com notas
- Exportação CSV

#### Organizações
- Lista completa com: Nome, Plano, Membros, Gasto (MTD), Status, Trial
- Ações: ver detalhes, estender/expirar trial, suspender, alterar plano

#### Billing
- Registros de cobrança com status
- Ações: reenviar e-mail, marcar como pago/vencido/cancelado/reembolsado
- Configuração global de billing (auto-geração, valor padrão, dia de vencimento)
- **Analytics:** MRR, churn, distribuição por plano, ARPU

---

### 19. Relatórios e Exportação

Geração de documentos para gestão e compliance:

- **Relatório Executivo PDF:** Gerado sob demanda com gráficos, resumos e recomendações — personalizado com branding white-label
- **Relatório de Custos PDF:** Breakdown detalhado por serviço e recurso
- **Exportação CSV:** Disponível em custos, inventário, logs, leads e recomendações
- **E-mails automatizados:** Relatórios agendados enviados por e-mail com branding da organização

---

### 20. Tarefas em Background

Sistema de execução assíncrona para operações longas:

- Criação de VMs, storage accounts e outros recursos retornam imediatamente (HTTP 202)
- **Banner flutuante** mostra progresso de tarefas ativas
- **Toast de conclusão** com auto-dismiss de 6 segundos
- Polling automático a cada 4 segundos
- Histórico de tarefas consultável

---

### 21. Segurança e Compliance

Camadas de segurança em toda a plataforma:

- **Criptografia por organização** (Fernet AES-128) para credenciais cloud
- **Autenticação JWT** (HS256) com refresh token
- **OAuth** com Google, GitHub e Microsoft
- **RBAC** com 5 níveis de role e permissões granulares
- **Fluxo de aprovação** para ações sensíveis
- **Trilha de auditoria** completa (login, alterações, ações em recursos)
- **Suporte a MFA** (Microsoft 365)
- **Verificação de e-mail** obrigatória
- **Webhooks assinados** com HMAC-SHA256
- **HTTPS/TLS** para todo o tráfego

---

## Planos e Preços

| Funcionalidade | Free | Pro | Enterprise |
|---|:---:|:---:|:---:|
| Dashboard multi-cloud | ✅ | ✅ | ✅ |
| AWS + Azure + GCP | ✅ | ✅ | ✅ |
| Inventário multi-cloud | ✅ | ✅ | ✅ |
| Logs de atividade | ✅ | ✅ | ✅ |
| Até 1 workspace | ✅ | — | — |
| Workspaces ilimitados | — | ✅ | ✅ |
| FinOps + Recomendações | — | ✅ | ✅ |
| Agendamentos + Políticas | — | ✅ | ✅ |
| Webhooks + Notificações | — | ✅ | ✅ |
| Aprovações | — | ✅ | ✅ |
| Relatórios PDF | — | ✅ | ✅ |
| Microsoft 365 | — | — | ✅ |
| White Label | — | — | ✅ |
| Orgs Gerenciadas (MSP) | — | — | ✅ |
| Painel Admin | — | — | ✅ |
| GDAP Manager | — | — | ✅ |
| Suporte prioritário | — | — | ✅ |

---

## Diferenciais Competitivos

1. **Painel Único Multi-Cloud** — AWS, Azure, GCP e Microsoft 365 em uma única interface, sem alternar entre consoles
2. **FinOps com IA** — Recomendações automáticas de economia com aplicação em 1 clique e rollback
3. **Automação Inteligente** — Políticas baseadas em gatilhos com avaliação contínua (CPU, custo, anomalias)
4. **White Label Completo** — MSPs podem apresentar a plataforma como produto próprio, sem custo de desenvolvimento
5. **Governança e Compliance** — Fluxo de aprovação, auditoria completa e RBAC granular
6. **Trial de 30 Dias** — Experiência completa do plano Pro sem cartão de crédito
7. **Multi-Moeda Nativa** — Suporte a BRL e USD com câmbio automático do Banco Central
8. **Criação de Recursos Inteligente** — Wizard com validação de SKU por região, criação inline de VNet/Subnet, presets de OS
9. **Relatórios Executivos** — PDFs personalizados com a marca da empresa para apresentar a clientes e diretoria
10. **MSP-Ready** — Arquitetura multi-tenant com organizações master/partner, billing por parceiro e branding individual

---

## Arquitetura Técnica (Resumo)

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React 18)                │
│  Vite + Tailwind CSS + React Router + React Query   │
│  Code Splitting (lazy loading) + Prefetch on Hover  │
└──────────────────────┬──────────────────────────────┘
                       │ REST API (JSON)
┌──────────────────────▼──────────────────────────────┐
│                 Backend (FastAPI)                     │
│  SQLAlchemy ORM + Alembic Migrations + JWT Auth     │
│  APScheduler + Background Tasks + Fernet Encryption │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              PostgreSQL Database                     │
│  Per-org encryption keys + Audit trail              │
└─────────────────────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    ┌─────────┐  ┌──────────┐  ┌─────────┐
    │   AWS   │  │  Azure   │  │   GCP   │
    │   SDK   │  │   SDK    │  │   SDK   │
    └─────────┘  └──────────┘  └─────────┘
                       │
                 ┌─────▼─────┐
                 │ Microsoft │
                 │ Graph API │
                 └───────────┘
```

---

## Roteiro para Vídeo Demonstrativo

### Cena 1 — Login e Dashboard (30s)
- Login com OAuth Google
- Dashboard com widgets de custo, recursos e alertas
- Mostrar drag-and-drop dos widgets

### Cena 2 — Gestão Multi-Cloud (60s)
- Navegar para Azure → VMs → mostrar lista com status
- Iniciar uma VM parada → toast de sucesso
- Abrir drawer de detalhes (OS, discos, rede, métricas)
- Criar VM pelo wizard (escolher OS preset, região, VNet inline)
- Mostrar task notification do background

### Cena 3 — Custos e FinOps (45s)
- Abrir página de Custos → gráfico de tendência
- Trocar moeda USD → BRL no header
- Navegar para FinOps → Recomendações
- Aplicar uma recomendação de economia com 1 clique
- Mostrar orçamento criado com alerta

### Cena 4 — Microsoft 365 (45s)
- Abrir M365 Dashboard → overview do tenant
- Criar usuário → preencher formulário
- Navegar para Teams Admin → criar time
- Mostrar Exchange → configurar auto-reply

### Cena 5 — White Label (30s)
- Abrir OrgSettings → seção White Label
- Alterar nome para "Painel MSP XYZ"
- Upload de logo
- Alterar cor primária → ver preview ao vivo
- Salvar → sidebar e header atualizam instantaneamente

### Cena 6 — Automação e Governança (30s)
- Criar agendamento de stop VM às 19h
- Criar política "Se custo > R$500, criar aprovação"
- Mostrar fluxo de aprovação pendente

### Cena 7 — Admin e MSP (30s)
- Abrir Orgs Gerenciadas → lista de parceiros
- Personalizar branding de um parceiro
- Abrir Admin Panel → ver analytics de billing

### Encerramento (15s)
- Voltar ao dashboard
- Mostrar logo e nome "CloudAtlas — Gestão Multi-Cloud"
- Call to action: "Teste grátis por 30 dias"

---

*Documento gerado em março de 2026 — CloudAtlas v0.3.0*
