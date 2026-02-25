# TheContextCache™

[![CI](https://github.com/nd-contextcache/contextcache/actions/workflows/ci.yml/badge.svg)](https://github.com/nd-contextcache/contextcache/actions/workflows/ci.yml)

> Invite-only alpha — Project Brain for AI-assisted teams.

Capture high-signal decisions and findings, then recall paste-ready context packs when your LLM needs them.

---

## Stack

| Layer | Technology |
|-------|-----------|
| API | FastAPI + SQLAlchemy (async) + Postgres 16 |
| Web | Next.js 15 App Router + React 19 + TypeScript + Tailwind CSS v4 |
| Auth | Magic-link sessions (HttpOnly cookie) + API keys |
| Docs | MkDocs Material |
| Infra | Docker Compose |

---

## Quickstart

```bash
cp .env.example .env
# Edit .env with your values
docker compose up -d --build
```

- Web: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- MkDocs: `http://localhost:8001`

---

## Architecture & deployment model

- Runtime host: single Ubuntu server (your old laptop).
- Public ingress: Cloudflare Tunnel.
- Services:
  - `web` (Next.js) on port `3000`
  - `api` (FastAPI) on port `8000`
  - `docs` (MkDocs) on port `8001`
  - `db` (Postgres + pgvector) internal
  - `redis` internal
- Domain routing:
  - `thecontextcache.com` → `web`
  - `api.thecontextcache.com` → `api`
  - `docs.thecontextcache.com` → `docs`

### Compose environments (professional split)

- Dev:
  - `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`
- Prod:
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
  - binds web/api/docs to `127.0.0.1` so only Cloudflared can reach them.

---

## Deployment modes

### Mode A — Tailscale / private network

Set in `.env`:

```env
APP_ENV=dev
APP_PUBLIC_BASE_URL=http://<tailscale-ip>:3000
CORS_ORIGINS=http://localhost:3000,http://<tailscale-ip>:3000
```

### Mode B — Cloudflare Tunnel (subdomain, recommended for production)

Each service gets its own subdomain — no nginx needed.

```
https://thecontextcache.com       → web (Next.js)
https://api.thecontextcache.com   → API (FastAPI)
https://docs.thecontextcache.com  → docs (MkDocs)
```

```env
APP_ENV=prod
APP_PUBLIC_BASE_URL=https://thecontextcache.com
CORS_ORIGINS=https://thecontextcache.com
NEXT_PUBLIC_DOCS_URL=https://docs.thecontextcache.com
DAILY_MAX_MEMORIES=100
DAILY_MAX_RECALLS=50
DAILY_MAX_PROJECTS=10
WEEKLY_MAX_MEMORIES=500
WEEKLY_MAX_RECALLS=300
WEEKLY_MAX_PROJECTS=50
REDIS_URL=redis://redis:6379/0
```

See [`docs/06-deployment.md`](docs/06-deployment.md) for the full setup guide,
including the `cloudflared` config at `docs/examples/cloudflared-config.yml`.

If `/` serves stale content after deploy:

```bash
docker compose build --no-cache web
docker compose up -d web
# then purge Cloudflare cache and hard-refresh browser
```

---

## Tests

```bash
docker compose --profile test run --rm api-test
docker compose --profile test down -v
```

## Linting & hooks

```bash
# API style checks (inside dev container or local venv)
uv --project api run black --check app tests
uv --project api run flake8 app tests
uv --project api run bandit -r app -x tests

# Web lint (requires npm deps)
npm --prefix web run lint

# Optional pre-commit install
pip install pre-commit
pre-commit install
```

## Debugging / sanity checks

```bash
# API + worker/redis health probes
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/health/worker
curl -s http://127.0.0.1:8000/health/redis

# Session auth probe
curl -i http://127.0.0.1:8000/auth/me
```

If the footer Docs link opens `http://localhost:8001` on a server deployment,
set `NEXT_PUBLIC_DOCS_URL=https://docs.thecontextcache.com` in `.env` and rebuild web:

```bash
docker compose up -d --build web
```

If the web shows `Service Temporarily Unavailable` with detected API endpoint `/api`,
check API startup + DB extension support:

```bash
docker compose logs -n 120 api
docker compose ps
```

If logs mention pgvector/`vector` extension failures, use the pgvector DB image
(`pgvector/pgvector:pg16`) and rebuild:

```bash
docker compose up -d --build db api web
```

If the site renders a blank white screen with React hydration errors in console:

- ensure `/Users/nd/Documents/contextcache/web/app/global-error.js` does **not** render `<html>` / `<body>`
- run:

```bash
npm --prefix web run check:global-error
docker compose up -d --build web
```

If CAG cache diagnostics are needed (admin key/session required):

```bash
python cli/cc.py admin cag-stats --api-base https://api.thecontextcache.com --api-key cck_xxx --org-id 1
python cli/cc.py admin cag-evaporate --api-base https://api.thecontextcache.com --api-key cck_xxx --org-id 1
```

If seeded projects are missing in `/app`, verify org scope:

- Open `/app` and use the **Organization Scope** selector in the sidebar.
- The UI stores selected org in `CONTEXTCACHE_ORG_ID` (localStorage).
- Clear and reload if needed:

```js
localStorage.removeItem("CONTEXTCACHE_ORG_ID")
location.reload()
```

## Worker profile

```bash
docker compose --profile worker up -d worker beat
```

When `WORKER_ENABLED=true`, background tasks run for:
- embeddings/contextualization
- magic link cleanup
- session/invite/waitlist retention cleanup
- recall hedge p95 cache refresh

## Infra baseline

`infra/` now includes a lightweight starter:

- `infra/README.md`
- `infra/terraform/` reference variables/outputs for Postgres + Redis wiring
- `infra/cloudflare/tunnel.example.yml`

## Load test (optional)

```bash
python -m pip install locust
export LOADTEST_API_KEY=cck_xxx
export LOADTEST_ORG_ID=1
export LOADTEST_PROJECT_ID=1
locust -f scripts/load_test_locust.py --host http://127.0.0.1:8000
```

---

## Auth flow

1. Admin sends an invitation from `/admin`.
2. User visits `/auth` and requests a magic link.
3. In dev mode, if SES is not configured, the link is printed to API logs and returned as `debug_link` in the response.
4. User follows the link to `/auth/verify?token=...`.
5. API sets a secure `HttpOnly` session cookie; user lands in `/app`.

SES production note:
- Keep SES in sandbox/dev mode until Amazon production access is approved.
- After approval, set `APP_ENV=prod` and configure:
  `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`.
- If SES is blocked and login is urgent, temporarily set:
  - `MAGIC_LINK_ALLOW_LOG_FALLBACK=true`
  - then use returned/logged `debug_link`.
  - set it back to `false` after recovery.

---

## Environment

Copy `.env.example` to `.env`. Key variables are documented inline in that file.

Never commit `.env` — it is git-ignored.

Note: Docker Compose reads `.env` automatically. You generally do **not** need
to run `source .env`. If you do source it in a shell, quote values containing
spaces (example: `BOOTSTRAP_ORG_NAME="Demo Org"`).

---

## CLI (cc)

A zero-dependency Python CLI for interacting with the API from the terminal or scripts.

**Requirements:** Python 3.9+ (no extra packages needed)

### Setup

```bash
# Save your API key (created in the web UI under Org → API Keys)
python cli/cc.py login --api-key cck_yourkey --base-url https://api.thecontextcache.com

# Or for local dev
python cli/cc.py login --api-key cck_yourkey --base-url http://localhost:8000
```

Config is stored at `~/.contextcache/config.json` (chmod 600).

### Commands

```bash
# Check API health
python cli/cc.py health

# Projects
python cli/cc.py projects list
python cli/cc.py projects create "My Project"

# Memories
python cli/cc.py mem add --project 1 --type decision --text "We chose Postgres for persistence"
python cli/cc.py mem add --project 1 --type note --file ./notes.txt --title "Sprint retro"
python cli/cc.py mem list --project 1

# Recall
python cli/cc.py recall --project 1 "postgres schema decisions"

# Today's usage
python cli/cc.py usage

# Integrations
python cli/cc.py integrations upload --project 1 --type note --text "Captured from CLI"
python cli/cc.py integrations list --project 1 --limit 20 --offset 0
python cli/cc.py seed-mock-data

# Global runtime overrides (works with any command)
python cli/cc.py projects list --api-base http://127.0.0.1:8000 --api-key cck_xxx --org-id 1
```

Direct SQLAlchemy mock seed utility:

```bash
docker compose exec api uv run python -m app.seed_mock_data

# Host wrapper (if your DATABASE_URL targets localhost DB)
python scripts/seed_mock_data.py
```

### Alias (optional)

```bash
# Add to ~/.zshrc or ~/.bashrc
alias cc="python /path/to/contextcache/cli/cc.py"
```
