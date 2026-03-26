#!/usr/bin/env bash
# MemoClaw — Quick setup script
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🧠 MemoClaw Setup"
echo "================="

# Check for .env
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your LLM provider API key before starting!"
    echo "   vim .env  (or your editor of choice)"
    exit 0
fi

echo "✅ .env found"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

echo "🚀 Starting MemoClaw..."
docker compose up -d --build

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Health check
if curl -sf http://localhost:8420/health > /dev/null 2>&1; then
    echo "✅ MemoClaw is running at http://localhost:8420"
    echo ""
    echo "📖 API docs: http://localhost:8420/docs"
    echo "🔑 API key: $(grep MEMOCLAW_API_KEY .env | cut -d= -f2)"
else
    echo "⏳ Still starting up... Check: docker compose logs -f memoclaw"
fi
