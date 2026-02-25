#!/usr/bin/env bash
# ==============================================================================
# ContextCache: Strict Production Deployment Script
# Use this on your remote server to ensure a clean rollout.
# ==============================================================================

set -e

echo "⏬  Pulling the latest code from GitHub..."
git pull origin main || echo "⚠️ Could not pull from Git, assuming local files are up to date."

echo "🧹  Stopping all running infra containers..."
docker compose -f infra/docker-compose.prod.yml down --remove-orphans || true

# Also destroy any lingering root compose instances 
docker compose -f docker-compose.yml down --remove-orphans || true

echo "🗑️  Clearing Docker build caches for a clean rebuild..."
docker system prune -f
docker builder prune -fa

echo "🔨  Rebuilding production images from scratch (no cache)..."
docker compose -f infra/docker-compose.prod.yml build --no-cache

echo "🚀  Starting the live Cloudflare Tunnel stack (Next.js, FastAPI, Workers)..."
docker compose -f infra/docker-compose.prod.yml up -d

echo "✅  Deployment successful."
echo "    -> Make sure Cloudflare Tunnel maps to localhost:3000 correctly."
