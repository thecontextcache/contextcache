# Deployment

## Prerequisites

- Docker + Compose v2
- `.env` with production values
- TLS/reverse proxy if internet-facing

## Start

```bash
docker compose up -d --build
```

## Services

- `api` on `:8000`
- `web` on `:3000`
- `docs` on `:8001`
- `db` internal only

`db-test` and `api-test` run only with `--profile test`.

## Required production env

- `APP_ENV=prod`
- `APP_PUBLIC_BASE_URL=https://thecontextcache.com`
- `CORS_ORIGINS=https://thecontextcache.com`
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

Optional web env:
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_DOCS_URL`

## Migrations

API container runs migrations on startup via:

```bash
python -m app.migrate
```

Manual:

```bash
docker compose exec api uv run python -m app.migrate
```

## Verification

```bash
curl -s http://127.0.0.1:8000/health
curl -i -s http://127.0.0.1:8000/auth/me
```

Check logs:

```bash
docker compose logs -n 200 api web db
```

## Recovery

If dev DB is corrupted and this is a non-prod environment:

```bash
docker compose down
docker volume rm contextcache_pgdata
docker compose up -d --build
```

Test profile cleanup:

```bash
docker compose --profile test down -v
```
