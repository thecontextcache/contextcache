# Security

<!--
  This document covers security practices for ContextCache.
  MVP security is minimal but follows essential best practices.
  
  Core principle: Never commit secrets to git.
-->

## Overview

MVP security focuses on:
1. **Secrets management** — Secrets in 1Password, not in git
2. **Network isolation** — Access via Tailscale only, no public ports
3. **Minimal attack surface** — Simple stack, no unnecessary exposure

---

## Secrets Management

### The Rule

> **Never commit secrets to git. Ever.**

This includes:
- Database passwords
- API keys
- JWT secrets
- Any credential

### Where Secrets Live

| Location | What | Access |
|----------|------|--------|
| 1Password | Source of truth for secrets | Team members with vault access |
| `.env` on server | Runtime secrets for Docker | Server only, not in git |
| `.env.example` in git | Template with placeholder values | Everyone |

### 1Password Setup

1. **Create a vault** for ContextCache (e.g., "ContextCache Dev")

2. **Store secrets** as items:
   - `POSTGRES_PASSWORD`
   - `DATABASE_URL` (full connection string)
   - Future: `JWT_SECRET`, `API_KEY`, etc.

3. **Create `.env.1password` template** (committed to git):

```env
# .env.1password — Template for op inject
POSTGRES_USER=contextcache
POSTGRES_PASSWORD=op://ContextCache Dev/postgres/password
POSTGRES_DB=contextcache
DATABASE_URL=op://ContextCache Dev/database/url
```

4. **Generate `.env` on server**:

```bash
# Login to 1Password
eval $(op signin)

# Generate .env from template
op inject -i .env.1password -o .env
```

### Manual Alternative

If 1Password isn't set up:

```bash
# Copy template
cp .env.example .env

# Edit with real values
nano .env

# Verify .env is in .gitignore
grep ".env" .gitignore
```

---

## Network Security

### Tailscale-Only Access

The server is accessed exclusively via Tailscale:

```
┌─────────────┐     ┌─────────────────────────────────────┐
│   Mac       │     │           Ubuntu Server             │
│   (dev)     │────▶│  Port 8000 (API)                    │
│             │     │  Port 8001 (Docs)                   │
│  Tailscale  │     │  Port 5432 (Postgres - internal)    │
└─────────────┘     └─────────────────────────────────────┘
      │                           │
      └───── Private Network ─────┘
              (Tailscale)
```

**Benefits:**
- No public IP exposure
- Encrypted tunnel
- Access control via Tailscale ACLs

### Firewall Rules

On the server, only Tailscale traffic should reach services:

```bash
# Example: Allow only Tailscale interface
sudo ufw allow in on tailscale0
sudo ufw deny in on eth0 to any port 8000
sudo ufw deny in on eth0 to any port 8001
sudo ufw enable
```

### Port Exposure

| Port | Service | Exposure |
|------|---------|----------|
| 8000 | API | Tailscale only |
| 8001 | Docs | Tailscale only |
| 5432 | Postgres | Docker internal only |

**Postgres is never exposed** to the host network. Only the API container can connect.

---

## Git Security

### `.gitignore` Essentials

Ensure these are in `.gitignore`:

```gitignore
# Environment files with secrets
.env
.env.local
.env.production

# 1Password generated files
.env.generated

# Python
__pycache__/
*.pyc
.venv/

# IDE
.idea/
.vscode/
*.swp

# macOS
.DS_Store
```

### Pre-commit Checks

Consider adding a pre-commit hook to catch secrets:

```bash
# .git/hooks/pre-commit
#!/bin/bash

# Check for .env files being committed
if git diff --cached --name-only | grep -E "^\.env$|\.env\.(local|production)$"; then
    echo "ERROR: Attempting to commit .env file with secrets!"
    exit 1
fi
```

---

## API Security (MVP)

### What MVP Has

- API key middleware (`X-API-Key`) for non-public endpoints
- Public endpoints: `/health`, `/docs`, `/openapi.json`
- No rate limiting
- No input size limits (beyond Postgres limits)

### What MVP Accepts (Risks)

| Risk | MVP Status | Phase 2 Fix |
|------|------------|-------------|
| API key can be shared manually | Accepted | Add users/roles and scoped keys |
| No audit trail of who did what | Accepted | Add user + logging |
| No rate limiting | Accepted | Add rate limiter middleware |

---

## Database Security

### Postgres Container

- Runs in isolated Docker network
- Not exposed to host (no `-p 5432:5432`)
- Only API container can connect

### Connection String

```env
DATABASE_URL=postgresql://contextcache:PASSWORD@postgres:5432/contextcache
```

- `postgres` is the Docker service name (internal DNS)
- Password is generated strong and stored in 1Password

### Backup Security

Database backups may contain sensitive data. Handle with care:

```bash
# Encrypt backup
pg_dump ... | gpg -c > backup.sql.gpg

# Or store in encrypted location
```

---

## Phase 2 Security Additions

| Feature | Description |
|---------|-------------|
| JWT Authentication | Protect API endpoints |
| User roles | Admin, member, read-only |
| Audit logging | Who created/modified what |
| Rate limiting | Prevent abuse |
| HTTPS | TLS termination (via Caddy/nginx) |
| Input validation | Stricter size limits |

---

## Security Checklist

Before deploying:

- [ ] `.env` exists on server with strong passwords
- [ ] `.env` is NOT in git (`git status` shows nothing)
- [ ] `.gitignore` includes `.env*`
- [ ] Server is only accessible via Tailscale
- [ ] Postgres port is not exposed to host
- [ ] 1Password vault is set up for team secrets
- [ ] Backup procedure does not leak secrets

---

## Incident Response (MVP)

If secrets are leaked:

1. **Rotate immediately** — Change all passwords in 1Password
2. **Regenerate `.env`** — Run `op inject` again on server
3. **Restart services** — `docker compose up -d`
4. **Check git history** — If committed, consider `git filter-branch` or `BFG Repo-Cleaner`
5. **Review access logs** — Check who had access during exposure
