# ContextCache (Phase 1 MVP)

ContextCache is a shared, opt-in project memory layer for AI workflows.
Teams save high-signal memory cards and recall a paste-ready memory pack.

## Quickstart

### 1) Start services

```bash
docker compose up -d --build
```

Auth is DB-backed via `/orgs/{org_id}/api-keys`; use seeded key for local development.
API startup now runs `python -m app.migrate` before serving requests.
The migration runner handles both fresh DBs and legacy pre-Alembic DBs safely.

### 2) Verify API

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"status":"ok"}
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
docker compose exec api uv run --with pytest --with httpx pytest -q
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
