# Deployment (Dev/Staging)

<!--
  This document covers server setup and deployment procedures.
  MVP uses a single Ubuntu server accessed via Tailscale.
  
  No public internet exposure. All access is via Tailscale private network.
-->

## Server Requirements

### Hardware
- Ubuntu 22.04+ (or similar Linux)
- 2+ GB RAM (Postgres + API + MkDocs)
- 20+ GB disk (Docker images, database)

### Software
- Docker Engine
- Docker Compose v2
- Git
- Tailscale
- 1Password CLI (`op`) — for secrets management

---

## Initial Server Setup

### 1. Install Docker

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add user to docker group (logout/login after)
sudo usermod -aG docker $USER

# Verify
docker --version
docker compose version
```

### 2. Install Tailscale

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate
sudo tailscale up

# Get your Tailscale IP
tailscale ip -4
```

### 3. Install 1Password CLI

```bash
# Install op CLI (see 1Password docs for latest)
# https://developer.1password.com/docs/cli/get-started

# Verify
op --version
```

### 4. Clone Repository

```bash
# Clone the repo
git clone https://github.com/your-org/contextcache.git
cd contextcache
```

---

## Environment Setup

### Generate `.env` from 1Password

Secrets are stored in 1Password. Generate `.env` on the server:

```bash
# Login to 1Password (if not already)
eval $(op signin)

# Generate .env from 1Password template
op inject -i .env.1password -o .env
```

**Alternative: Manual `.env` creation**

If you don't have 1Password set up yet:

```bash
# Copy example
cp .env.example .env

# Edit with real values
nano .env
```

**Required variables:**

```env
POSTGRES_USER=contextcache
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=contextcache
DATABASE_URL=postgresql://contextcache:<password>@postgres:5432/contextcache
```

---

## Running the Stack

### Start All Services

```bash
docker compose up -d --build
```

This starts:
- `api` — FastAPI on port 8000
- `postgres` — PostgreSQL on port 5432 (internal)
- `docs` — MkDocs on port 8001

### Verify Services

```bash
# Check all containers are running
docker compose ps

# Expected output:
# NAME                COMMAND                  STATUS
# contextcache-api    "uvicorn app.main..."   Up
# contextcache-postgres "docker-entrypoint..." Up
# contextcache-docs   "mkdocs serve..."        Up
```

### Test Endpoints

```bash
# Health check
curl http://localhost:8000/health

# Should return: {"status": "ok"}
```

---

## Deployment Script

Use `deploy.sh` to pull changes and restart:

```bash
#!/bin/bash
# deploy.sh — Pull latest code and redeploy

set -e  # Exit on error

echo "=== Pulling latest code ==="
git pull origin main

echo "=== Rebuilding and restarting ==="
docker compose up -d --build

echo "=== Checking services ==="
docker compose ps

echo "=== Deployment complete ==="
```

**Make it executable:**

```bash
chmod +x deploy.sh
```

**Run deployment:**

```bash
./deploy.sh
```

---

## Accessing Services

All access is via Tailscale (no public exposure):

| Service | URL | Purpose |
|---------|-----|---------|
| API | `http://<tailscale-ip>:8000` | REST API |
| API Docs | `http://<tailscale-ip>:8000/docs` | Swagger UI |
| Docs Site | `http://<tailscale-ip>:8001` | MkDocs |

Get your Tailscale IP:

```bash
tailscale ip -4
# Example: 100.126.216.28
```

---

## Data Persistence

### Database Volume

Postgres data is persisted in a Docker volume:

```yaml
# docker-compose.yml
volumes:
  postgres_data:
```

Data survives container restarts. Only lost if volume is explicitly deleted.

### Backup (Manual for MVP)

```bash
# Dump database
docker compose exec postgres pg_dump -U contextcache contextcache > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U contextcache contextcache
```

---

## Updating the Stack

### Normal Update (Code Changes)

```bash
./deploy.sh
```

### Dependency Update

If `uv.lock` changed:

```bash
# deploy.sh handles this automatically with --build
./deploy.sh
```

### Database Schema Change

For MVP, we recreate:

```bash
# WARNING: This deletes all data
docker compose down -v  # -v removes volumes
docker compose up -d --build
```

Phase 2 adds proper migrations with Alembic.

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs api
docker compose logs postgres

# Common issues:
# - Port already in use
# - Missing .env file
# - Database connection string wrong
```

### Database Connection Failed

```bash
# Verify Postgres is running
docker compose ps

# Check DATABASE_URL in .env matches docker-compose.yml
# Host should be 'postgres' (service name), not 'localhost'
```

### API Returns 500 Error

```bash
# Check API logs for stack trace
docker compose logs -f api

# Common issues:
# - Database not initialized
# - Missing environment variable
```

### Docs Not Loading

```bash
# Check MkDocs logs
docker compose logs docs

# Restart docs service
docker compose restart docs
```

---

## Maintenance Commands

```bash
# Stop all services
docker compose down

# Stop and remove volumes (DELETES DATA)
docker compose down -v

# View running containers
docker compose ps

# View logs (follow mode)
docker compose logs -f

# Restart specific service
docker compose restart api

# Rebuild specific service
docker compose up -d --build api

# Prune unused Docker resources
docker system prune -f
```
