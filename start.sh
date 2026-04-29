#!/bin/bash
set -e

echo "=========================================="
echo "Arena AI — Quick Setup & Run"
echo "=========================================="

# 1. Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[*] Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    # Try to add current user to docker group
    sudo usermod -aG docker $USER || true
    echo "[*] Docker installed successfully."
else
    echo "[*] Docker is already installed."
fi

# 2. Check if Docker Compose is available
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "[*] Docker Compose not found. Installing Docker Compose Plugin..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
    echo "[*] Docker Compose installed successfully."
else
    echo "[*] Docker Compose is available."
fi

# 3. Start the Arena (Using sudo to ensure it works even if group changes haven't taken effect)
echo "[*] Starting Arena AI containers..."

if docker compose version &> /dev/null; then
    sudo docker compose up -d --build
else
    sudo docker-compose up -d --build
fi

echo "=========================================="
echo "✅ Setup Complete!"
echo "Arena AI Dashboard is running at: http://localhost:9010"
echo "=========================================="
