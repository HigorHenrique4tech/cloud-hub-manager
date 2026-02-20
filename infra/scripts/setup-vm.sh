#!/usr/bin/env bash
# =============================================================================
# CloudAtlas — Setup inicial da VM (rode DENTRO da VM após provisionar)
# ssh cloudatlas@<ip> && bash <(curl -fsSL https://raw.githubusercontent.com/.../setup-vm.sh)
# =============================================================================
set -euo pipefail

APP_DIR="/app/cloud-hub-manager"

echo "==> Gerando chaves de segurança para o .env..."

SECRET_KEY=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

echo ""
echo "=== Adicione estas linhas ao seu .env ==="
echo "SECRET_KEY=$SECRET_KEY"
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo "=========================================="
echo ""
echo "Salve os valores acima em local seguro (1Password, Azure Key Vault, etc.)"
echo ""

# Atualiza automaticamente no .env se existir
if [ -f "$APP_DIR/.env" ]; then
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$SECRET_KEY|" "$APP_DIR/.env"
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENCRYPTION_KEY|" "$APP_DIR/.env"
  echo "✓ .env atualizado com as chaves geradas"
  echo ""
  echo "Edite os demais campos obrigatórios:"
  echo "  nano $APP_DIR/.env"
fi
