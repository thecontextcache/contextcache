# ContextCache

ContextCache is an invite-only alpha for capturing high-signal project memories and recalling ranked memory packs.

## Stack

- API: FastAPI + SQLAlchemy async + Postgres
- Web: Next.js App Router
- Docs: MkDocs
- Auth: Magic-link sessions (web) + API keys (programmatic)

## Quickstart

```bash
docker compose up -d --build
```

Open:

- Web: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- MkDocs: `http://localhost:8001`

## Environment

Copy `.env.example` to `.env` and set values.

Important vars:

- `APP_ENV=dev|prod|test`
- `APP_PUBLIC_BASE_URL` (magic-link URL host)
- `CORS_ORIGINS` (comma-separated web origins)
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`
- `MAGIC_LINK_TTL_MINUTES`, `SESSION_TTL_DAYS`, `MAX_SESSIONS_PER_USER`
- `AUTH_RATE_LIMIT_PER_IP_PER_HOUR`, `AUTH_RATE_LIMIT_PER_EMAIL_PER_HOUR`, `AUTH_VERIFY_RATE_LIMIT_PER_IP_PER_HOUR`
- `BOOTSTRAP_API_KEY` (dev-only stable fallback key)
- `NEXT_PUBLIC_API_BASE_URL` (optional)
- `NEXT_PUBLIC_DOCS_URL` (optional; avoids localhost links on server deploy)

## Auth flow

1. Admin creates invite from `/admin`.
2. User opens `/auth` and requests magic link.
3. API sends SES email (or logs debug link in `APP_ENV=dev` if SES fails).
4. User verifies token at `/auth/verify?token=...`.
5. API sets `HttpOnly` session cookie and user enters `/app`.

Rules:

- `/app` and `/admin` are session-gated in UI.
- `/admin/*` API endpoints require `is_admin=true`.
- Core APIs accept session auth or `X-API-Key`.

## SES behavior

- `APP_ENV=dev`: SES failure falls back to console log and `/auth/request-link` returns `debug_link`.
- `APP_ENV!=dev`: SES failure returns HTTP 500 (`Email delivery failed`).

## Tests

```bash
docker compose --profile test run --rm api-test
```

Profile behavior:

- Normal: `docker compose up -d` does not start `db-test`/`api-test`.
- Tests: `docker compose --profile test up -d db-test` then run `api-test`.
- Cleanup: `docker compose --profile test down -v`

## Debugging / sanity checks

```bash
# Health
curl -s http://127.0.0.1:8000/health

# Session me (after login)
curl -i -s http://127.0.0.1:8000/auth/me

# API key me (programmatic path)
curl -s http://127.0.0.1:8000/me -H "X-API-Key: $BOOTSTRAP_API_KEY"

# CORS preflight
curl -i -X OPTIONS "http://127.0.0.1:8000/projects" \
  -H "Origin: http://127.0.0.1:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-api-key,x-org-id,content-type"

# DB rows
docker compose exec db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,name,prefix,revoked_at FROM api_keys ORDER BY id DESC LIMIT 5;"'
```

## If db-test is still running

```bash
docker compose --profile test down -v
# or
docker compose rm -sf db-test
```

## Dev DB reset

```bash
docker compose down
docker volume rm contextcache_pgdata
docker compose up -d --build
```

Then verify bootstrap key visibility:

```bash
docker compose exec api env | grep BOOTSTRAP_API_KEY
```
