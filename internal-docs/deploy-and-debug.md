# Deploy And Debug

This is the practical operator guide for the current repo.

## Command Matrix

### Local dev

```bash
docker compose up -d --build
docker compose logs -n 100 api db
```

### Targeted server test flow

```bash
docker compose -p cctest --env-file .env -f docker-compose.yml --profile test build api-test
docker compose -p cctest --env-file .env -f docker-compose.yml --profile test up -d db-test redis
docker compose -p cctest --env-file .env -f docker-compose.yml --profile test run --rm api-test \
  sh -lc 'uv run --no-sync python -m app.wait_for_db && uv run --no-sync pytest -q tests/test_auth.py tests/test_integration.py'
docker compose -p cctest --env-file .env -f docker-compose.yml --profile test down -v
```

### Production deploy

```bash
DOCKER_BUILDKIT=1 docker compose --env-file .env -f infra/docker-compose.prod.yml build api worker beat web
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d --no-deps api worker beat web

sleep 10
curl -fsS http://127.0.0.1:8000/health && echo
curl -fsS http://127.0.0.1:3000/auth >/dev/null && echo "web-ok"
docker compose --env-file .env -f infra/docker-compose.prod.yml ps
docker compose --env-file .env -f infra/docker-compose.prod.yml logs --since 3m api worker beat
```

## Build Logic Cheat Sheet

### Test / CI without private-engine token

Expected behavior:
- `api-test` should build without touching GitHub SSH
- runtime/test imports fall back to local adapter code

Red flags:
- `Updating ssh://git@github.com/thecontextcache/contextcache-engine.git`
- GitHub host authenticity prompt

What that means:
- either the image is stale
- or `uv run` is re-resolving dependencies because `--no-sync` was omitted

### Production with private-engine token

Expected behavior:
- `ENGINE_TOKEN` is supplied via BuildKit secret
- private engine install happens from a pinned spec derived from `uv.lock`

If the prod build fails and test builds do not:
- inspect `/Users/nd/Documents/contextcache/api/Dockerfile`
- inspect `/Users/nd/Documents/contextcache/api/scripts/private_engine_spec.py`
- confirm `DOCKER_BUILDKIT=1` is set for the build

## Post-Deploy Checks

Minimum bar:

1. `curl -fsS http://127.0.0.1:8000/health`
2. `docker compose ... ps`
3. `docker compose ... logs --since 3m api worker beat`

Healthy signs:
- API starts cleanly after migrations
- worker shows `celery@... ready.`
- beat shows `beat: Starting...`
- no Celery `SecurityWarning` about superuser/root
- `/me/usage` weekly totals match the DB-backed `usage_counters` rows for the current week

## Failure Patterns

### 1. Tests fail with old behavior after a failed build

Symptom:
- pytest output does not match current source

Cause:
- `docker compose run` reused the last successful image because the rebuild failed

Fix:
1. stop trusting the test output
2. make the build green first
3. rerun the test command only after a successful rebuild

### 2. Build tries to fetch the private engine over SSH

Symptom:
- `Updating ssh://git@github.com/thecontextcache/contextcache-engine.git`

Cause:
- secret-enabled or no-token branch is not on the expected code path
- or runtime `uv run` attempted a sync

Fix:
- use `uv run --no-sync`
- rebuild the image from current Dockerfile

### 3. Recall crashes inside the private engine

Symptom:
- traceback from private `run_hybrid_rag_recall`

Current expected behavior:
- API returns `503 Service Unavailable` during the private-engine cooldown window
- API does not silently degrade into an unbounded in-process recall scan
- local fallback remains available only when the private engine is not configured at all

Relevant file:
- `/Users/nd/Documents/contextcache/api/app/analyzer/algorithm.py`

Useful check:

```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml logs -n 150 api | rg -n "Private hybrid recall failed|Recall engine temporarily unavailable"
```

If you have an admin session and need to inspect one API process directly:
- `GET /admin/system/engine-status`
- `mode=circuit_open` means the configured private engine failed recently
- `mode=local_fallback_only` means this build has no private engine configured

### 4. Worker warns about running as root

Symptom:
- Celery `SecurityWarning`

Current expected behavior:
- no root warning in fresh production runtime images

If warning returns:
- image is stale or runtime user change was bypassed

### 5. Usage or plan enforcement looks inconsistent

Symptoms:
- `/me/usage` weekly totals look wrong after a restart
- unlimited users still appear capped in the UI
- a just-changed user/org plan does not affect the next org or API-key create

Current expected behavior:
- daily and weekly usage enforcement are derived from PostgreSQL `usage_counters`
- `/me/usage` shows effective limits, so unlimited users see zeroed limit fields
- user plan changes affect the next org creation check
- org plan changes affect the next active API key creation check

### 5. Ingest capture stays failed right after submit

Symptom:
- `POST /ingest/raw` or `POST /ingest/raw/{id}/replay` returns a capture with `processing_status=failed`
- `last_error` mentions broker or dispatch failure

Current expected behavior:
- API persisted the capture row
- worker dispatch failed visibly instead of pretending the capture is queued
- caller can inspect status or replay later using the returned `capture_id`

Useful checks:
- `docker compose --env-file .env -f infra/docker-compose.prod.yml logs -n 150 api worker redis`
- look for `worker dispatch failed` in API logs
- confirm Redis/broker reachability before replaying a backlog of failed captures

### 6. Web looks stale after deploy

Symptom:
- old redirects, old middleware behavior, or old UI

Fix:
```bash
docker compose build --no-cache web
docker compose up -d web
```

Then:
- purge Cloudflare cache
- hard refresh browser

## Mental Model For Debugging

When something breaks, separate the problem first:

- build problem
- container startup problem
- runtime request problem
- background worker problem
- data/migration problem

That separation saves a lot of time. Most of the painful loops we just cleaned
up came from mixing those together and reading stale test signals as if they
were current runtime failures.
