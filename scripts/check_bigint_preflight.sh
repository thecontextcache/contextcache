#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="infra/docker-compose.prod.yml"
ENV_FILE=".env"
DB_NAME="${POSTGRES_DB:-contextcache_dev}"
DB_USER="${POSTGRES_USER:-contextcache}"

echo "[bigint-preflight] Using db=${DB_NAME} user=${DB_USER}"
echo "[bigint-preflight] Running FK inventory + INT/BIGINT probes..."

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -U "$DB_USER" -d "$DB_NAME" -f /dev/stdin < scripts/db_fk_inventory.sql

echo "[bigint-preflight] DONE"
