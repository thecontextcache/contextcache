#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"
API_KEY_VALUE="${API_KEY:-}"
ORG_ID_VALUE="${ORG_ID:-}"
PROJECT_NAME="Demo $(date +%s)"

api() {
  local -a headers
  if [[ -n "${API_KEY_VALUE}" ]]; then
    headers+=(-H "X-API-Key: ${API_KEY_VALUE}")
  fi
  if [[ -n "${ORG_ID_VALUE}" ]]; then
    headers+=(-H "X-Org-Id: ${ORG_ID_VALUE}")
  fi
  curl -fsS "${headers[@]}" "$@"
}

echo "Checking API health at ${BASE_URL}..."
curl -fsS "${BASE_URL}/health" | python3 -m json.tool

echo
echo "Creating project: ${PROJECT_NAME}"
PROJECT_JSON="$(api -X POST "${BASE_URL}/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${PROJECT_NAME}\"}")"
echo "${PROJECT_JSON}" | python3 -m json.tool
PROJECT_ID="$(printf '%s' "${PROJECT_JSON}" | python3 -c 'import sys, json; print(json.load(sys.stdin)["id"])')"

echo
echo "Adding sample memories..."
api -X POST "${BASE_URL}/projects/${PROJECT_ID}/memories" \
  -H "Content-Type: application/json" \
  -d '{"type":"decision","content":"Use Postgres for memory persistence."}' >/dev/null
api -X POST "${BASE_URL}/projects/${PROJECT_ID}/memories" \
  -H "Content-Type: application/json" \
  -d '{"type":"finding","content":"FTS ranking improves recall precision."}' >/dev/null
api -X POST "${BASE_URL}/projects/${PROJECT_ID}/memories" \
  -H "Content-Type: application/json" \
  -d '{"type":"definition","content":"Memory pack is grouped context for pasting into an AI tool."}' >/dev/null

echo
echo "Listing memories..."
api "${BASE_URL}/projects/${PROJECT_ID}/memories" | python3 -m json.tool

echo
echo "Recall query: postgres"
api "${BASE_URL}/projects/${PROJECT_ID}/recall?query=postgres&limit=10" | python3 -m json.tool

echo
echo "Demo complete. project_id=${PROJECT_ID}"
