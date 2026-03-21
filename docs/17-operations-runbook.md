# Operations Runbook

This runbook covers practical production ops for the current single-server deployment.

## Current status baseline

Use these checks after every deploy:

```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml ps
docker compose --env-file .env -f infra/docker-compose.prod.yml logs -n 120 api | rg -n 'ERROR|Traceback|migrate'
docker compose --env-file .env -f infra/docker-compose.prod.yml logs -n 120 worker | rg -n 'ERROR|Traceback'
```

## Deploy with less downtime

`make prod-deploy` now performs:
1. build updated images
2. recreate app services only (`api`, `worker`, `beat`, `web`, `docs`)
3. keep `db` and `redis` running

Command:

```bash
make prod-deploy
```

Hard reset (downtime + cache prune) is still available:

```bash
make prod-deploy-hard
```

Safer variant with verification:

```bash
make prod-deploy-safe
```

## Database observability on server

Helper script:

```bash
./scripts/db_ops.sh logs
./scripts/db_ops.sh activity
./scripts/db_ops.sh locks
./scripts/db_ops.sh size
./scripts/db_ops.sh schema
```

Equivalent make targets:

```bash
make prod-db-logs
make prod-status
make prod-db-backup
make prod-db-restore-verify
```

## Backup and restore verification

Create an on-host compressed backup:

```bash
./scripts/db_backup.sh
```

Restore verification without touching the live database:

```bash
./scripts/db_restore_verify.sh backups/contextcache-YYYYmmdd-HHMMSS.sql.gz
```

What restore verification does:

1. creates a temporary database inside the running Postgres container
2. restores the supplied dump into that temporary database
3. runs a small schema/query sanity check
4. drops the temporary database

This is the minimum bar before calling backups "real."

## Rollback checklist

If a deploy is unhealthy:

1. stop changing the system
2. inspect `docker compose ... logs -n 150 api web worker`
3. if the break is code-only, roll back the app image/container first
4. if the break is schema-related and not forward-compatible, restore from the
   last known-good dump only after confirming the application rollback is not enough

The failure boundary matters:

- code bug: rollback app
- bad env/config: fix env and restart
- destructive migration/data corruption: restore database

Do not restore the database just because a container failed to boot.

## Visual DB tooling from Mac (DBeaver/TablePlus/pgAdmin)

Production compose binds Postgres to loopback on the server:

- `127.0.0.1:${POSTGRES_LOCAL_PORT:-55432} -> db:5432`

From Mac, open SSH tunnel:

```bash
ssh -N -L 55432:127.0.0.1:55432 nd@<your-server-host-or-ip>
```

Then connect GUI tool to:

- Host: `127.0.0.1`
- Port: `55432`
- DB: `contextcache_dev` (or your `POSTGRES_DB`)
- User: `contextcache` (or your `POSTGRES_USER`)
- Password: your `POSTGRES_PASSWORD`

## Downtime reality check

On one host with one API container, there is still a short restart gap while the container is replaced.
To get near-zero downtime you need at least:

1. two API replicas behind a proxy/load-balancer
2. rolling container replacement (blue/green or canary)
3. health-checked cutover
