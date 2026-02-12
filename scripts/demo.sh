#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"
PROJECT_NAME="Demo $(date +%s)"

echo "Checking API health at ${BASE_URL}..."
curl -fsS "${BASE_URL}/health" | python3 -m json.tool

echo
echo "Creating project: ${PROJECT_NAME}"
PROJECT_JSON="$(curl -fsS -X POST "${BASE_URL}/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${PROJECT_NAME}\"}")"
echo "${PROJECT_JSON}" | python3 -m json.tool
PROJECT_ID="$(printf '%s' "${PROJECT_JSON}" | python3 -c 'import sys, json; print(json.load(sys.stdin)["id"])')"

echo
echo "Adding sample memories..."
curl -fsS -X POST "${BASE_URL}/projects/${PROJECT_ID}/memories" \
  -H "Content-Type: application/json" \
  -d '{"type":"decision","content":"Use Postgres for memory persistence."}' >/dev/null
curl -fsS -X POST "${BASE_URL}/projects/${PROJECT_ID}/memories" \
  -H "Content-Type: application/json" \
  -d '{"type":"finding","content":"Token overlap improves recall precision."}' >/dev/null
curl -fsS -X POST "${BASE_URL}/projects/${PROJECT_ID}/memories" \
  -H "Content-Type: application/json" \
  -d '{"type":"definition","content":"Memory pack is grouped context for pasting into an AI tool."}' >/dev/null

echo
echo "Listing memories..."
curl -fsS "${BASE_URL}/projects/${PROJECT_ID}/memories" | python3 -m json.tool

echo
echo "Recall query: postgres"
curl -fsS "${BASE_URL}/projects/${PROJECT_ID}/recall?query=postgres&limit=10" | python3 -m json.tool

echo
echo "Demo complete. project_id=${PROJECT_ID}"
