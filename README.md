# ContextCache (Phase 1 MVP)

ContextCache is a shared, opt-in project memory layer for AI workflows.
Teams save high-signal memory cards and recall a paste-ready memory pack.

## Quickstart

### 1) Start services

```bash
docker compose up -d --build
```

Auth is DB-backed via `/orgs/{org_id}/api-keys`; use seeded key for local development.

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

In the web UI, set your API key and org id in the `API Key` and `Org Context` sections.

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
