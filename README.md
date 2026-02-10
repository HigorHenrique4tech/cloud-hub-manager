# Cloud Hub Manager

Um hub centralizado para gerenciar recursos multi-cloud e infraestrutura.

## 🎯 Objetivo

Centralizar o gerenciamento de:
- ☁️ Recursos AWS, Azure, GCP, OCI
- 🔥 Firewalls de borda
- 📊 Monitoramento de custos
- 🚨 Alertas e notificações
- 🖥️ Aplicações em servidores diversos

## 🚀 Roadmap

### Fase 1 - MVP (Atual)
- [x] Estrutura do projeto
- [ ] Backend FastAPI básico
- [ ] Integração AWS (EC2 listing)
- [ ] Dashboard frontend simples
- [ ] Visualização de custos AWS

### Fase 2 - Expansão
- [ ] Múltiplas regiões AWS
- [ ] Outros serviços AWS (S3, RDS, Lambda)
- [ ] Integração Azure
- [ ] Sistema de alertas

### Fase 3 - Avançado
- [ ] GCP, OCI
- [ ] Firewalls (pfSense, FortiGate, etc)
- [ ] Monitoramento de aplicações
- [ ] Automações e workflows

## 🛠️ Stack Tecnológica

### Backend
- **Framework**: FastAPI
- **Linguagem**: Python 3.11+
- **SDK's**: boto3 (AWS), azure-sdk, google-cloud
- **Database**: PostgreSQL (futuro)

### Frontend
- **Framework**: React 18
- **Styling**: Tailwind CSS
- **Build**: Vite
- **Charts**: Recharts

### Infraestrutura
- **Containerização**: Docker + Docker Compose
- **CI/CD**: GitHub Actions

## 📦 Estrutura do Projeto

```
cloud-hub-manager/
├── backend/                # API Backend
│   ├── app/
│   │   ├── api/           # Endpoints da API
│   │   ├── core/          # Configurações core
│   │   ├── services/      # Lógica de negócio
│   │   └── models/        # Modelos de dados
│   ├── tests/             # Testes
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/              # Interface Web
│   ├── src/
│   │   ├── components/    # Componentes React
│   │   ├── pages/         # Páginas
│   │   ├── services/      # Chamadas API
│   │   └── utils/         # Utilidades
│   ├── Dockerfile
│   └── package.json
├── docs/                  # Documentação
├── docker-compose.yml     # Orquestração local
└── README.md
```

## 🏃 Como Executar

### Pré-requisitos
- Docker & Docker Compose
- Credenciais AWS configuradas (para testes)

### Setup Rápido

1. Clone o repositório:
```bash
git clone <seu-repo>
cd cloud-hub-manager
```

2. Configure as variáveis de ambiente:
```bash
cp .env.example .env
# Edite o .env com suas credenciais
```

3. Suba os containers:
```bash
docker-compose up -d
```

4. Acesse:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Docs API: http://localhost:8000/docs

## 🧪 Testes

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

## 📝 Variáveis de Ambiente

```env
# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1

# Azure (futuro)
AZURE_SUBSCRIPTION_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=

# Aplicação
API_HOST=0.0.0.0
API_PORT=8000
LOG_LEVEL=INFO
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Add: MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes.

## 📞 Suporte

Para dúvidas ou sugestões, abra uma issue no GitHub.
