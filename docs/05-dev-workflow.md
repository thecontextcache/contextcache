# Dev Workflow

## Start stack

```bash
docker compose up -d --build
```

`docker compose` loads `.env` automatically. Prefer that over `source .env`.
If you source manually, quote values that contain spaces.

Services:
- API: `:8000`
- Web: `:3000`
- Docs: `:8001`
- DB: internal only

## Run tests

```bash
docker compose --profile test run --rm api-test
```

## Linting

```bash
uv --project api run black --check app tests
uv --project api run flake8 app tests
uv --project api run bandit -r app -x tests
uv --project api run pip-audit -r requirements.lock
npm --prefix web run lint
```

Optional hooks:

```bash
pip install pre-commit
pre-commit install
```

Optional explicit test DB boot:

```bash
docker compose --profile test up -d db-test
docker compose --profile test run --rm api-test
docker compose --profile test down -v
```

## Invite-only auth flow

1. Sign in as admin (existing session) and open `/admin`.
2. Create invite for user email.
3. User opens `/auth` and requests link.
4. In dev, if SES fails/sandbox blocks, use `debug_link` returned by `/auth/request-link` (visible in API logs and CLI; not shown in the web UI for security).
5. `/auth/verify` sets session cookie and redirects to `/app`.

### Multi-org behavior in the web UI

- The `/app` sidebar always shows current **Organization Scope**.
- If your user belongs to multiple orgs, use the org selector to switch project context.
- The selected org id is saved in browser localStorage as `CONTEXTCACHE_ORG_ID`.
- If you seed data into another org and do not see it, switch org scope first.

Admin guidance:
- `POST /admin/invites` is for direct access grants (known email).
- Waitlist flow is for inbound requests:
  1. user joins via `POST /waitlist`
  2. admin reviews in `/admin/waitlist`
  3. approve creates an invite automatically.

## Programmatic API flow (API keys)

Use `X-API-Key` (and optional `X-Org-Id`) for scripts/CLI.

```bash
curl -s http://127.0.0.1:8000/projects \
  -H "X-API-Key: $BOOTSTRAP_API_KEY"
```

## CORS preflight check

```bash
curl -i -X OPTIONS "http://127.0.0.1:8000/projects" \
  -H "Origin: http://127.0.0.1:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-api-key,x-org-id,content-type"
```

Expected: `200/204` and `Access-Control-Allow-*` headers including requested auth headers.

## Migration flow

API runtime starts with:

```bash
python -m app.migrate
```

Behavior:
- fresh DB: `upgrade head`
- legacy DB without alembic row: stamp baseline then upgrade
- normal DB: upgrade head

Manual run:

```bash
docker compose exec api uv run python -m app.migrate
```

## CAG cache diagnostics (admin)

```bash
python cli/cc.py admin cag-stats --api-base https://api.thecontextcache.com --api-key cck_xxx --org-id 1
python cli/cc.py admin cag-evaporate --api-base https://api.thecontextcache.com --api-key cck_xxx --org-id 1
```

## Server docs link

Set `NEXT_PUBLIC_DOCS_URL` in `.env` when the docs host differs from `http://<server>:8001`.

Example:

```env
NEXT_PUBLIC_DOCS_URL=https://docs.thecontextcache.com
```
