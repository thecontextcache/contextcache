#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="infra/docker-compose.prod.yml"
ENV_FILE=".env"

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/db_restore_verify.sh <backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
fi

DB_NAME="${POSTGRES_DB:-contextcache}"
DB_USER="${POSTGRES_USER:-contextcache}"
VERIFY_DB="${DB_NAME}_restore_verify"

cleanup() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
    psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\" WITH (FORCE);" >/dev/null 2>&1 || true
}

trap cleanup EXIT

cleanup

echo "Creating verification database: $VERIFY_DB"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$VERIFY_DB\";"

echo "Restoring backup into verification database"
gzip -dc "$BACKUP_FILE" | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -U "$DB_USER" -d "$VERIFY_DB" >/dev/null

echo "Running verification queries"
TABLE_COUNT="$(
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
    psql -U "$DB_USER" -d "$VERIFY_DB" -At -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
)"

if [[ "${TABLE_COUNT:-0}" -lt 5 ]]; then
  echo "Restore verification failed: expected public tables, found $TABLE_COUNT"
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -U "$DB_USER" -d "$VERIFY_DB" -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name LIMIT 10;"

echo "Restore verification passed for $BACKUP_FILE"
