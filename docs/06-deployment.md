# Deployment

Three supported deployment modes. Pick one, set the env vars, rebuild.

---

## Mode C — Cloudflare Tunnel (Subdomain deployment — RECOMMENDED for production)

Each service gets its own public subdomain. No nginx sidecar needed.

```
https://thecontextcache.com       → web:3000   (Next.js)
https://api.thecontextcache.com   → api:8000   (FastAPI)
https://docs.thecontextcache.com  → docs:8001  (MkDocs)
```

The web UI calls `/api/*` through the **Next.js server-side proxy** — the
browser never talks to `api.thecontextcache.com` directly. This means:

- Zero CORS issues for the web UI
- Session cookies set correctly on `thecontextcache.com`
- The API subdomain is still exposed for CLI and direct API access

### 1. Create and authenticate the tunnel

```bash
cloudflared login
cloudflared tunnel create contextcache
```

### 2. Add DNS records (Cloudflare dashboard)

In **Zero Trust → Tunnels → your tunnel → Public Hostnames**, add:

| Subdomain | Domain | Type | URL |
|-----------|--------|------|-----|
| _(blank)_ | `thecontextcache.com` | HTTP | `http://localhost:3000` |
| `api` | `thecontextcache.com` | HTTP | `http://localhost:8000` |
| `docs` | `thecontextcache.com` | HTTP | `http://localhost:8001` |

Or use the config file at `docs/examples/cloudflared-config.yml`.

### 3. Install config

```bash
sudo cp docs/examples/cloudflared-config.yml /etc/cloudflared/config.yml
# Edit tunnel ID and credentials-file path
sudo nano /etc/cloudflared/config.yml
```

### 4. Install as systemd service

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### 5. .env (Mode C)

```env
APP_ENV=prod
APP_PUBLIC_BASE_URL=https://thecontextcache.com
CORS_ORIGINS=https://thecontextcache.com

# Leave NEXT_PUBLIC_API_BASE_URL blank — the Next.js proxy handles /api/*
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_DOCS_URL=https://docs.thecontextcache.com

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<from secrets>
AWS_SECRET_ACCESS_KEY=<from secrets>
SES_FROM_EMAIL=support@thecontextcache.com

POSTGRES_USER=contextcache
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=contextcache

DAILY_MAX_MEMORIES=100
DAILY_MAX_RECALLS=50
DAILY_MAX_PROJECTS=10

# Recall hedging (latency optimization)
HEDGE_DELAY_MS=120
HEDGE_MIN_DELAY_MS=25
HEDGE_USE_P95=true
```

### 6. Start

```bash
docker compose up -d --build
sudo systemctl start cloudflared
```

### Compose profiles

- default profile: `db`, `api`, `web`, `docs`, `redis`
- `test` profile: `db-test`, `api-test`
- `worker` profile: `worker`, `beat`

```bash
# default runtime
docker compose up -d --build

# test stack
docker compose --profile test run --rm api-test

# worker stack
docker compose --profile worker up -d worker beat
```

### Hedged recall tuning

Recall uses speculative execution between:
- CAG (cache/golden-knowledge lookup)
- RAG (hybrid FTS + vector retrieval)

Behavior:
- CAG starts first.
- If CAG is still running after hedge delay, RAG starts.
- First completed result wins; the slower task is canceled.

Config:
- `HEDGE_DELAY_MS`: base hedge delay in milliseconds.
- `HEDGE_MIN_DELAY_MS`: lower bound guardrail.
- `HEDGE_USE_P95=true`: use org-local p95 of recent CAG durations from `recall_timings` instead of static delay.

Recommendation:
- Start with `HEDGE_DELAY_MS=120`, then tune using observed `recall_timings` in production.

### 7. Stale code/cache troubleshooting (root vs `/app`)

If `/` shows an old layout or redirects don’t apply:

1. Rebuild web image without cache:

```bash
docker compose build --no-cache web
docker compose up -d web
```

2. Verify middleware is included in the built image:

```bash
docker compose exec web ls -la /app/middleware.js
```

3. Purge Cloudflare cache (dashboard):
- Caching → Purge cache → Purge everything
- then hard-refresh browser (`Cmd/Ctrl+Shift+R`)

4. Validate route behavior:
- authenticated cookie + `GET /` → redirects to `/app`
- no cookie + `GET /app` → redirects to `/auth`

### Verification checklist

Run these after deployment:

```bash
# 1. API health
curl -s https://api.thecontextcache.com/health
# → {"status":"ok"}

# 2. CORS preflight (should return 200 with Access-Control-Allow-Origin)
curl -si -X OPTIONS https://api.thecontextcache.com/auth/me \
  -H "Origin: https://thecontextcache.com" \
  -H "Access-Control-Request-Method: GET" | grep -i "access-control"

# 3. Docs site
curl -I https://docs.thecontextcache.com
# → HTTP/2 200

# 4. Web UI (check response is HTML)
curl -sI https://thecontextcache.com | head -5

# 5. Browser: open https://thecontextcache.com/auth
#    → request magic link → check docker logs for debug_link
#    → verify → check /app loads + session cookie is set
docker compose logs api | grep -i "MAGIC LINK" | tail -3
```

### Cookie / session notes

- `APP_ENV=prod` sets `Secure=true; SameSite=Lax` on the session cookie.
- Cookies are set by the **web** origin (`thecontextcache.com`) because the
  browser only ever talks to the Next.js proxy, not the API subdomain.
- `SameSite=Lax` is sufficient here — no cross-site POST needed.
- If you ever route the frontend to call `api.thecontextcache.com` directly,
  switch to `SameSite=None; Secure` and set `Domain=.thecontextcache.com`.

---

## Mode A — Tailscale / Private Network

All services are accessed directly by port. No reverse-proxy needed.

```
Browser → http://<tailscale-ip>:3000  (web)
Browser → http://<tailscale-ip>:8000  (api)
Browser → http://<tailscale-ip>:8001  (docs)
```

### .env (Mode A)

```env
APP_ENV=dev
APP_PUBLIC_BASE_URL=http://<tailscale-ip>:3000
CORS_ORIGINS=http://localhost:3000,http://<tailscale-ip>:3000

POSTGRES_USER=contextcache
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=contextcache
```

Leave `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_DOCS_URL` **blank** — the
frontend automatically derives them from `window.location.hostname:8000/8001`.

### Start

```bash
docker compose up -d --build
```

---

## Mode B — Cloudflare Tunnel (HTTPS domain, no open ports)

All traffic reaches the server through a Cloudflare Tunnel. The public domain
is `https://thecontextcache.com`. Cloudflare routes paths to the correct
internal container:

```
https://thecontextcache.com        → web:3000   (Next.js)
https://thecontextcache.com/api/*  → api:8000   (FastAPI)
https://thecontextcache.com/docs/* → docs:8001  (MkDocs)
```

The frontend detects the production domain automatically and switches from
port-based URLs to same-origin relative paths (`/api`, `/docs`), so no
`NEXT_PUBLIC_*` env vars are needed in production.

### Prerequisites

- `cloudflared` installed on the server
- A Cloudflare Zero Trust account with a tunnel created
- DNS CNAME for `thecontextcache.com` pointing to the tunnel

### cloudflared config

Create `/etc/cloudflared/config.yml` (or `~/.cloudflared/config.yml`):

```yaml
tunnel: <YOUR-TUNNEL-ID>
credentials-file: /etc/cloudflared/<YOUR-TUNNEL-ID>.json

ingress:
  # API — prefix match, strip /api prefix before forwarding
  - hostname: thecontextcache.com
    path: ^/api(/.*)?$
    service: http://localhost:8000
    originRequest:
      httpHostHeader: thecontextcache.com

  # Docs site
  - hostname: thecontextcache.com
    path: ^/docs(/.*)?$
    service: http://localhost:8001
    originRequest:
      httpHostHeader: thecontextcache.com

  # Web UI (catch-all)
  - hostname: thecontextcache.com
    service: http://localhost:3000

  # Catch-all 404
  - service: http_status:404
```

!!! note "Path stripping"
    Cloudflare Tunnel does **not** strip path prefixes by default.
    The FastAPI app must be mounted at `/api` or the tunnel config must
    rewrite the path. The simplest approach for FastAPI is to add a
    root path setting or use a nginx/caddy sidecar for prefix stripping.
    See [Nginx sidecar option](#nginx-sidecar-option) below.

<a id="nginx-sidecar-option"></a>
### Nginx sidecar option (recommended for path stripping)

Add a lightweight nginx container that rewrites `/api/` → `/` before proxying
to FastAPI, and `/docs/` → `/` before proxying to MkDocs:

```nginx
# nginx/nginx.conf
server {
    listen 80;

    location /api/ {
        proxy_pass         http://api:8000/;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location /docs/ {
        proxy_pass         http://docs:8001/;
        proxy_set_header   Host $host;
    }

    location / {
        proxy_pass         http://web:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Add to `docker-compose.yml`:

```yaml
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "80:80"
    depends_on:
      - api
      - web
      - docs
    restart: unless-stopped
```

Then point `cloudflared` at `http://localhost:80` instead of individual ports.

### .env (Mode B)

```env
APP_ENV=prod
APP_PUBLIC_BASE_URL=https://thecontextcache.com
CORS_ORIGINS=https://thecontextcache.com

# SES — required in prod; dev falls back to console log
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<from-secrets-manager>
AWS_SECRET_ACCESS_KEY=<from-secrets-manager>
SES_FROM_EMAIL=support@thecontextcache.com

POSTGRES_USER=contextcache
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=contextcache
```

Leave `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_DOCS_URL` **blank** —
the frontend detects the production domain and uses `/api` / `/docs` automatically.

### Start

```bash
docker compose up -d --build
cloudflared tunnel run <YOUR-TUNNEL-NAME>
```

---

## AWS SES production checklist

Domain and `support@thecontextcache.com` are verified in SES. Production access (sandbox removal) is pending AWS approval. Once approved:

1. **Update `.env`** with real credentials:
   ```env
   APP_ENV=prod
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=<your-key-id>
   AWS_SECRET_ACCESS_KEY=<your-secret>
   SES_FROM_EMAIL=support@thecontextcache.com
   APP_PUBLIC_BASE_URL=https://thecontextcache.com
   ```

2. **Remove the `BOOTSTRAP_API_KEY`** line (or leave blank) — it is only used in `APP_ENV=dev`.

3. **Rebuild and restart** the API container:
   ```bash
   docker compose up -d --build api
   ```

4. **End-to-end smoke test** — run once after switching to prod SES:
   ```bash
   # 1. Request a magic link (should send a real email, NOT log to console)
   curl -s -X POST https://api.thecontextcache.com/auth/request-link \
     -H 'Content-Type: application/json' \
     -d '{"email":"your-verified-address@example.com"}'
   # Expected: {"status":"ok","detail":"Check your email...","debug_link":null}

   # 2. Confirm debug_link is null (would be a URL in dev mode)
   # 3. Check your inbox — magic link should arrive within ~30 s
   # 4. Click the link → confirm session cookie is set → /app loads
   ```

5. **Monitor SES bounce/complaint rate** in the AWS console — stay below 0.1% bounce / 0.1% complaint to avoid SES suspension.

---

## Common operations

### Verify API is up

```bash
curl -s http://127.0.0.1:8000/health
# {"status":"ok"}
```

### Run migrations manually

```bash
docker compose exec api uv run python -m app.migrate
```

### View logs

```bash
docker compose logs -n 100 api web db
```

### Run tests

```bash
docker compose --profile test run --rm api-test
docker compose --profile test down -v
```

### Full reset (dev only — wipes data)

```bash
docker compose down
docker volume rm contextcache_pgdata
docker compose up -d --build
```

---

## Background Workers (optional)

Redis is part of the default stack. Worker/beat remain optional.
Enable it when you need async heavy tasks (future: embedding indexing,
batch recall, scheduled cleanup).

### Stack components

| Service | Image | Role |
|---------|-------|------|
| `redis` | `redis:7-alpine` | Shared rate-limit counters + Celery broker/result backend |
| `worker` | same as `api` | Celery worker process |
| `beat` | same as `api` | Celery Beat scheduler (periodic tasks) |

### Database image requirement (pgvector)

Hybrid recall uses native pgvector columns, so Postgres must include the `vector` extension.

Use:

- `pgvector/pgvector:pg16` (recommended)

If you run plain `postgres:16`, API startup can fail during migrations when `CREATE EXTENSION vector` runs.

### Enable worker mode

1. Add to your `.env`:

```env
WORKER_ENABLED=true
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
REDIS_URL=redis://redis:6379/0
```

2. Start the worker profile:

```bash
docker compose --profile worker up -d
```

3. Verify the worker is connected:

```bash
docker compose logs worker | tail -20
# Should show: "celery@... ready."
```

### Disable worker mode

```bash
docker compose --profile worker down
# or simply don't set WORKER_ENABLED=true — tasks are silently skipped
```

### Periodic tasks (Celery Beat)

The `beat` service is included in the `worker` profile and starts automatically with `--profile worker`. It manages cleanup schedules:

| Task | Schedule | Description |
|------|----------|-------------|
| `cleanup_expired_magic_links` | Every hour | Deletes magic links older than 24 h |
| `cleanup_old_usage_counters` | Daily | Purges usage rows older than 90 days |
| `cleanup_old_login_events` | Daily | Purges login-event rows older than 90 days (per-user cap of last 10 is also enforced at write time) |
| `cleanup_old_waitlist_entries` | Daily | Purges waitlist entries older than 90 days |
| `cleanup_expired_sessions` | Daily | Deletes expired auth sessions |
| `cleanup_expired_invites` | Daily | Revokes expired invites |

The schedule lives in `api/app/worker/celery_app.py` — edit that file to add or adjust tasks:

```python
celery_app.conf.beat_schedule = {
    "cleanup-magic-links-hourly": {
        "task": "contextcache.cleanup_expired_magic_links",
        "schedule": crontab(minute=0),           # top of every hour
    },
    "cleanup-usage-counters-nightly": {
        "task": "contextcache.cleanup_old_usage_counters",
        "schedule": crontab(hour=2, minute=0),   # 02:00 UTC
    },
    "cleanup-login-events-nightly": {
        "task": "contextcache.cleanup_old_login_events",
        "schedule": crontab(hour=3, minute=0),   # 03:00 UTC
    },
}
```

Verify beat is running:
```bash
docker compose --profile worker logs beat | tail -20
# Should show: "beat: Starting... Scheduler: DatabaseScheduler"
```

### Worker security notes

- Tasks **must never** receive tokens, API keys, cookies, or magic links.
- Pass only domain IDs (project_id, user_id) and safe content.
- The Redis port is **not exposed** to the host — internal Docker network only.

---

## Internal Analyzer Service (future)

The analyzer scoring/ranking logic currently runs in-process (`ANALYZER_MODE=local`).
When you need to scale scoring independently, you can split it into a private
internal service.

### How it works

```
ANALYZER_MODE=local     → scoring runs inside the API process (default)
ANALYZER_MODE=service   → API calls http://analyzer:9000 on the internal network
```

The `analyzer` service is **never exposed publicly** — no ports are mapped
to the host, and it is unreachable via Cloudflare Tunnel or any public route.

### Enable analyzer service mode

1. Build the analyzer service (separate repo/folder `./analyzer/`).

2. Uncomment the `analyzer:` block in `docker-compose.yml`.

3. Add to `.env`:

```env
ANALYZER_MODE=service
ANALYZER_SERVICE_URL=http://analyzer:9000
```

4. Start:

```bash
docker compose --profile analyzer up -d
```

### Security requirement

The analyzer service **must have no `ports:` mapping** in `docker-compose.yml`.
It communicates only on the Docker internal `default` network, which is
unreachable from outside the host.

---

## Embedding pipeline + hybrid recall

Current behavior:

- Every new memory stores embeddings in:
  - `memories.embedding_vector` (pgvector, 1536 dims)
  - `memories.search_vector` (JSON fallback/debug payload)
- `compute_memory_embedding` (Celery) updates both `memories` and `memory_embeddings`.
- Embeddings use:
  - `EMBEDDING_PROVIDER=openai` when `OPENAI_API_KEY` is configured
  - deterministic local fallback when provider/network is unavailable
- Recall uses hybrid ranking:
  - FTS (`websearch_to_tsquery` + `ts_rank_cd`)
  - vector cosine similarity over `embedding_vector`
  - recency boost

Tune with:

```env
FTS_WEIGHT=0.65
VECTOR_WEIGHT=0.25
RECENCY_WEIGHT=0.10
RECALL_VECTOR_MIN_SCORE=0.20
RECALL_VECTOR_CANDIDATES=200
EMBEDDING_PROVIDER=local
# OPENAI_API_KEY=...
```

### Current pgvector schema

Applied via Alembic:

- `CREATE EXTENSION IF NOT EXISTS vector`
- `memories.embedding_vector vector(1536)`
- IVFFLAT index: `ix_memories_embedding_vector_ivfflat`

Scaling guidance (single-host beta):

- 10-15 users: `worker --concurrency=2` is enough
- 50+ active users: raise worker concurrency and `RECALL_VECTOR_CANDIDATES`
- keep one `beat` instance only
