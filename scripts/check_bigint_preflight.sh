#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="infra/docker-compose.prod.yml"
ENV_FILE=".env"
source "$ROOT_DIR/scripts/lib/compose_db_env.sh"
read -r DB_NAME DB_USER < <(cc_resolve_db_env)
ARTIFACT_DIR="${ROOT_DIR}/artifacts/bigint"
mkdir -p "$ARTIFACT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_PATH="${ARTIFACT_DIR}/preflight-${STAMP}.log"

echo "[bigint-preflight] Using db=${DB_NAME} user=${DB_USER}"
echo "[bigint-preflight] Running FK inventory + INT/BIGINT probes..."
echo "[bigint-preflight] Writing report to ${REPORT_PATH}"

cc_compose exec -T db \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f /dev/stdin \
  < scripts/db_fk_inventory.sql | tee "$REPORT_PATH"

echo "[bigint-preflight] DONE"
