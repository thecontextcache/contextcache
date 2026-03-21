#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/lib/compose_db_env.sh"
cc_resolve_db_env

WAVE="${1:-}"
LOCK_TIMEOUT_MS="${LOCK_TIMEOUT_MS:-5000}"
STATEMENT_TIMEOUT_MS="${STATEMENT_TIMEOUT_MS:-0}"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/bigint"
mkdir -p "$ARTIFACT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/run_bigint_wave.sh preflight
  ./scripts/run_bigint_wave.sh org-cutover
  ./scripts/run_bigint_wave.sh user-cutover
  ./scripts/run_bigint_wave.sh project-cutover

Environment:
  LOCK_TIMEOUT_MS=5000
  STATEMENT_TIMEOUT_MS=0
EOF
}

case "$WAVE" in
  preflight)
    exec "$ROOT_DIR/scripts/check_bigint_preflight.sh"
    ;;
  org-cutover)
    SQL_FILE="$ROOT_DIR/scripts/wave3_cutover_org_chain.sql"
    ;;
  user-cutover)
    SQL_FILE="$ROOT_DIR/scripts/wave3_cutover_user_chain.sql"
    ;;
  project-cutover)
    SQL_FILE="$ROOT_DIR/scripts/wave3_cutover_project_chain.sql"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

REPORT_PATH="${ARTIFACT_DIR}/${WAVE}-${STAMP}.log"

echo "[bigint-wave] wave=${WAVE} db=${DB_NAME} user=${DB_USER}"
echo "[bigint-wave] lock_timeout=${LOCK_TIMEOUT_MS}ms statement_timeout=${STATEMENT_TIMEOUT_MS}ms"
echo "[bigint-wave] report=${REPORT_PATH}"

{
  printf "SET lock_timeout = '%sms';\n" "$LOCK_TIMEOUT_MS"
  printf "SET statement_timeout = '%sms';\n" "$STATEMENT_TIMEOUT_MS"
  cat "$SQL_FILE"
} | cc_compose exec -T db \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f /dev/stdin \
  | tee "$REPORT_PATH"

echo "[bigint-wave] DONE"
