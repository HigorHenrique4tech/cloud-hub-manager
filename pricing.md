# CloudAtlas — Planos, Preços e Modelo de Monetização

---

## Visão Geral

O CloudAtlas é uma plataforma de gerenciamento multi-cloud (AWS, Azure, GCP e Microsoft 365) com três planos de assinatura e um modelo de receita recorrente baseado em add-ons para MSPs/consultorias.

**Método de pagamento:** PIX via AbacatePay
**Moeda:** BRL (Real Brasileiro)
**Trial:** 30 dias de Pro gratuito para novos cadastros

---

## Planos

### Plano Free — R$ 0/mês

Ideal para profissionais individuais ou pequenas equipes que querem testar a plataforma.

| Recurso | Limite |
|---------|--------|
| Workspaces | 2 |
| Contas Cloud (AWS/Azure/GCP/M365) | 3 |
| Membros por organização | 3 |
| Dashboard multi-cloud | Sim |
| Visão de custos | Sim |
| Inventário de recursos | Sim |
| Monitoramento de segurança | Sim |
| Gerenciamento Azure (VMs, Storage, Backup, etc.) | Sim |
| Microsoft 365 (Usuários, Licenças, SharePoint, Exchange, Teams) | Sim |
| FinOps (Recomendações, Orçamentos, Anomalias) | Não |
| Agendamentos (start/stop automático) | Não |
| Webhooks / Integrações | Não |
| White Label | Não |
| Gerenciamento de Parceiros (MSP) | Não |

---

### Plano Pro — R$ 497/mês

Para equipes e empresas que precisam de automação, FinOps e integrações avançadas.

| Recurso | Limite |
|---------|--------|
| Workspaces | 10 |
| Contas Cloud | 20 |
| Membros por organização | 20 |
| Tudo do plano Free | Sim |
| **FinOps completo** | Sim |
| — Recomendações de economia | Sim |
| — Orçamentos com alertas | Até 5 por workspace |
| — Detecção de anomalias | Sim |
| — Relatórios automáticos (PDF) | Sim |
| — Histórico de ações | Sim |
| **Agendamentos** (ligar/desligar recursos automaticamente) | Sim |
| **Webhooks** (integrações customizadas via HTTP) | Até 10 por workspace |
| **Relatórios agendados** (envio automático por e-mail) | Sim |
| White Label | Não |
| Gerenciamento de Parceiros (MSP) | Não |

**Trial:** Todo novo cadastro recebe 30 dias de Pro grátis. E-mails de lembrete são enviados automaticamente faltando 7, 3 e 1 dia para expirar.

---

### Plano Enterprise — R$ 2.497/mês (base)

Para MSPs, consultorias e empresas que gerenciam múltiplos clientes/parceiros.

| Recurso | Limite |
|---------|--------|
| Workspaces | 20 incluídos (+R$ 290/extra) |
| Contas Cloud | Ilimitadas |
| Membros por organização | Ilimitados |
| Tudo do plano Pro | Sim |
| Orçamentos por workspace | Ilimitados |
| **White Label completo** | Sim |
| — Nome da plataforma customizado | Sim |
| — Logo customizado (claro + escuro) | Sim |
| — Favicon customizado | Sim |
| — Cores da marca (primária + accent) | Sim |
| — E-mails com marca do cliente | Sim |
| — "Powered by CloudAtlas" removível | Sim |
| — PDFs/relatórios com marca do cliente | Sim |
| **Gerenciamento de Parceiros (MSP)** | Sim |
| — Organizações parceiras incluídas | 5 |
| — Painel de saúde dos parceiros | Sim |
| — Operações em lote (suspender/ativar) | Sim |
| — Dashboard consolidado de custos | Sim |
| — Branding individual por parceiro | Sim |

---

## Add-ons (Enterprise)

O plano Enterprise inclui 5 organizações parceiras e 10 workspaces por parceiro na base. Acima disso, cobra-se por add-on:

| Add-on | Preço |
|--------|-------|
| Organização parceira adicional (acima de 5) | R$ 397/mês cada |
| Workspace adicional por parceiro (acima de 10) | R$ 290/mês cada |

### Exemplos de custo Enterprise

| Cenário | Parceiros | Workspaces extras | Custo mensal |
|---------|-----------|-------------------|--------------|
| Base | 5 | 0 | R$ 2.497 |
| 10 parceiros, sem excedente de WS | 10 | 0 | R$ 2.497 + (5 × R$ 397) = **R$ 4.482** |
| 5 parceiros, 3 com 15 WS cada | 5 | 15 | R$ 2.497 + (15 × R$ 290) = **R$ 6.847** |
| 20 parceiros, todos com 10 WS | 20 | 0 | R$ 2.497 + (15 × R$ 397) = **R$ 8.452** |

---

## Fontes de Receita

### 1. Assinaturas recorrentes (MRR)
- **Pro:** R$ 497/mês por organização
- **Enterprise:** R$ 2.497/mês + add-ons

### 2. Add-ons de escala (Enterprise)
- Cada parceiro extra: R$ 397/mês
- Cada workspace extra: R$ 290/mês
- Receita cresce linearmente com o número de clientes que o MSP gerencia

### 3. Upsell Free → Pro (via trial)
- Todo cadastro inicia com 30 dias de Pro grátis
- Lembretes automáticos por e-mail com resumo de economia FinOps (mostra valor que o usuário economizaria perdendo o Pro)
- Conversão natural: funcionalidades são travadas após expiração do trial

### 4. Upsell Pro → Enterprise
- MSPs e consultorias que já usam Pro e precisam gerenciar múltiplos clientes
- White Label justifica cobrança premium: o MSP apresenta a plataforma como se fosse dele
- Formulário "Falar com vendas" envia lead para o admin

---

## Feature Gating — Como as funcionalidades são bloqueadas

| Funcionalidade | Free | Pro | Enterprise |
|----------------|------|-----|-----------|
| Dashboard + Custos + Inventário + Segurança | Livre | Livre | Livre |
| Azure (VMs, Storage, SQL, VNets, Backup) | Livre | Livre | Livre |
| AWS (EC2, S3, RDS, Lambda, VPC) | Livre | Livre | Livre |
| GCP (Compute, Storage, SQL, Functions, VPC) | Livre | Livre | Livre |
| Microsoft 365 (Usuários, Licenças, SharePoint, Exchange, Teams) | Livre | Livre | Livre |
| FinOps (Recomendações, Orçamentos, Anomalias, Relatórios) | Bloqueado | Livre | Livre |
| Agendamentos (start/stop automático) | Bloqueado | Livre | Livre |
| Webhooks | Bloqueado | Livre (10 max) | Livre (10 max) |
| White Label | Bloqueado | Bloqueado | Livre |
| MSP / Parceiros | Bloqueado | Bloqueado | Livre |

Quando o usuário tenta acessar uma funcionalidade bloqueada, ele vê um componente `PlanGate` com ícone de cadeado e botão "Fazer upgrade".

---

## Sistema de Billing Interno (Admin)

Além dos pagamentos via AbacatePay, existe um sistema de billing interno para o admin:

- **Faturas manuais:** O admin pode criar e gerenciar cobranças (BillingRecord)
- **Recorrência:** Faturas podem ser mensais, trimestrais, semestrais ou anuais
- **Status:** Rascunho → Emitida → Pendente → Paga / Vencida
- **E-mails automáticos:** Lembretes de vencimento e notificação de pagamento
- **Histórico de status:** Audit trail de todas as mudanças de status

---

## Trial de 30 dias — Fluxo completo

```
Cadastro → Org criada (trial_ends_at = agora + 30 dias)
         → effective_plan = "pro" (mesmo sendo free)
         → Banner "Trial Pro — X dias restantes" no topo
         → 7 dias antes: e-mail de lembrete com resumo FinOps
         → 3 dias antes: e-mail urgente (cor âmbar)
         → 1 dia antes: e-mail final (cor vermelha)
         → Expiração: effective_plan volta para "free"
         → Funcionalidades Pro são bloqueadas
         → Admin pode estender trial via painel
```

---

## Integrações de Pagamento

| Item | Detalhe |
|------|---------|
| Gateway | AbacatePay |
| Método | PIX |
| Webhook | `POST /api/v1/billing/webhook` (verificação automática) |
| Checkout | Redirect para AbacatePay → retorno via `BillingSuccess` page |
| Status | PENDING → PAID → (EXPIRED / CANCELLED / REFUNDED) |
| Idempotência | Pagamentos já confirmados não são reprocessados |

---

## Proposta de Valor por Persona

### DevOps / SRE (Free → Pro)
- **Dor:** Gerenciar múltiplos clouds é complexo e gera custos desnecessários
- **Valor Free:** Dashboard unificado, inventário, monitoramento de segurança
- **Valor Pro:** Economia real com FinOps (recomendações de right-sizing, orçamentos com alerta), automação de start/stop para ambientes dev/staging

### Gestor de TI (Pro)
- **Dor:** Falta de visibilidade sobre gastos cloud e dificuldade de reportar para diretoria
- **Valor:** Relatórios automáticos em PDF, detecção de anomalias, orçamentos por projeto/workspace

### MSP / Consultoria (Enterprise)
- **Dor:** Precisa oferecer um painel profissional para cada cliente sem desenvolver software próprio
- **Valor:** White Label transforma o CloudAtlas na plataforma do MSP. Cada cliente (org parceira) tem sua própria marca, e o MSP gerencia tudo de um único painel
- **ROI:** O MSP cobra R$ 500-2.000/mês de cada cliente pela "plataforma de gestão cloud". Com 5 clientes pagando R$ 800/mês, fatura R$ 4.000 e paga R$ 2.497 → **margem de R$ 1.503/mês**

---

## Números-chave para a apresentação

| Métrica | Valor |
|---------|-------|
| Preço Pro | R$ 497/mês |
| Preço Enterprise (base) | R$ 2.497/mês |
| Trial | 30 dias grátis |
| Clouds suportados | 4 (AWS, Azure, GCP, M365) |
| Módulos no Free | 6 (Dashboard, Custos, Inventário, Segurança, Azure, M365) |
| Módulos no Pro | +3 (FinOps, Agendamentos, Webhooks) |
| Módulos no Enterprise | +2 (White Label, MSP) |
| Gateway de pagamento | PIX via AbacatePay |
| Add-on por parceiro extra | R$ 397/mês |
| Add-on por workspace extra | R$ 290/mês |

---

## Análise de Mercado — Benchmark de Preços (Março 2026)

### Concorrentes e seus preços

| Plataforma | Free | Plano Pago | Enterprise | Modelo de cobrança |
|------------|------|-----------|-----------|-------------------|
| **Vantage** | Até $2.500/mês de spend | Pro ~$50+/mês (até $7.5K spend) | Custom (quote) | % do cloud spend monitorado |
| **Holori** | Até $3K/mês de spend | $49/mês (Pro) | Custom | Por cloud spend |
| **CloudHealth (Broadcom)** | — | ~0.5-1.5% do spend gerenciado | Custom | % do spend |
| **Apptio Cloudability (IBM)** | — | ~$30.000/ano (até $1M spend) | ~$132K/ano (até $6M) | Por volume de spend anual |
| **Kubecost** | Free (1 cluster) | ~$449/mês por cluster | Custom | Por cluster/vCPU |
| **Cast.ai** | Free (monitoring) | Usage-based por vCPU | Custom | Por consumo |
| **nOps** | — | % do AWS MRR | Custom | % das economias |
| **Harness CCM** | — | % do cloud spend | Custom | % do spend |
| **CloudAtlas** | R$ 0 | **R$ 497/mês** (~$95 USD) | **R$ 2.497/mês** (~$475 USD) | **Flat rate por organização** |

> Conversão aproximada: $1 USD = R$ 5,25 (março 2026)

### O que a comparação revela

**1. Modelo de preço mais simples e previsível**

A maioria dos concorrentes cobra um percentual do cloud spend monitorado (0.5-3%) ou por recurso/cluster. Isso significa que quanto mais o cliente gasta com cloud, mais ele paga pela ferramenta de gestão. O CloudAtlas cobra flat rate por organização — preço fixo independente do volume de gastos cloud. Um cliente com $50K/mês de spend pagaria ~$250-750/mês no modelo percentual da CloudHealth, enquanto no CloudAtlas paga R$ 497 (~$95 USD).

**2. Pro a R$ 497/mês — competitivo**

- Holori cobra $49/mês mas entrega APENAS FinOps (sem gerenciamento de recursos, sem agendamentos, sem webhooks)
- Vantage Pro cobre até $7.500/mês de spend — acima disso, o preço sobe
- CloudAtlas Pro entrega FinOps + gerenciamento multi-cloud + inventário + segurança + agendamentos + webhooks + M365, tudo por R$ 497
- Para o mercado brasileiro B2B, R$ 497 está alinhado com o ticket médio de SaaS de gestão

**3. Enterprise a R$ 2.497/mês — abaixo do mercado global**

- Apptio Cloudability: ~R$ 13.000/mês (para até $1M de spend)
- Flexera: ~R$ 29.000/mês (contrato de 36 meses)
- CloudAtlas Enterprise: R$ 2.497/mês com White Label + MSP + ilimitado
- O White Label sozinho já justifica o valor: MSPs cobram R$ 500-2.000 por cliente pela "plataforma própria"

**4. Sem concorrente direto no Brasil**

Não existe uma plataforma brasileira que combine gestão multi-cloud + FinOps + White Label + MSP. O mercado de SaaS no Brasil foi avaliado em $7.9 bilhões (2025) com crescimento projetado de 13.87% ao ano até 2034. O CloudAtlas ocupa um nicho vazio no mercado nacional.

### Posicionamento estratégico

```
                        Preço
                        Alto │
                             │   Apptio ($30K/ano)
                             │       Flexera ($200K/contrato)
                             │           CloudHealth (% spend)
                             │
                             │
                             │
                    Médio    │               ← CloudAtlas Enterprise (~$475/mês)
                             │       Kubecost ($449/cluster)
                             │
                             │
                    Baixo    │   ← CloudAtlas Pro (~$95/mês)
                             │       Holori ($49 — só FinOps)
                             │       Vantage (free até $2.5K)
                             │
                        Free │   ← CloudAtlas Free
                             │       Cast.ai Free
                             └──────────────────────────────────────────
                              Só FinOps        Multi-cloud        Multi-cloud
                                               + FinOps           + FinOps + MSP
                                                                  + White Label
                                           Escopo da plataforma →
```

### Vantagens competitivas no pricing

| Vantagem | Impacto |
|----------|---------|
| **Preço fixo** (flat rate) vs % do spend | Cliente sabe exatamente quanto vai pagar. Não é penalizado por crescer |
| **Tudo incluso** no plano | Concorrentes cobram módulos separados (FinOps, Governance, Optimization) |
| **PIX nativo** | Fricção zero para empresas brasileiras. Concorrentes exigem cartão internacional |
| **BRL** | Sem exposição cambial. Concorrentes em USD ficam mais caros com desvalorização do real |
| **White Label no Enterprise** | Pouquíssimos concorrentes oferecem. É o diferencial que justifica o Enterprise para MSPs |
| **Trial de 30 dias** | Permite testar FinOps completo antes de pagar. Gera lock-in via economia comprovada |

### Recomendações para evolução de preço

| Recomendação | Detalhe |
|-------------|---------|
| **Pro pode subir para R$ 697-797** | Ainda ficaria abaixo do mercado internacional. Timing: quando atingir +50 clientes pagantes |
| **Plano Business a R$ 1.297-1.497** | Intermediário entre Pro e Enterprise: mais limites (30 WS, 50 contas), sem White Label/MSP. Captura quem precisa de escala mas não é MSP |
| **Enterprise tem margem para R$ 3.497+** | Concorrentes cobram 5-10x mais. Subir após validar primeiros 10 clientes Enterprise |
| **Desconto anual (2 meses grátis)** | Padrão de mercado SaaS. Melhora retenção e previsibilidade de receita |
| **Add-on de suporte premium** | R$ 297/mês: SLA de resposta 4h, canal dedicado no Slack/Teams |

### Fontes

- [Vantage — Pricing](https://www.vantage.sh/pricing)
- [Holori — Pricing](https://holori.com/pricing/)
- [Emma — Plans & Pricing](https://www.emma.ms/pricing)
- [Cast.ai — Pricing](https://cast.ai/pricing/)
- [nOps — Vantage Pricing Explained](https://www.nops.io/blog/vantage-pricing-explained/)
- [Holori — Best 20 FinOps Tools 2026](https://holori.com/20-best-finops-and-cloud-cost-management-tools-in-2025/)
- [IMARC — Brazil SaaS Market Size 2034](https://www.imarcgroup.com/brazil-saas-market)
- [SaaStock — B2B SaaS Pricing Strategies 2025](https://www.saastock.com/blog/saas-pricing-models-insights-from-industry-leaders/)
- [CloudToggle — Top 12 Cloud Cost Management Softwares 2026](https://www.cloudtoggle.com/blog-en/cloud-cost-management-softwares/)
