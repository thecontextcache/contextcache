#!/usr/bin/env bash
# ==============================================================================
# ContextCache: Production deploy script (low downtime by default)
# ==============================================================================

set -e

echo "⏬  Pulling the latest code from GitHub..."
git pull origin main || echo "⚠️ Could not pull from Git, assuming local files are up to date."

if [[ "${1:-}" == "--hard" ]]; then
  echo "⏬  Hard deploy: stopping stack..."
  docker compose --env-file .env -f infra/docker-compose.prod.yml down --remove-orphans || true
  echo "🧹  Pruning Docker cache..."
  docker system prune -f
  docker builder prune -f
  echo "🔨  Rebuilding images (no cache)..."
  docker compose --env-file .env -f infra/docker-compose.prod.yml build --no-cache
  echo "🚀  Starting production stack..."
  docker compose --env-file .env -f infra/docker-compose.prod.yml up -d
  echo "✅  Hard deployment successful."
  exit 0
fi

echo "🔨  Building updated images..."
docker compose --env-file .env -f infra/docker-compose.prod.yml build api worker beat web docs
echo "🚀  Recreating app services only (db/redis stay up)..."
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d --no-deps api worker beat web docs
echo "✅  Low-downtime deployment successful."
