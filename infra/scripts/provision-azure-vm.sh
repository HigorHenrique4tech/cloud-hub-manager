#!/usr/bin/env bash
# =============================================================================
# CloudAtlas — Provisionamento da VM Azure
# Execute este script UMA ÚNICA VEZ na sua máquina local com az CLI instalado
# Pré-requisito: az login
# =============================================================================
set -euo pipefail

# ── Configurações (edite conforme necessário) ─────────────────────────────────
RESOURCE_GROUP="cloudatlas-rg"
LOCATION="brazilsouth"
VM_NAME="cloudatlas-vm"
VM_SIZE="Standard_B2s"       # 2 vCPUs, 4 GB RAM — ~$30/mês
VM_USER="cloudatlas"
REPO_URL="https://github.com/HigorHenrique4tech/cloud-hub-manager.git"
APP_DIR="/app/cloud-hub-manager"

# ─────────────────────────────────────────────────────────────────────────────

echo "==> [1/6] Criando Resource Group: $RESOURCE_GROUP"
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

echo "==> [2/6] Criando VM: $VM_NAME ($VM_SIZE)"
az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --image Ubuntu2204 \
  --size "$VM_SIZE" \
  --admin-username "$VM_USER" \
  --generate-ssh-keys \
  --output table

# Captura IP público
VM_IP=$(az vm show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --show-details \
  --query publicIps \
  --output tsv)

echo "==> IP da VM: $VM_IP"

echo "==> [3/6] Liberando portas 80 (HTTP) e 443 (HTTPS)"
az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port 80,443 \
  --priority 100 \
  --output table

echo "==> [4/6] Instalando Docker na VM"
ssh -o StrictHostKeyChecking=no "$VM_USER@$VM_IP" bash <<'REMOTE'
set -euo pipefail
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose plugin (via apt)
sudo apt-get install -y docker-compose-plugin

# Git (normalmente já instalado)
sudo apt-get install -y git
REMOTE

echo "==> [5/6] Clonando repositório"
ssh "$VM_USER@$VM_IP" bash <<REMOTE
set -euo pipefail
sudo mkdir -p /app
sudo chown $VM_USER:$VM_USER /app
git clone $REPO_URL $APP_DIR
REMOTE

echo "==> [6/6] Criando arquivo .env a partir do template"
ssh "$VM_USER@$VM_IP" bash <<REMOTE
cp $APP_DIR/.env.example $APP_DIR/.env
echo ""
echo "ATENÇÃO: edite o arquivo de ambiente antes de subir os containers:"
echo "  ssh $VM_USER@$VM_IP"
echo "  nano $APP_DIR/.env"
REMOTE

# ── Resumo ────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " VM provisionada com sucesso!"
echo "============================================================"
echo " IP público : $VM_IP"
echo " SSH        : ssh $VM_USER@$VM_IP"
echo " App dir    : $APP_DIR"
echo ""
echo " Próximos passos:"
echo "  1. Apontar DNS: cloudatlas.app.br → $VM_IP  (registro A)"
echo "  2. Editar .env na VM: ssh $VM_USER@$VM_IP && nano $APP_DIR/.env"
echo "  3. Adicionar secrets no GitHub Actions:"
echo "     VM_HOST    = $VM_IP"
echo "     VM_SSH_KEY = (conteúdo de ~/.ssh/id_rsa)"
echo "  4. Subir os containers:"
echo "     ssh $VM_USER@$VM_IP"
echo "     cd $APP_DIR/infra"
echo "     docker compose -f docker-compose.prod.yml up -d --build"
echo "============================================================"
