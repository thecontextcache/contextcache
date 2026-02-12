#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"
API_KEY_VALUE="${API_KEY:-}"
PROJECT_NAME="FTS Demo $(date +%s)"

api() {
  if [[ -n "${API_KEY_VALUE}" ]]; then
    curl -fsS -H "X-API-Key: ${API_KEY_VALUE}" "$@"
  else
    curl -fsS "$@"
  fi
}

echo "Seeding baseline data (optional idempotent)..."
if [[ -n "${API_KEY_VALUE}" ]]; then
  curl -fsS -H "X-API-Key: ${API_KEY_VALUE}" "${BASE_URL}/health" >/dev/null
else
  curl -fsS "${BASE_URL}/health" >/dev/null
fi

echo "Creating project: ${PROJECT_NAME}"
PROJECT_JSON="$(api -X POST "${BASE_URL}/projects" -H "Content-Type: application/json" -d "{\"name\":\"${PROJECT_NAME}\"}")"
PROJECT_ID="$(printf '%s' "${PROJECT_JSON}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"

echo "Adding ranking test memories..."
api -X POST "${BASE_URL}/projects/${PROJECT_ID}/memories" -H "Content-Type: application/json" \
  -d '{"type":"finding","content":"Postgres full text search ranking with ts_rank_cd improves recall quality."}' >/dev/null
api -X POST "${BASE_URL}/projects/${PROJECT_ID}/memories" -H "Content-Type: application/json" \
  -d '{"type":"note","content":"Postgres search exists."}' >/dev/null
api -X POST "${BASE_URL}/projects/${PROJECT_ID}/memories" -H "Content-Type: application/json" \
  -d '{"type":"todo","content":"Refactor frontend spacing and color palette."}' >/dev/null

echo "Running FTS recall query: postgres ranking"
RECALL_JSON="$(api "${BASE_URL}/projects/${PROJECT_ID}/recall?query=postgres%20ranking&limit=10")"
echo "${RECALL_JSON}" | python3 -m json.tool

echo
echo "Rank ordering evidence (from returned order):"
printf '%s' "${RECALL_JSON}" | python3 - << 'PY'
import json, sys
data = json.load(sys.stdin)
items = data.get("items", [])
if not items:
    print("No matches. Fallback likely returned recency items.")
    sys.exit(0)
print(f"Top item: {items[0]['content']}")
print("Ordered contents:")
for i, item in enumerate(items, start=1):
    print(f"{i}. [{item['type']}] {item['content']}")
PY
