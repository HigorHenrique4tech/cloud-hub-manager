# CloudAtlas — Guia de Deploy em Produção

## Pré-requisitos

- [ ] Conta Azure com créditos suficientes
- [ ] Azure CLI instalado: `az --version`
- [ ] Acesso ao repositório GitHub com permissão de adicionar Secrets
- [ ] Domínio `cloudatlas.app.br` com acesso ao painel DNS

---

## Semana 2, Dia 8 — Provisionar VM Azure

> Execute na sua máquina local com `az login` já feito.

```bash
az login
bash infra/scripts/provision-azure-vm.sh
```

O script cria:
- Resource Group `cloudatlas-rg` em `brazilsouth`
- VM Ubuntu 22.04 `Standard_B2s` (2 vCPUs, 4 GB, ~R$150/mês)
- Portas 80 e 443 liberadas
- Docker + Git instalados
- Repositório clonado em `/app/cloud-hub-manager`

**Guarde o IP público exibido no final do script.**

---

## Semana 2, Dia 9 — Configurar GitHub Secrets

Acesse: `github.com/<org>/<repo>/settings/secrets/actions`

| Secret | Valor |
|--------|-------|
| `VM_HOST` | IP público da VM (ex: `20.201.x.x`) |
| `VM_SSH_KEY` | Conteúdo de `~/.ssh/id_rsa` (chave privada gerada pelo az vm create) |

> Para obter a chave: `cat ~/.ssh/id_rsa`

---

## Semana 2, Dia 10 — DNS

No painel do provedor do domínio, adicione:

| Tipo | Nome | Valor |
|------|------|-------|
| `A` | `@` (ou `cloudatlas.app.br`) | IP da VM |
| `A` | `www` | IP da VM |

Caddy (já configurado) emite o certificado SSL automaticamente quando o DNS propagar (~5 min).

---

## Semana 2, Dia 11 — Configurar .env e Subir

### 1. Gerar chaves de segurança (na VM)

```bash
ssh cloudatlas@<VM_IP>
bash /app/cloud-hub-manager/infra/scripts/setup-vm.sh
```

### 2. Editar o .env com todos os valores

```bash
nano /app/cloud-hub-manager/.env
```

Campos **obrigatórios** (sem eles o container não sobe):
- `SECRET_KEY` — gerado pelo setup-vm.sh ✓
- `ENCRYPTION_KEY` — gerado pelo setup-vm.sh ✓
- `POSTGRES_PASSWORD` — senha forte
- `GRAFANA_PASSWORD` — senha forte

Campos **importantes para funcionalidade**:
- `ABACATEPAY_API_KEY` + `ABACATEPAY_WEBHOOK_SECRET`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` (emails de verificação)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (SSO Google)
- `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` (SSO GitHub)

### 3. Subir os containers

```bash
cd /app/cloud-hub-manager/infra
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Smoke Test (checklist)

Após os containers subirem, execute:

```bash
# Health check
curl -sf https://cloudatlas.app.br/health

# Docs devem estar bloqueados
curl -sf https://cloudatlas.app.br/docs   # → 403
curl -sf https://cloudatlas.app.br/metrics # → 403
```

- [ ] `GET /health` → `{"status":"healthy","checks":{"database":"ok"}}`
- [ ] Criar conta → receber email de verificação
- [ ] Login → JWT retornado + redirect para dashboard
- [ ] `GET /docs` → 403 (bloqueado pelo Caddy)
- [ ] `GET /metrics` → 403 (bloqueado pelo Caddy)
- [ ] Criar checkout → URL de pagamento AbacatePay válida
- [ ] Configurar webhook no painel AbacatePay → `https://cloudatlas.app.br/api/v1/billing/webhook`

---

## Monitoramento — Grafana

Acesse o Grafana via SSH tunnel (não exposto publicamente):

```bash
# No seu terminal local:
ssh -L 3001:localhost:3001 cloudatlas@<VM_IP>
```

Depois abra: `http://localhost:3001`

- Usuário: `admin`
- Senha: valor de `GRAFANA_PASSWORD` no `.env`
- Dashboard pré-carregado: **CloudAtlas - API Monitoring**

---

## CI/CD — Fluxo Automático

Após setup inicial, todo push na `main`:

```
push → main
  ├── Backend Tests (pytest) ─┐
  ├── Frontend Build (vite)  ─┤→ ambos passam → Deploy SSH → Health Check
  └── (se qualquer um falha: deploy é bloqueado)
```

---

## Manutenção

### Ver logs em tempo real
```bash
ssh cloudatlas@<VM_IP>
cd /app/cloud-hub-manager/infra
docker compose -f docker-compose.prod.yml logs -f backend
```

### Restart manual
```bash
docker compose -f docker-compose.prod.yml restart backend
```

### Backup do .env (faça isso agora!)
```bash
# Copiar para local
scp cloudatlas@<VM_IP>:/app/cloud-hub-manager/.env ./env.backup.$(date +%Y%m%d)
```

Guarde também em: **Azure Key Vault** ou **1Password**.

---

## Custos estimados (Azure — brazilsouth)

| Recurso | Custo/mês |
|---------|-----------|
| VM Standard_B2s | ~R$ 140 |
| Disco OS 30 GB | ~R$ 15 |
| IP Estático | ~R$ 15 |
| Transferência (10 GB) | ~R$ 5 |
| **Total** | **~R$ 175/mês** |

> Dica: reserve a VM (1 ano) para reduzir até 40%.
