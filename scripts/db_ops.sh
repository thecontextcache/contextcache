#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="infra/docker-compose.prod.yml"
ENV_FILE=".env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/compose_db_env.sh"

usage() {
  cat <<EOF
Usage: scripts/db_ops.sh <command>

Commands:
  logs         Tail postgres container logs
  activity     Show active queries/sessions
  locks        Show waiting lock pairs
  size         Show top table sizes
  schema       List all public tables
  backup       Create compressed backup under ./backups
  restore-verify <file.sql.gz>  Restore a backup into a temporary database and verify it
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

case "$1" in
  logs)
    cc_compose logs -f db
    ;;
  activity)
    cc_resolve_db_env
    cc_compose exec -T db \
      psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT pid, usename, application_name, state, wait_event_type, wait_event, query_start, left(query, 160) AS query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY query_start DESC NULLS LAST
LIMIT 30;"
    ;;
  locks)
    cc_resolve_db_env
    cc_compose exec -T db \
      psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT blocked.pid AS blocked_pid,
       blocking.pid AS blocking_pid,
       blocked.query AS blocked_query,
       blocking.query AS blocking_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked ON blocked.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
 AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
 AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
 AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
 AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
 AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
 AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
 AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
 AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
 AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
 AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking ON blocking.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted
ORDER BY blocked.query_start DESC NULLS LAST;"
    ;;
  size)
    cc_resolve_db_env
    cc_compose exec -T db \
      psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT relname AS table_name,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       n_live_tup AS est_rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;"
    ;;
  schema)
    cc_resolve_db_env
    cc_compose exec -T db \
      psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
ORDER BY table_name;"
    ;;
  backup)
    ./scripts/db_backup.sh
    ;;
  restore-verify)
    if [[ $# -ne 2 ]]; then
      echo "Usage: scripts/db_ops.sh restore-verify <backup.sql.gz>"
      exit 1
    fi
    ./scripts/db_restore_verify.sh "$2"
    ;;
  *)
    usage
    exit 1
    ;;
esac
