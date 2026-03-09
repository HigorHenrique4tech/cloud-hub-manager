# 📋 Plano de Implementação — Observabilidade da Plataforma

> **Projeto:** CloudAtlas (cloud-hub-manager)
> **Referência:** `featuresfuturas.md` (Item 16: Observabilidade da Própria Plataforma)
> **Foco:** Implementação de monitoramento de saúde, rastreamento distribuído, logs estruturados e alertas internos para garantir a estabilidade e performance da própria plataforma CloudAtlas.

---

## 🎯 Visão Geral
Construir uma infraestrutura robusta de observabilidade (Logs, Métricas e Tracing - *"Os Três Pilares"*) que permita aos administradores da ferramenta monitorarem latência de API, taxa de erros, filas pendentes e gargalos em tempo real, além de reter histórico visível de problemas sistêmicos e instabilidades nos Cloud Providers.

## 📊 1. Métricas e Dashboards Apartados (Prometheus + Grafana)
- **Métricas do FastAPI:** Adicionar middleware compatível com Prometheus (e.g. `prometheus-client` / `starlette-exporter`) para expor o endpoint de métricas `/metrics`.
  - Exportar latência HTTP, contagem de requests, tempo de resposta por rota e HTTP status codes.
- **Saúde dos Workers/Jobs:** Expor métricas customizadas do tamanho da fila do `apscheduler`, falhas de eventos de cron e webhooks em processamento.
- **Stack de Observabilidade Independente:** Configurar um stack **isolado e apartado** da aplicação principal (geralmente usando **Grafana** + Prometheus rodando em instâncias ou containers separados). 
  - *Motivo:* Se a infraestrutura principal do backend ou banco de dados cair (OOM, Crash, etc), o serviço de observabilidade precisa continuar de pé para alertar a equipe e permitir o diagnóstico (Post-Mortem).
  - Um dashboard apartado no Grafana consumirá os dados vitais de saúde (CPU, Memória, Requests, Erros) a partir do endpoint `/metrics` do CloudAtlas de forma agnóstica.

## 🔎 2. Rastreamento Distribuído (OpenTelemetry + Jaeger)
- **Instrumentação Automática:** Integrar os pacotes do `opentelemetry` no FastAPI e no SQLAlchemy.
- **Trace Context Externo:** Rastrear tempo gasto em cada requisição externa (SDKs da AWS, Microsoft Graph API, GCP SDK, Azure SDK). Isso é crítico para entender onde uma request na API do CloudAtlas ficou travada (ex: Lentidão na API da AWS ou banco de dados lento).
- **Exportação OTLP:** Subir um container do Jaeger/Tempo no ambiente local (`docker-compose.yml`) e enviar spans via protocolo OTLP diretamente do backend Python para visualização visual de gargalos.

## 📝 3. Logs Estruturados (`structlog` + Loki/ELK)
- **Substituição do Logger Padrão:** Padronizar completamente as dependências de log do Python migrando para o `structlog`.
- **Formato JSON:** Emitir todas as saídas na stdout/stderr em formato JSON, com tipagem forte para logs lidos por máquinas.
- **Enriquecimento Dinâmico:** Injetar os metadados `request_id`, `organization_id` e `user_id` em toda a cadeia de execução da requisição. Dessa forma, ao pesquisar pelo `request_id` recebido pelo frontend, podemos ver ponta-a-ponta o que aconteceu no backend.
- **Agregação:** Configurar coleta por agente (Vector, Promtail ou FluentBit) para enviar logs ao Datadog, ELK Stack ou Grafana Loki.

## 🚨 4. Alertas Internos Proativos
- **Limiares de Falha de Cloud Providers:** Notificar administradores se o tempo de resposta ou de timeout exceder limites aceitáveis (ex: >30s na resposta da AWS API) de maneira repetida (Circuit Breaker).
- **Monitoramento de Taxa de Erro:** Se >5% das requisições num período de 5min retornarem 5xx no FastAPI, disparar alerta Crítico.
- **Notificação:** Enviar notificação direta via e-mail ou canais de times internos (e.g., Slack/Discord Webhooks de Ops) reportando o serviço degradado imediatamente.

---

## 🚀 Próximos Passos (Ordem de Execução)

1. **Estruturação Padrão (Logs e Traces):** 
   - Instalar `structlog`, `opentelemetry-api` e seus instrumentors para FastAPI, HTTP e SQLAlchemy. Garantir que todo log saia no formato JSON enriquecido com IDs únicos.
   - Atualizar a configuração de infraestrutura (`docker-compose`) local para incluir uma versão simplificada do Jaeger, com portas para ingestão nativa.
2. **Setup de Métricas e Health Check Avançado:**
   - Habilitar o path `/metrics` (Prometheus middleware) em um escopo não exposto ou protegido com token. Adicionar hooks para medir tempo das funções críticas.
3. **Dashboards do Admin (Frontend):**
   - Criar uma vista no frontend acessível globalmente a SuperAdmins capaz de ler as estatísticas de uso em um resumo simplificado.
4. **Alarme Interno e Webhooks de Erro:**
   - Implementar listener assíncrono interno central para envio periódico/imediato em caso de erros severos 5xx (Threshold de detecção e push webhook no Slack/Discord dos devOps internos).
