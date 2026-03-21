#!/usr/bin/env bash
set -euo pipefail

: "${COMPOSE_FILE:=infra/docker-compose.prod.yml}"
: "${ENV_FILE:=.env}"

cc_compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

cc_resolve_db_env() {
  local output
  if ! output="$(
    cc_compose exec -T db sh -lc \
      'printf "POSTGRES_DB=%s\nPOSTGRES_USER=%s\n" "${POSTGRES_DB:-}" "${POSTGRES_USER:-}"'
  )"; then
    echo "Failed to resolve database environment from the running db container." >&2
    echo "Make sure the production stack is up before running database helper scripts." >&2
    return 1
  fi

  DB_NAME="$(printf '%s\n' "$output" | awk -F= '/^POSTGRES_DB=/{sub(/^POSTGRES_DB=/, ""); print}')"
  DB_USER="$(printf '%s\n' "$output" | awk -F= '/^POSTGRES_USER=/{sub(/^POSTGRES_USER=/, ""); print}')"

  DB_NAME="${DB_NAME:-contextcache}"
  DB_USER="${DB_USER:-contextcache}"

  export DB_NAME DB_USER
}
