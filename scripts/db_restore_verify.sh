#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="infra/docker-compose.prod.yml"
ENV_FILE=".env"
RESTORE_VERIFY_MAINTENANCE_WORK_MEM="${RESTORE_VERIFY_MAINTENANCE_WORK_MEM:-256MB}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/compose_db_env.sh"

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/db_restore_verify.sh <backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

cc_resolve_db_env
VERIFY_DB="${DB_NAME}_restore_verify"

cleanup() {
  cc_compose exec -T db \
    psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\" WITH (FORCE);" >/dev/null 2>&1 || true
}

trap cleanup EXIT

cleanup

echo "Creating verification database: $VERIFY_DB"
cc_compose exec -T db \
  psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$VERIFY_DB\";"

echo "Restoring backup into verification database"
gzip -dc "$BACKUP_FILE" | cc_compose exec -T db \
  env PGOPTIONS="-c maintenance_work_mem=${RESTORE_VERIFY_MAINTENANCE_WORK_MEM}" \
  psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$VERIFY_DB" >/dev/null

echo "Running verification queries"
TABLE_COUNT="$(
  cc_compose exec -T db \
    psql -U "$DB_USER" -d "$VERIFY_DB" -At -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
)"

if [[ "${TABLE_COUNT:-0}" -lt 5 ]]; then
  echo "Restore verification failed: expected public tables, found $TABLE_COUNT"
  exit 1
fi

ALEMBIC_COLUMN_LENGTH="$(
  cc_compose exec -T db \
    psql -U "$DB_USER" -d "$VERIFY_DB" -At -c \
    "SELECT COALESCE(character_maximum_length::text, 'text')
       FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='alembic_version'
        AND column_name='version_num';"
)"

if [[ -z "${ALEMBIC_COLUMN_LENGTH:-}" ]]; then
  echo "Restore verification failed: alembic_version.version_num column not found"
  exit 1
fi

cc_compose exec -T db \
  psql -U "$DB_USER" -d "$VERIFY_DB" -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name LIMIT 10;"

echo "Verified alembic_version.version_num width: $ALEMBIC_COLUMN_LENGTH"
echo "Restore verification passed for $BACKUP_FILE"
