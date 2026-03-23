# System Map

This is the maintainers' view of how the current system actually works in
production, test, and local development.

## Service Topology

| Service | Runtime | Purpose | Publicly reachable |
|---|---|---|---|
| `web` | Next.js | dashboard UI, auth UI, server-side `/api/*` proxy | yes |
| `api` | FastAPI | auth, project/memory APIs, recall, admin, health | yes |
| `docs` | MkDocs | public documentation site | yes |
| `db` | Postgres + pgvector image | primary relational store | no |
| `redis` | Redis | rate limits, Celery broker/backend, hedge p95 cache | no |
| `worker` | Celery worker | async jobs: embeddings, ingest, cleanup, hedge cache refresh | no |
| `beat` | Celery beat | periodic task scheduler | no |
| `ollama` | optional | local embedding/contextualization provider | no |

## Request Flows

### 1. Web auth/session flow

1. Browser talks to `web`, not directly to `api`.
2. `web` proxies `/api/*` to `api`.
3. Magic-link verification happens in `api`.
4. Session cookie is issued for the web origin so browser auth stays same-origin.
5. Admin/global-admin checks happen in `api/app/auth_routes.py`.

Practical consequence:
- if browser auth breaks, inspect both the web proxy behavior and the API cookie logic
- do not start by debugging CORS unless the browser is calling the API subdomain directly

### 2. Recall flow

1. UI or client calls `/projects/{id}/recall`
2. API resolves auth + org scope
3. Recall path uses analyzer adapters under `/Users/nd/Documents/contextcache/api/app/analyzer/`
4. Private engine may provide advanced ranking internals
5. If the private engine is absent, API uses bounded local fallback ranking
6. If the private engine is configured but raises at runtime, API opens a short circuit and returns `503` instead of silently degrading into an unbounded in-process scan
7. Recall metadata and timings can be written for admin/debug views

Private-engine touchpoints:
- `/Users/nd/Documents/contextcache/api/app/analyzer/algorithm.py`
- `/Users/nd/Documents/contextcache/api/app/analyzer/cag.py`
- `/Users/nd/Documents/contextcache/api/app/analyzer/sfc.py`

Operational consequence:
- a non-private-engine build can still serve recall through bounded local fallback
- a configured private-engine regression should now fail closed briefly instead of turning into an invisible O(project size) latency path

### 3. Ingest / refinery flow

1. Capture hits `/ingest/raw`
2. API writes `raw_captures`
3. If `WORKER_ENABLED=true`, Celery worker processes extraction and follow-up work
4. If worker mode is off, parts of the pipeline run inline
5. Worker dispatch failures now leave the capture visibly in `failed` state instead of pretending it is queued
6. Downstream artifacts include inbox items, embeddings/contextualization metadata, and retry/dead-letter state

Core files:
- `/Users/nd/Documents/contextcache/api/app/ingest_routes.py`
- `/Users/nd/Documents/contextcache/api/app/worker/tasks.py`
- `/Users/nd/Documents/contextcache/api/app/inbox_routes.py`

### 4. Admin / audit flow

1. Admin endpoints live mainly in `/Users/nd/Documents/contextcache/api/app/auth_routes.py`
2. Privileged actions should write `AuditLog`
3. Some admin actions can happen without an explicit `X-Org-Id`
4. Audit org resolution now falls back to the actor's first membership org so rows are not silently skipped, even for partially provisioned target auth users

Recent example:
- `POST /admin/cag/evaporate` now writes `admin.cag.evaporate`

## Data Stores

### Postgres

Primary source of truth for:
- auth users, sessions, invites, waitlist
- orgs, memberships, projects, memories
- audit logs, recall logs, recall timings
- ingest pipeline state

### Redis

Used for:
- auth/write rate limiting
- Celery broker/backend
- hedge p95 cache

If Redis is unhealthy:
- worker/beat will degrade or stop
- rate limiting may fall back depending on code path
- recall p95 cache refresh becomes stale, but recall still has static-delay fallback

## Build Modes

### No-token dev/test builds

Goal:
- keep CI, local tests, and `api-test` runnable without private repo access

How:
- lock scrubber removes `contextcache-engine` entries from `uv.lock`
- app uses local fallback shims where needed
- test runs should use `uv run --no-sync ...` to avoid runtime re-resolution

Relevant files:
- `/Users/nd/Documents/contextcache/api/Dockerfile`
- `/Users/nd/Documents/contextcache/api/scripts/strip_private_engine_lock.py`

### Secret-enabled production builds

Goal:
- install the pinned private engine without leaking token into build metadata

How:
- `ENGINE_TOKEN` is passed as BuildKit secret `engine_pat`
- Dockerfile rewrites git URLs only inside the secret-enabled build step
- pinned direct reference is emitted by:
  - `/Users/nd/Documents/contextcache/api/scripts/private_engine_spec.py`

Operational consequence:
- if prod builds fail while test builds pass, check the secret-enabled branch first

## Runtime User Model

Production runtime containers for `api`, `worker`, and `beat` now run as a
non-root user created in `/Users/nd/Documents/contextcache/api/Dockerfile`.

Why it matters:
- removes the Celery superuser warning
- reduces blast radius if a worker task or app process is compromised

If logs still show Celery `SecurityWarning` about superuser privileges:
- the running image is stale
- rebuild and recreate `api`, `worker`, and `beat`

## Files To Know By Heart

If you only memorize a small set of files, make it these:

- `/Users/nd/Documents/contextcache/api/Dockerfile`
- `/Users/nd/Documents/contextcache/docker-compose.yml`
- `/Users/nd/Documents/contextcache/infra/docker-compose.prod.yml`
- `/Users/nd/Documents/contextcache/api/app/main.py`
- `/Users/nd/Documents/contextcache/api/app/auth_routes.py`
- `/Users/nd/Documents/contextcache/api/app/routes.py`
- `/Users/nd/Documents/contextcache/api/app/worker/tasks.py`
- `/Users/nd/Documents/contextcache/docs/06-deployment.md`
- `/Users/nd/Documents/contextcache/docs/17-operations-runbook.md`
