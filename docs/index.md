# CloudAtlas — Documentação Técnica

Plataforma SaaS multi-tenant para gerenciamento centralizado de infraestrutura AWS, Azure, GCP e Microsoft 365.

---

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [01 — Visão Geral & Arquitetura](./01-architecture.md) | Stack, containers, diagrama, estrutura de pastas |
| [02 — Banco de Dados](./02-database.md) | Todas as tabelas, campos-chave, cadeia de migrations |
| [03 — Autenticação & RBAC](./03-auth-rbac.md) | JWT, MFA, SSO OAuth, fluxos de auth, permissões por papel |
| [04 — Rotas da API](./04-api-routes.md) | Todos os endpoints organizados por módulo |
| [05 — Módulos de Funcionalidades](./05-modules.md) | AWS, Azure, GCP, M365, FinOps, Schedules, Webhooks, Dashboard |
| [06 — Planos, Billing & MSP](./06-plans-billing.md) | Planos Free/Pro/Enterprise, AbacatePay, MSP master/partner, admin |
| [07 — Deploy & Infraestrutura](./07-deployment.md) | Docker Compose, variáveis de ambiente, Caddy, Grafana, CI/CD |

---

## Quick links

- **API Swagger (dev):** `http://localhost:8000/docs`
- **Frontend (dev):** `http://localhost:3000`
- **Métricas:** `http://localhost:9090` (Prometheus) · `http://localhost:3001` (Grafana)
- **Health check:** `GET /health`

---

## Versão atual

| Item | Valor |
|------|-------|
| Fases concluídas | 1 → 20 |
| Provedores cloud | AWS · Azure · GCP · Microsoft 365 |
| Planos | Free · Pro (R$497) · Enterprise (R$2.497+) |
| Migrations | 12 (9776e03 → k1f2g3h) |
| Tabelas no banco | 22 |
