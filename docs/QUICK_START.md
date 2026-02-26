# Guia de Início Rápido — Cloud Hub Manager

## Pré-requisitos

- Docker & Docker Compose
- Git
- Credenciais de pelo menos uma cloud (AWS, Azure ou GCP)

---

## 1. Clone e Configure

```bash
cd cloud-hub-manager

# Copie o arquivo de variáveis de ambiente
cp .env.example .env
```

Edite o `.env` com as configurações mínimas:

```env
# Obrigatórios
SECRET_KEY=sua-chave-secreta-longa-e-aleatoria
DATABASE_URL=postgresql://cloudatl_prod_db:senha@postgres:5432/cloudatlas_db
ENCRYPTION_KEY=chave-fernet-base64-32-bytes

# Email (para verificação de conta e MFA)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu@email.com
SMTP_PASSWORD=sua-senha-app

# Opcional: credenciais globais AWS (fallback se usuário não configurou as próprias)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=us-east-1
```

---

## 2. Suba os Containers

```bash
docker-compose up -d

# Acompanhe os logs
docker-compose logs -f backend
```

O backend sobe em `http://localhost:8000` e o frontend em `http://localhost:3000`.
As migrations Alembic rodam automaticamente na inicialização.

---

## 3. Crie sua Conta

Acesse `http://localhost:3000` → **Criar conta** → preencha nome, e-mail e senha.

Após o registro você será direcionado para a tela de seleção de plano:

| Plano | Preço | Recursos |
|---|---|---|
| **Free** | Grátis | Dashboard, 1 workspace, visualização básica |
| **Pro** | R$497/mês | FinOps, Agendamentos, Webhooks, Alertas ilimitados |
| **Enterprise** | R$2.497/mês | MSP (múltiplas orgs), tudo do Pro |

---

## 4. Adicione Credenciais de Cloud

Vá em **Configurações → Credenciais** e adicione sua(s) conta(s):

### AWS
- Access Key ID
- Secret Access Key
- Região padrão (ex.: `us-east-1`)

### Azure
- Subscription ID
- Tenant ID
- Client ID
- Client Secret

### GCP
- Project ID
- Client Email (service account)
- Private Key
- Private Key ID

---

## 5. Explore o Dashboard

Após adicionar credenciais, o dashboard exibe automaticamente:

- **Instâncias EC2 / VMs Azure / Compute Engine GCP** — status, start/stop
- **Custos estimados** — AWS Cost Explorer + Azure Cost Management
- **Alertas de custo** — notifique quando ultrapassar limites
- **FinOps** (Pro) — recomendações de economia com aplicação em 1 clique
- **Agendamentos** (Pro) — ligar/desligar recursos por horário
- **Webhooks** (Pro) — notificações em tempo real via HTTP

---

## 6. Configurar como Admin

Para acessar o painel administrativo (gerenciar leads Enterprise, alterar planos de orgs):

```sql
-- Execute direto no banco PostgreSQL
UPDATE users SET is_admin = true WHERE email = 'seu@email.com';
```

Após relogar, o link **Admin** aparece no rodapé da sidebar.

---

## Comandos Úteis

```bash
# Ver todos os containers
docker-compose ps

# Reiniciar backend
docker-compose restart backend

# Ver logs em tempo real
docker-compose logs -f

# Rodar migrations manualmente
docker-compose exec backend alembic upgrade head

# Acessar banco de dados
docker-compose exec postgres psql -U cloudatl_prod_db -d cloudatlas_db

# Parar e remover tudo (preserva volumes)
docker-compose down

# Remover volumes também (reseta banco)
docker-compose down -v
```

---

## Troubleshooting

### Backend não inicia
```bash
docker-compose logs backend
# Verifique DATABASE_URL, SECRET_KEY e ENCRYPTION_KEY no .env
```

### Erro de credenciais cloud
- As credenciais são criptografadas com Fernet antes de serem salvas
- Verifique se `ENCRYPTION_KEY` é uma chave Fernet válida (32 bytes base64)
- Gere uma nova: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

### Porta já em uso
```bash
# Altere no .env ou docker-compose.yml
API_PORT=8001
```

### Migrations com erro
```bash
docker-compose exec backend alembic history
docker-compose exec backend alembic current
```
