# Features Futuras — CloudAtlas

> Documento de roadmap técnico. Baseado na análise completa do projeto (54 pages, 99 components, 25 APIs, 20 services, 4 cloud providers).

---

## 🟥 Alta Prioridade (Impacto imediato no produto)

### 1. Serviços AWS Faltantes
O módulo AWS cobre EC2, RDS, S3, Lambda e VPC, mas ignora serviços amplamente usados:

| Serviço | O que adicionar |
|---------|----------------|
| **ECS / EKS** | Gerenciamento de containers e clusters Kubernetes |
| **DynamoDB** | Listagem, métricas e gerenciamento de tabelas |
| **CloudFront** | CDN: listagem de distribuições, invalidação de cache |
| **Route 53** | Gerenciamento de zonas DNS e registros |
| **API Gateway** | Listar APIs, monitorar requests, ver erros |
| **ElastiCache** | Clusters Redis/Memcached: status, métricas, restart |
| **SNS / SQS** | Tópicos e filas: mensagens pendentes, erros, dead-letter |
| **Kinesis** | Streams: throughput, shard management |

---

### 2. Serviços Azure Faltantes

| Serviço | O que adicionar |
|---------|----------------|
| **AKS** | Azure Kubernetes Service: clusters, node pools, deploys |
| **Container Registry (ACR)** | Listar imagens, ver tags, gerenciar repositórios |
| **CosmosDB** | UI dedicada para gerenciar databases e containers |
| **API Management** | Listar APIs, subscrições, throttling policies |
| **Application Gateway** | Regras de roteamento, health probes, WAF |
| **Service Bus** | Filas e tópicos: mensagens, dead-letter, reprocessar |
| **Function Apps** | Listar funções, ver invocações, logs em tempo real |
| **Event Grid** | Subscriptions, tópicos customizados, evento history |

---

### 3. Serviços GCP Faltantes

| Serviço | O que adicionar |
|---------|----------------|
| **Cloud Run** | Listar serviços, ver revisões, escalar |
| **BigQuery** | Datasets, tabelas, jobs recentes, custo de queries |
| **Pub/Sub** | Tópicos e subscriptions: mensagens, lag, DLQ |
| **Firestore** | Collections, documentos, índices |
| **Cloud Armor** | Políticas WAF, regras, eventos bloqueados |
| **Dataflow** | Pipelines em execução, métricas, templates |

---

### 4. Microsoft 365 — Expansão do Módulo

O módulo M365 já é robusto. O que ainda falta:

- **Mailboxes compartilhadas**: criar, gerenciar permissões, monitorar uso
- **Listas de distribuição e grupos de segurança**: CRUD completo
- **Delegação de caixa de correio**: conceder/revogar acesso de send-as / full access
- **OneDrive**: ver cota por usuário, arquivos compartilhados externamente, arquivos deletados
- **Power BI**: relatórios de capacidade, workspaces, usuários ativos
- **Intune**: dispositivos gerenciados, políticas de conformidade, aplicações instaladas
- **Defender for M365**: alertas de segurança, incidents, recomendações

---

## 🟧 Média Prioridade (Diferencial competitivo)

### 5. Motor de Automação e Workflows

Atualmente o projeto tem agendamentos simples (start/stop). Seria transformador ter:

- **Construtor visual de workflows** (estilo n8n/Make):
  - Trigger: evento de recurso, alerta de custo, cron
  - Ações: start/stop resource, enviar webhook, criar ticket, notificar canal
  - Condições: if/else baseado em métricas ou tags

- **Regras de automação** (if-then):
  - Exemplo: *"Se custo de EC2 > $500/dia, parar instâncias com tag env=staging"*
  - Exemplo: *"Se CPU > 90% por 30 min, criar alerta e escalar"*

- **Integração com IaC**:
  - Visualizar e aplicar planos do **Terraform** dentro do CloudAtlas
  - Histórico de `terraform apply` por workspace
  - Drift detection (infra real vs. código)

---

### 6. Relatórios e Analytics Avançados

- **Construtor de relatórios customizados**: o usuário escolhe métricas, dimensões, período e tipo de gráfico
- **Comparativo multi-workspace / multi-org**: custo total consolidado para MSP
- **Showback/Chargeback interno**: alocar custo de cloud por time, projeto ou cost center (via tags)
- **Análise de tendência multi-ano**: não apenas meses — ver evolução de 12-24 meses
- **Previsão com ML**: usar modelos simples (Prophet/ARIMA) para prever gasto no fim do mês
- **Relatório de ROI**: custo economizado vs. custo da plataforma, por recomendação aplicada

---

### 7. Otimização de Custos Avançada (FinOps)

O módulo atual detecta desperdício mas ainda falta:

- **Advisor de Reserved Instances / Savings Plans (AWS)**: calcular o RI ideal com base no histórico de uso
- **Spot Instance Advisor**: identificar workloads tolerantes a falha e recomendar spot
- **Commitment Discount Analyzer (Azure)**: Azure Reservations e Hybrid Benefit
- **Análise de SUD / CUD (GCP)**: Committed Use Discounts automáticos
- **Rightsizing automático**: aplicar redução de tamanho de VM/instance com um clique e reversão fácil

---

### 8. Segurança e Compliance Avançados

- **Dashboard de Compliance**: frameworks CIS Benchmark, SOC 2, PCI-DSS, ISO 27001
  - Score por framework, controles passando/falhando, plano de remediação
- **Gestão de Segredos**: rotação automática de API keys e credenciais, integração com AWS Secrets Manager / Azure Key Vault / GCP Secret Manager
- **DLP (Data Loss Prevention)**: detectar dados sensíveis expostos em buckets públicos (S3, GCS, Azure Blob)
- **SIEM Integration**: exportar logs e alertas para Splunk, Datadog ou Azure Sentinel
- **Histórico de acesso de credenciais**: auditoria completa de quando e por quem as credenciais cloud foram usadas dentro da plataforma

---

### 9. Integrações Externas

| Ferramenta | Tipo de integração |
|------------|-------------------|
| **Jira** | Criar issues automaticamente a partir de alertas e recomendações |
| **ServiceNow** | Sincronizar tickets de suporte e aprovações |
| **PagerDuty** | Disparar incidents a partir de alertas de custo e segurança |
| **Datadog** | Enviar métricas de recursos para dashboards Datadog |
| **Grafana** | Data source para visualizar métricas do CloudAtlas |
| **Slack Bot** | Comandos slash para consultar custo e status de recursos |
| **GitHub Actions** | Trigger de workflows CI/CD a partir de eventos de infra |

---

### 10. Disaster Recovery e Backup Centralizado

- **Planos de DR por workspace**: definir RTO/RPO, recursos críticos, runbooks
- **Automação de backup cross-region**: schedule de backup com replicação entre regiões
- **Verificação de compliance de backup**: alertar quando recursos críticos estão sem backup
- **Simulação de failover**: testar failover sem afetar produção
- **Timeline de restauração**: ver histórico de restaurações e auditoria de backups

---

## 🟩 Baixa Prioridade / Melhorias Técnicas

### 11. Performance e Escalabilidade

- **Cache Redis**: substituir o cache in-memory do M365Service por Redis para suportar múltiplas instâncias backend
- **Refresh tokens em Redis**: mais eficiente que PostgreSQL para tokens de curta duração
- **Paginação por cursor**: usar cursor-based pagination em vez de offset para listas grandes de recursos
- **WebSockets**: atualizações em tempo real de status de recursos (ex: EC2 mudando de "stopping" para "stopped") sem polling
- **Background workers dedicados**: mover `scheduler_service` e processamento de webhooks para workers Celery/ARQ separados

---

### 12. Testes e Qualidade

Atualmente o projeto tem cobertura de testes mínima. Recomendações:

- **Backend — Unit tests**: pelo menos 80% de cobertura em `services/` com `pytest` e mocks dos SDKs cloud
- **Backend — Integration tests**: testar endpoints com banco de dados real (pytest + testcontainers)
- **Frontend — Component tests**: usar Vitest + Testing Library para componentes críticos (login, FinOps, dashboard)
- **E2E tests**: Playwright para fluxos principais (login → workspace → criar recurso → ver custo)
- **Contract testing**: Pact para garantir que frontend e backend não quebrem contrato de API

---

### 13. Experiência do Usuário (UX)

- **Onboarding interativo**: tour guiado pós-cadastro com tooltips (ex: Shepherd.js / Joyride)
- **Command palette expandida**: buscar recursos diretamente (ex: `> ec2 i-123456`, `> custo aws março`)
- **Favoritos / Recursos fixados**: fixar recursos usados frequentemente no topo das listas
- **Notificações push no browser**: Web Push API para alertas de custo e segurança em tempo real
- **Mobile app (PWA)**: transformar o frontend em PWA para acesso mobile sem app nativo
- **Modo de comparação**: abrir 2 recursos lado a lado para comparar configurações e custos

---

### 14. Governança e Controle de Acesso Granular

- **Permissões por recurso específico**: hoje RBAC é por workspace; adicionar permissão por recurso individual (ex: user X só pode ver bucket Y)
- **Políticas customizadas (OPA)**: usar Open Policy Agent para definir regras de governança em YAML
- **Aprovações multi-nível**: fluxo de aprovação com mais de 2 aprovadores e condições
- **Break-glass access**: acesso de emergência auditado a recursos críticos
- **Segregação de ambiente**: impedir que usuários de produção acessem staging e vice-versa

---

### 15. Internacionalização (i18n)

- Implementar `react-i18next` para suporte a múltiplos idiomas
- Extrair todas as strings hardcoded em português para arquivos de tradução
- Suporte inicial: **Português (BR)**, **Inglês (EUA)**, **Espanhol**
- Localização de datas, moedas e números por locale

---

### 16. Observabilidade da Própria Plataforma

- **Dashboard de health da plataforma**: latência de API, taxa de erros, filas pendentes
- **Alertas internos**: notificar admins quando um serviço cloud falha (ex: AWS API timeout > 30s)
- **Rastreamento distribuído**: OpenTelemetry + Jaeger para rastrear requests lentos
- **Logs estruturados**: padronizar logs em JSON com `structlog` e integrar com ELK Stack ou Loki

---

## 📋 Resumo por Área

| Área | Status Atual | Próximos Passos |
|------|-------------|----------------|
| **AWS** | EC2, RDS, S3, Lambda, VPC | + ECS/EKS, DynamoDB, CloudFront, Route53, API GW |
| **Azure** | VMs, Storage, SQL, App Services, VNets | + AKS, ACR, CosmosDB UI, Service Bus, Function Apps |
| **GCP** | Compute, Storage, SQL, Functions, VPC | + Cloud Run, BigQuery, Pub/Sub, Firestore |
| **M365** | Users, Licenses, Teams, SharePoint, Exchange | + Intune, Defender, OneDrive, Power BI, grupos/DL |
| **FinOps** | Recomendações, Orçamentos, Anomalias | + RI Advisor, Spot, Showback, previsão ML |
| **Automação** | Start/stop schedule | + Workflow builder, regras if/then, IaC |
| **Segurança** | Scan por provedor | + Compliance dashboard, DLP, SIEM, gestão de segredos |
| **Integrações** | Slack/Teams webhook, email | + Jira, ServiceNow, PagerDuty, Datadog, Grafana |
| **Relatórios** | Custo por período, export CSV | + Construtor custom, showback, multi-ano, ROI |
| **Testes** | Mínimo | + Unit, integration, E2E, contract tests |
| **Performance** | In-memory cache, offset pagination | + Redis, cursor pagination, WebSockets, workers |
| **UX** | Dashboard customizável, dark mode | + PWA, onboarding tour, push notifications, favoritos |

---

*Última atualização: 2026-03-09*
