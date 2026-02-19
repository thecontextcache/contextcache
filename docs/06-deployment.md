# Deployment

Two supported deployment modes. Pick one, set the env vars, rebuild.

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

The worker stack is **off by default** — the app runs fine without it.
Enable it when you need async heavy tasks (future: embedding indexing,
batch recall, scheduled cleanup).

### Stack components

| Service | Image | Role |
|---------|-------|------|
| `redis` | `redis:7-alpine` | Broker + result backend |
| `worker` | same as `api` | Celery worker process |
| `beat` _(commented)_ | same as `api` | Celery Beat scheduler |

### Enable worker mode

1. Add to your `.env`:

```env
WORKER_ENABLED=true
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
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

Uncomment the `beat:` service block in `docker-compose.yml` and add a
schedule to `api/app/worker/celery_app.py`:

```python
celery_app.conf.beat_schedule = {
    "cleanup-magic-links-daily": {
        "task": "contextcache.cleanup_expired_magic_links",
        "schedule": crontab(hour=3, minute=0),  # 03:00 UTC daily
    },
}
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
