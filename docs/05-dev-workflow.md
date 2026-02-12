# Dev Workflow

<!--
  This document describes the daily development workflow.
  Source of truth for how code moves from Mac to server.
  
  Key insight: Mac for coding, GitHub for sync, server for running.
-->

## Overview

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│                  │      │                  │      │                  │
│   MacBook        │─────▶│   GitHub         │─────▶│   Ubuntu Server  │
│   (Cursor/Codex) │ push │   (Canonical)    │ pull │   (Docker)       │
│                  │      │                  │      │                  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
        │                                                    │
        │                                                    │
        └────────────────── Tailscale ───────────────────────┘
                          (private access)
```

---

## Source of Truth

| What | Where | Purpose |
|------|-------|---------|
| Code editing | MacBook (Cursor/Codex) | Local development |
| Canonical repo | GitHub | Version control, backup |
| Running services | Ubuntu server | Docker Compose (API, Postgres, Docs) |
| Access method | Tailscale | Private network, no public ports |

---

## Daily Development Loop

### 1. Edit on Mac

```bash
# Open project in Cursor
cd ~/Documents/contextcache
cursor .

# Make changes to API, docs, etc.
```

**Files you'll edit:**
- `api/app/` — FastAPI routes, models, schemas
- `docs/` — MkDocs documentation
- `docker-compose.yml` — Service configuration
- `deploy.sh` — Deployment script

### 2. Test Locally (Optional)

For quick iteration, you can run Docker Compose locally on Mac:

```bash
# Start services
docker compose up -d

# Check API
curl http://localhost:8000/health

# Check web UI
open http://localhost:3000

# Check docs
open http://localhost:8001

# Stop when done
docker compose down
```

Seed demo data:

```bash
docker compose exec api uv run python -m app.seed
```

Copy the printed demo API key and set local env:

```bash
export API_KEY="cck_..."
export ORG_ID="1"
```

Run the end-to-end demo flow:

```bash
./scripts/demo.sh
```

Run FTS ranking smoke demo:

```bash
./scripts/demo_fts.sh
```

### 3. Commit and Push to GitHub

```bash
# Stage changes
git add -A

# Commit with descriptive message
git commit -m "Add recall endpoint with memory pack format"

# Push to GitHub
git push origin main
```

**Commit message guidelines:**
- Start with verb: "Add", "Fix", "Update", "Remove"
- Be specific: "Add recall endpoint" not "Update API"
- Keep under 72 characters

### 4. Deploy to Server

SSH to the Ubuntu server via Tailscale:

```bash
# SSH to server (use your Tailscale hostname or IP)
ssh user@<tailscale-hostname>

# Navigate to project
cd /path/to/contextcache

# Run deploy script
./deploy.sh
```

**What `deploy.sh` does:**
1. `git pull origin main` — Get latest code
2. `docker compose up -d --build` — Rebuild and restart

### 5. Verify Deployment

From your Mac, test the server endpoints via Tailscale:

```bash
# Replace with your server's Tailscale IP
export SERVER=100.126.216.28

# Test API
curl http://$SERVER:8000/health
curl -H "X-API-Key: $API_KEY" -H "X-Org-Id: $ORG_ID" http://$SERVER:8000/projects

# View docs in browser
open http://$SERVER:8001
```

---

## File Structure

```
contextcache/
├── api/                    # FastAPI application
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py         # App entry point
│   │   ├── models.py       # SQLAlchemy models
│   │   ├── schemas.py      # Pydantic schemas
│   │   ├── routes.py       # API endpoints
│   │   └── database.py     # DB connection
│   ├── Dockerfile          # API container
│   ├── pyproject.toml      # Dependencies
│   └── uv.lock             # Locked dependencies
├── docs/                   # MkDocs documentation
│   ├── 00-overview.md
│   ├── 01-mvp-scope.md
│   └── ...
├── docker-compose.yml      # Service orchestration
├── mkdocs.yml              # Docs configuration
├── deploy.sh               # Deployment script
├── .env.example            # Example environment
└── .env                    # Actual secrets (NOT in git)
```

---

## Common Tasks

### Add a New Dependency

```bash
# On Mac, in api/ directory
cd api
uv add <package-name>

# Commit the updated lockfile
git add pyproject.toml uv.lock
git commit -m "Add <package-name> dependency"
git push

# On server: deploy.sh will rebuild with new deps
```

### View Logs

```bash
# On server
docker compose logs -f api        # API logs
docker compose logs -f postgres   # Database logs
docker compose logs -f docs       # MkDocs logs
```

### Create an API Key (Admin/Owner)

```bash
curl -X POST http://localhost:8000/orgs/$ORG_ID/api-keys \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -H "X-Org-Id: $ORG_ID" \
  -d '{"name":"local-dev-key"}'
```

### Restart a Service

```bash
# On server
docker compose restart api
```

### Full Rebuild

```bash
# On server (nuclear option)
docker compose down
docker compose up -d --build
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| API not responding | `docker compose logs api` to check errors |
| Database connection failed | Ensure Postgres is running: `docker compose ps` |
| Changes not reflected | Did you push? Did you run deploy.sh? |
| Port already in use | `docker compose down` then `up` again |
| Docs not updating | MkDocs may need restart: `docker compose restart docs` |

---

## Environment Files

### `.env.example` (committed to git)

Template showing required variables:

```env
POSTGRES_USER=contextcache
POSTGRES_PASSWORD=your-password-here
POSTGRES_DB=contextcache
DATABASE_URL=postgresql://contextcache:your-password-here@postgres:5432/contextcache
```

### `.env` (NOT in git)

Actual secrets, exists only on server. Generated from 1Password.

See [Security](07-security.md) for secrets management.
