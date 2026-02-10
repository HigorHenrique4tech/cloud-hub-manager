# 🚀 Guia de Início Rápido - Cloud Hub Manager

## Passo 1: Pré-requisitos

Certifique-se de ter instalado:
- Docker & Docker Compose
- Git
- Credenciais AWS (Access Key ID e Secret Access Key)

## Passo 2: Clone e Configure

```bash
# Clone o repositório (ou use o diretório atual)
cd cloud-hub-manager

# Copie o arquivo de exemplo de variáveis de ambiente
cp .env.example .env

# Edite o .env com suas credenciais AWS
nano .env  # ou use seu editor preferido
```

**Configuração mínima necessária no `.env`:**
```env
AWS_ACCESS_KEY_ID=sua_access_key_aqui
AWS_SECRET_ACCESS_KEY=sua_secret_key_aqui
AWS_DEFAULT_REGION=us-east-1
```

## Passo 3: Inicie o Backend

```bash
# Suba o container do backend
docker-compose up -d backend

# Visualize os logs
docker-compose logs -f backend
```

## Passo 4: Teste a API

Aguarde alguns segundos para o container iniciar, então:

### Opção 1: Navegador
Abra em seu navegador:
- **Documentação interativa**: http://localhost:8000/docs
- **Health check**: http://localhost:8000/health

### Opção 2: curl
```bash
# Health check
curl http://localhost:8000/health

# Testar conexão AWS
curl http://localhost:8000/api/v1/aws/test-connection

# Listar instâncias EC2
curl http://localhost:8000/api/v1/aws/ec2/instances
```

### Opção 3: Python
```python
import requests

# Health check
response = requests.get('http://localhost:8000/health')
print(response.json())

# Listar EC2
response = requests.get('http://localhost:8000/api/v1/aws/ec2/instances')
print(response.json())
```

## Passo 5: Desenvolvimento Local (Opcional)

Se preferir rodar sem Docker:

```bash
# Entre no diretório do backend
cd backend

# Crie um ambiente virtual
python -m venv venv
source venv/bin/activate  # No Windows: venv\Scripts\activate

# Instale as dependências
pip install -r requirements.txt

# Configure as variáveis de ambiente
export AWS_ACCESS_KEY_ID="sua_key"
export AWS_SECRET_ACCESS_KEY="sua_secret"
export AWS_DEFAULT_REGION="us-east-1"

# Execute a aplicação
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Passo 6: Execute os Testes

```bash
# Com Docker
docker-compose exec backend pytest

# Ou localmente
cd backend
pytest -v
```

## Troubleshooting

### Erro: "AWS credentials not configured"
- Verifique se o arquivo `.env` está na raiz do projeto
- Confirme que as credenciais estão corretas
- Reinicie o container: `docker-compose restart backend`

### Erro: "Port 8000 already in use"
- Altere a porta no `.env`: `API_PORT=8001`
- Ou pare o processo usando a porta 8000

### Erro de permissão no Docker
```bash
# Adicione seu usuário ao grupo docker
sudo usermod -aG docker $USER
# Faça logout e login novamente
```

### Container não inicia
```bash
# Veja os logs detalhados
docker-compose logs backend

# Reconstrua a imagem
docker-compose build --no-cache backend
docker-compose up -d backend
```

## Próximos Passos

1. ✅ Backend funcionando com AWS EC2
2. 🔜 Criar o frontend React
3. 🔜 Adicionar visualização de custos
4. 🔜 Implementar outras clouds (Azure, GCP)
5. 🔜 Sistema de alertas

## Estrutura de Endpoints

### Disponíveis agora:
- `GET /` - Health check
- `GET /health` - Status da aplicação
- `GET /docs` - Documentação Swagger
- `GET /api/v1/aws/test-connection` - Testa conexão AWS
- `GET /api/v1/aws/ec2/instances` - Lista instâncias EC2

### Em desenvolvimento:
- `GET /api/v1/aws/ec2/instances/{id}` - Detalhes de uma instância
- `POST /api/v1/aws/ec2/instances/{id}/start` - Inicia instância
- `POST /api/v1/aws/ec2/instances/{id}/stop` - Para instância
- `GET /api/v1/aws/costs` - Visualiza custos

## Comandos Úteis

```bash
# Parar containers
docker-compose down

# Parar e remover volumes
docker-compose down -v

# Reconstruir e reiniciar
docker-compose up -d --build

# Ver logs em tempo real
docker-compose logs -f

# Executar comando no container
docker-compose exec backend bash

# Limpar tudo
docker-compose down -v
docker system prune -a
```

## Suporte

Se encontrar problemas, verifique:
1. Logs do container: `docker-compose logs backend`
2. Configuração do `.env`
3. Conectividade com AWS
4. Issues no GitHub

Bom desenvolvimento! 🚀
