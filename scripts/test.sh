#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  docker compose --profile test down -v
}
trap cleanup EXIT

docker compose --profile test up -d db-test
docker compose --profile test run --rm api-test
