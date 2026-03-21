#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="infra/docker-compose.prod.yml"
ENV_FILE=".env"
BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
fi

DB_NAME="${POSTGRES_DB:-contextcache}"
DB_USER="${POSTGRES_USER:-contextcache}"
OUT_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Creating backup: $OUT_FILE"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges \
  | gzip -c > "$OUT_FILE"

test -s "$OUT_FILE"
echo "Backup complete: $OUT_FILE"
