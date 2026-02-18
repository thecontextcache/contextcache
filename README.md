# ContextCache (Phase 1 MVP)

ContextCache is a shared, opt-in project memory layer for AI workflows.
Teams save high-signal memory cards and recall a paste-ready memory pack.

## Quickstart

### 1) Start services

```bash
docker compose up -d --build
```

Postgres ports are intentionally not exposed in default compose.
If you need host access for local debugging, create a local override file:

```yaml
# docker-compose.override.yml
services:
  db:
    ports:
      - "5432:5432"
```

Auth is DB-backed via `/orgs/{org_id}/api-keys`; use seeded key for local development.
API startup now runs `python -m app.migrate` before serving requests.
The migration runner handles both fresh DBs and legacy pre-Alembic DBs safely.
For stable local auth, set `BOOTSTRAP_API_KEY` in `.env` (dev only). If no active keys exist,
startup will ensure that exact key (hashed in DB) under `BOOTSTRAP_ORG_NAME` / `BOOTSTRAP_KEY_NAME`.

### 2) Verify API

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"status":"ok"}
```

## Debugging / Sanity checks

```bash
# /me with bootstrap key
curl -s http://127.0.0.1:8000/me -H "X-API-Key: $BOOTSTRAP_API_KEY"
curl -s http://<server-ip>:8000/me -H "X-API-Key: $BOOTSTRAP_API_KEY"

# DB checks from inside container
docker compose exec db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,name,prefix,revoked_at FROM api_keys ORDER BY id DESC LIMIT 5;"'
docker compose exec db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,name FROM organizations ORDER BY id DESC LIMIT 5;"'

# CORS preflight
curl -i -X OPTIONS "http://127.0.0.1:8000/projects" \
  -H "Origin: http://127.0.0.1:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-api-key,x-org-id,content-type"

# Integration tests
docker compose --profile test run --rm api-test
```

### 3) Seed demo data (optional)

```bash
docker compose exec api uv run python -m app.seed
```

Seed prints:

- demo org id
- demo API key (shown once if created)

Set env vars for scripts/curl:

```bash
export API_KEY="cck_..."
export ORG_ID="1"
```

If you need to seed into an existing org:

```bash
SEED_ORG_ID=1 docker compose exec api uv run python -m app.seed
```

If you need to force-rotate Demo Org keys during seed:

```bash
FORCE_ROTATE_DEMO_KEY=1 docker compose exec api uv run python -m app.seed
```

### 4) Run end-to-end demo script

```bash
./scripts/demo.sh
```

Use a different API base URL if needed:

```bash
./scripts/demo.sh http://<server-ip>:8000
```

### 5) Open docs

- Web UI: `http://localhost:3000`
- Swagger: `http://localhost:8000/docs`
- MkDocs site: `http://localhost:8001`

In the web UI, paste API key and click `Connect` to auto-detect org id from `/me`.

### 6) Run tests

```bash
docker compose --profile test run --rm api-test
```

Profile behavior:
- Normal: `docker compose up -d` does not start `db-test` or `api-test`.
- Tests: `docker compose --profile test up -d db-test` then `docker compose --profile test run --rm api-test`.
- Optional cleanup: `docker compose --profile test down -v`.

If `db-test` is still running:

```bash
docker compose --profile test down -v
# or force-remove only db-test
docker compose rm -sf db-test
```

Quick helper:

```bash
./scripts/test.sh
```

Run migrations manually if needed:

```bash
docker compose exec api uv run python -m app.migrate
```

Legacy recovery behavior:
- Fresh DB: runs `alembic upgrade head`
- Existing tables without Alembic state: stamps baseline, then upgrades
- Existing Alembic state: runs `alembic upgrade head`

If API is in a restart loop after migration changes:

```bash
docker compose logs -n 200 api
docker compose exec api uv run python -m app.migrate
docker compose up -d --build api
```

## Dev DB Recovery

If dev DB was polluted by test/manual data, use one of these:

1. Full dev DB reset (recommended):

```bash
docker compose down
docker volume rm contextcache_pgdata
docker compose up -d --build
docker compose exec api uv run python -m app.seed
```

2. Keep volume, clear core tables:

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
"TRUNCATE TABLE audit_logs,memories,projects,memberships,api_keys,users,organizations RESTART IDENTITY CASCADE;"
docker compose restart api
docker compose exec api uv run python -m app.seed
```

Server reset + verification (dev DB only):

```bash
# 1) Wipe only dev DB volume (test DB volume untouched)
docker compose down
docker volume rm contextcache_pgdata
docker compose up -d --build

# 2) Confirm api container sees bootstrap env vars
docker compose exec api env | grep BOOTSTRAP_

# 3) Confirm bootstrap key row exists in dev DB
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
"SELECT id,name,prefix,revoked_at FROM api_keys ORDER BY id DESC LIMIT 5;"

# 4) Verify /me with bootstrap key (localhost + server IP)
curl -s http://127.0.0.1:8000/me -H "X-API-Key: $BOOTSTRAP_API_KEY"
curl -s http://<server-ip>:8000/me -H "X-API-Key: $BOOTSTRAP_API_KEY"
```

## Locked Out?

Rotate a key from inside the API container:

```bash
docker compose exec api uv run python -m app.rotate_key --org-id X --name demo-key
```

Then set the new key in your `.env` operator workflow and restart:

```bash
# update your .env with the new API_KEY value
docker compose up -d --build
```

## Current scope (Phase 1)

- Projects: create/list
- Memory cards: create/list
- Recall: Postgres FTS ranking + recency fallback
- Memory pack output grouped by memory type
- Tiny Next.js UI: select project, add memory, recall, copy/download export

## Planned Phase 2 upgrades

- Auth/Teams/Roles
- Better retrieval (Postgres FTS and/or embeddings)
- Basic UI

See `/Users/nd/Documents/contextcache/docs/08-roadmap.md` for the phased plan.
