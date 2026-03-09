# 📋 Plano de Implementação — Fase 30: Segurança Avançada (SSO e TOTP)

> **Projeto:** CloudAtlas (cloud-hub-manager)
> **Foco:** Implementação de Autenticação de Dois Fatores contínua via TOTP (Autenticadores de celular) e Login Single Sign-On (SAML) padrão corporativo.

---

## 🎯 Visão Geral
Adicionar suporte completo para aplicativos de autenticação (como Google Authenticator e Microsoft Authenticator) através de senhas baseadas em tempo (TOTP). Além disso, permitir que clientes Enterprise integrem a plataforma em seus provedores de identidade (IdP) utilizando o protocolo SAML 2.0.

## 🔐 1. Modelagem de Dados (Backend - SQLAlchemy)

### Modificações em `users`
Adicionar colunas para TOTP:
- `totp_secret` (String, nullable): O secret gerado (em Base32) para a conta do usuário.
- `totp_enabled` (Boolean, default False): Flag que indica se o TOTP está ativado para o usuário.

### Nova tabela `saml_configs`
Para armazenar a configuração do IdP por Organização (SSO Corporativo):
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `organization_id` | UUID | FK para a organização |
| `idp_entity_id` | String | URL do Issuer (IdP) |
| `idp_sso_url` | String | Login URL do IdP |
| `idp_x509_cert` | Text | Certificado Público do IdP |
| `is_active` | Boolean | True se a configuração está habilitada |

## ⚙️ 2. API Endpoints (Backend - FastAPI)

### TOTP (em `auth.py`)
- `POST /auth/mfa/totp/setup` - Gera um novo secret, salva na conta e retorna o QRCode (URI) para o usuário ler no celular.
- `POST /auth/mfa/totp/verify` - Valida o token gerado pelo app. Se válido, ativa `totp_enabled`.
- Atualizar o endpoint de login (`POST /auth/login`) para suportar verificação por TOTP. Caso o usuário tenha `totp_enabled`, deve solicitar e validar o token do app.

### SAML SSO (Novo router `saml.py`)
- `GET /saml/{org_slug}/metadata` - Exibe os metadados do Service Provider (CloudAtlas) para ser adicionado no IdP.
- `POST /saml/{org_slug}/acs` - Assertion Consumer Service. Onde o IdP redireciona o usuário (POST) com o payload SAML. O backend processa o XML, valida a assinatura com `idp_x509_cert`, cria/atualiza o usuário e gera os tokens JWT.
- `GET /saml/{org_slug}/login` - Inicia o fluxo SP-Initiated (Redireciona para a URL do IdP).

## 💻 3. Interface (Frontend)

### Perfil e Segurança (`settings.jsx`)
- Adicionar opção "Autenticador via App (TOTP)".
- Ao ativar, exibir um modal com o QRCode (renderizado via biblioteca `qrcode.react` ou no backend).
- Tela de inserção do código de 6 dígitos para confirmar a ativação.

### Login SSO (`login.jsx`)
- Novo botão "Entrar com SSO". 
- Ao clicar, o sistema deve pedir o `slug` (ou e-mail) da organização, localizar a configuração SAML ativa e redirecionar para `/saml/{org_slug}/login`.

---

<br/><hr/><br/>

# 📋 Plano de Implementação — Fase 31: Funil Financeiro (Trial e Anual)

> **Projeto:** CloudAtlas (cloud-hub-manager)
> **Foco:** Criação de período de Trial Automático no plano Pro (14 dias) e pacotes de faturamento anual via AbacatePay.

---

## 🎯 Visão Geral
Impulsionar a adoção de planos pagos permitindo que novos usuários testem logo de cara todas as funcionalidades do plano Pro (Agendamentos, Scans FinOps e Alertas) gratuitamente por 14 dias. Adicioialmente, implementar ciclo de faturamento anual para reduzir o churn.

## 🗄️ 1. Modelagem de Dados

### Alterações em `organizations`
- `trial_ends_at` (DateTime, nullable): Data em que o trial do plano Pro irá finalizar.
- `billing_cycle` (Enum: `monthly`, `annual`, default `monthly`): Armazena se a assinatura paga é anual ou mensal.

## ⚙️ 2. Lógica e Endpoints (Backend)

### Criação e Monitoramento do Trial
- **Registro:** Ao criar uma nova organização e finalizar o Onboarding, ao invés de enviar para `PlanSelection.jsx`, o backend deve automaticamente assinar o `plan_tier = "pro"` e setar o `trial_ends_at = datetime.utcnow() + 14 days`.
- **Rotina de Limpeza (Cron diário):** Utilizar o próprio Scheduler existente (`scheduler_service.py`) ou um script de background para buscar Orgs com `trial_ends_at` expirado. Se expirou e nenhum pagamento foi ativado:
  - Fazer downgrade do campo para `plan_tier = "free"`.
  - Desativar/Pausar recursos Pro que passem do limite do Free: inativar jobs do APScheduler, webhooks excessivos e pausar o auto-scan do FinOps.
  - Enviar e-mail: "Seu Trial acabou".

### Expansão da API de Pagamentos (`billing.py` / `payment_service.py`)
- O endpoint de checkout via PIX (AbacatePay) precisa ler um query param `cycle=annual` ou `cycle=monthly`.
- Criar regras calculadas no `plan_service.py` (exemplo: Preço Pro Anual = R$ 4.970, equivalendo a 10 meses).

## 💻 3. Interface (Frontend)

### Global Trial Banner
- Desenvolver um componente de topo fixo exibindo: `Trial Pro ativo — Faltam X dias`. 
- Adicionar o botão "Realizar Assinatura" no banner para conduzir à página de pricing.

### Tela de Planos (`PlanSelection.jsx`)
- Adicionar alternador visual `Mensal / Anual` (toggle-switch).
- Quando no modo Anual, exibir valores de desconto (ex: economize R$ 1000/ano).
- O gateway final repassará a tag `annual` no momento da geração do PIX do AbacatePay.

---

## 🚀 Próximos Passos (Ordem de Execução)
1. **Migrations Database:** Rodar Alembic para as 3 tabelas (`users` para TOTP, nova tabela `saml_configs` e atualizar `organizations` com dados do Trial).
2. **Backend (Opção 5):** Escrever a rotina de cronjob para controlar os 14 dias de Trial no backend e ajustar a rota de criação da Org para entrar na org como Pro.
3. **Frontend (Opção 5):** Exibir os banners de Trial, toggle toggle-switch mensal/anual e atualizar o fluxo de login de um novo user (pula da verificação direto ao painel com restrições mínimas).
4. **Backend (Opção 4):** Configurar bibliotecas JWT+MFA de TOTP (`pyotp`) e montar endpoints de verificação SAML (`python3-saml`).
5. **Frontend (Opção 4):** Atualização da UI para incluir o QRCode TOTP e o botão alternativo SAML na entrada principal.
