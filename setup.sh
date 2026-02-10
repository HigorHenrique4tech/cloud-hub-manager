#!/bin/bash

# Cloud Hub Manager - Setup Script
# Este script automatiza o setup inicial do projeto

set -e  # Exit on error

echo "=========================================="
echo "  Cloud Hub Manager - Setup Automatizado"
echo "=========================================="
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para mensagens de sucesso
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Função para mensagens de erro
error() {
    echo -e "${RED}✗ $1${NC}"
}

# Função para mensagens de aviso
warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Verificar se Docker está instalado
echo "Verificando pré-requisitos..."
if ! command -v docker &> /dev/null; then
    error "Docker não está instalado. Por favor, instale o Docker primeiro."
    exit 1
fi
success "Docker instalado"

if ! command -v docker-compose &> /dev/null; then
    error "Docker Compose não está instalado. Por favor, instale o Docker Compose primeiro."
    exit 1
fi
success "Docker Compose instalado"

# Verificar se .env existe
echo ""
echo "Verificando configuração..."
if [ ! -f .env ]; then
    warning ".env não encontrado. Criando a partir do .env.example..."
    cp .env.example .env
    
    echo ""
    warning "IMPORTANTE: Você precisa configurar suas credenciais AWS no arquivo .env"
    echo ""
    echo "Edite o arquivo .env e adicione:"
    echo "  - AWS_ACCESS_KEY_ID"
    echo "  - AWS_SECRET_ACCESS_KEY"
    echo "  - AWS_DEFAULT_REGION"
    echo ""
    read -p "Deseja editar o .env agora? (s/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        ${EDITOR:-nano} .env
    else
        warning "Lembre-se de configurar o .env antes de usar a aplicação!"
    fi
else
    success ".env encontrado"
fi

# Verificar se as credenciais AWS estão configuradas
echo ""
echo "Verificando credenciais AWS no .env..."
if grep -q "your_access_key_here" .env || grep -q "your_secret_key_here" .env; then
    warning "Credenciais AWS não configuradas no .env"
    warning "A aplicação não conseguirá conectar à AWS sem credenciais válidas"
else
    success "Credenciais AWS parecem estar configuradas"
fi

# Limpar containers antigos se existirem
echo ""
echo "Limpando containers antigos (se existirem)..."
docker-compose down 2>/dev/null || true
success "Limpeza concluída"

# Build dos containers
echo ""
echo "Construindo containers..."
docker-compose build backend
success "Backend construído com sucesso"

# Iniciar os containers
echo ""
echo "Iniciando containers..."
docker-compose up -d backend
success "Backend iniciado"

# Aguardar o backend estar pronto
echo ""
echo "Aguardando o backend inicializar..."
sleep 5

# Verificar se o backend está rodando
MAX_TRIES=30
TRIES=0
while [ $TRIES -lt $MAX_TRIES ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        success "Backend está respondendo!"
        break
    fi
    TRIES=$((TRIES+1))
    echo -n "."
    sleep 1
done

if [ $TRIES -eq $MAX_TRIES ]; then
    error "Backend não respondeu após 30 segundos"
    echo ""
    echo "Veja os logs com: docker-compose logs backend"
    exit 1
fi

# Executar testes básicos
echo ""
echo "Executando testes básicos..."
docker-compose exec -T backend pytest 2>/dev/null || warning "Alguns testes falharam (pode ser normal se não houver credenciais AWS)"

# Resumo final
echo ""
echo "=========================================="
echo "  ✓ Setup Concluído com Sucesso!"
echo "=========================================="
echo ""
echo "Acesse a aplicação:"
echo "  • API Docs:    http://localhost:8000/docs"
echo "  • Health:      http://localhost:8000/health"
echo "  • API Base:    http://localhost:8000/api/v1"
echo ""
echo "Endpoints disponíveis:"
echo "  • GET  /api/v1/aws/test-connection"
echo "  • GET  /api/v1/aws/ec2/instances"
echo ""
echo "Comandos úteis:"
echo "  • Ver logs:           docker-compose logs -f backend"
echo "  • Parar:              docker-compose down"
echo "  • Reiniciar:          docker-compose restart backend"
echo "  • Reconstruir:        docker-compose up -d --build backend"
echo ""
echo "Teste rápido:"
echo "  curl http://localhost:8000/health"
echo "  curl http://localhost:8000/api/v1/aws/ec2/instances"
echo ""
success "Pronto para usar! 🚀"
echo ""
