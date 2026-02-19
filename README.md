# TheContextCache™

[![CI](https://github.com/nd-contextcache/contextcache/actions/workflows/ci.yml/badge.svg)](https://github.com/nd-contextcache/contextcache/actions/workflows/ci.yml)

> Invite-only alpha — Project Brain for AI-assisted teams.

Capture high-signal decisions and findings, then recall paste-ready context packs when your LLM needs them.

---

## Stack

| Layer | Technology |
|-------|-----------|
| API | FastAPI + SQLAlchemy (async) + Postgres 16 |
| Web | Next.js 14 App Router |
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

## Deployment modes

### Mode A — Tailscale / private network

Set in `.env`:

```env
APP_ENV=dev
APP_PUBLIC_BASE_URL=http://<tailscale-ip>:3000
CORS_ORIGINS=http://localhost:3000,http://<tailscale-ip>:3000
```

### Mode B — Cloudflare Tunnel (HTTPS domain)

```env
APP_ENV=prod
APP_PUBLIC_BASE_URL=https://thecontextcache.com
CORS_ORIGINS=https://thecontextcache.com
```

The frontend auto-detects the production domain and switches to same-origin
API paths (`/api`, `/docs`). See [`docs/06-deployment.md`](docs/06-deployment.md)
for the full Cloudflare Tunnel and nginx path-stripping setup.

---

## Tests

```bash
docker compose --profile test run --rm api-test
docker compose --profile test down -v
```

---

## Auth flow

1. Admin sends an invitation from `/admin`.
2. User visits `/auth` and requests a magic link.
3. In dev mode, if SES is not configured, the link is printed to API logs and returned as `debug_link` in the response.
4. User follows the link to `/auth/verify?token=...`.
5. API sets a secure `HttpOnly` session cookie; user lands in `/app`.

---

## Environment

Copy `.env.example` to `.env`. Key variables are documented inline in that file.

Never commit `.env` — it is git-ignored.
