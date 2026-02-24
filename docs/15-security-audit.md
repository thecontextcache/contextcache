# Security Audit — Remediation Log

This document records the full-code security and code-quality audit completed
in February 2026, and the exact fixes applied to each finding.

---

## Overview

A comprehensive audit produced 18 findings across four severity tiers.
All 🔴 Critical and 🟠 High items have been addressed. 🟡 Medium items
that were code changes (not architectural) are also complete.
🟢 Low / future-proofing items are tracked in the roadmap.

---

## 🔴 Critical — Fixed

### 1. `web/.next/` committed to git

**Risk:** The entire Next.js build output was tracked in source control.
This leaked the developer's local file path (`/Users/nd/Documents/...`) into
the repository, bloated the repo, and could cause build cache pollution across
environments.

**Fix:**
- Added `web/.next/` to `.gitignore`.
- Removed all 170+ build artifacts from git history with `git rm -r --cached web/.next/`.
- Build artifacts are now regenerated fresh inside the Docker container on every deploy.

### 2. Hardcoded default database credentials in scripts

**Risk:** `api/scripts/create_api_key.py` and `api/scripts/seed_mock_data.py`
fell back to `postgresql+asyncpg://contextcache:change-me@db:5432/contextcache`
when `DATABASE_URL` was not set. A misconfigured production deploy would silently
connect with these credentials.

**Fix:** Both scripts now call `sys.exit(1)` immediately with a clear error
message if `DATABASE_URL` is not set. No default credential fallback exists.

### 3. Monolithic auth middleware (200+ lines, single function)

**Risk:** The entire authentication flow — session cookies, API keys, bootstrap
mode, org resolution, role resolution, usage tracking — lived in one
`api_key_middleware` function. Hard to test, hard to audit, high regression risk.

**Fix:** Decomposed into four focused, independently testable units:

| Function | Responsibility |
|---|---|
| `_resolve_session_auth()` | Validates session cookie, resolves org/role from memberships |
| `_resolve_api_key_auth()` | Validates API key hash, updates usage stats, resolves membership |
| `_resolve_bootstrap_auth()` | Grants temporary owner access when no keys exist (dev only) |
| `_apply_auth_context()` | Writes the resolved `_AuthContext` to `request.state` |

The middleware itself is now a thin orchestrator that calls these in order.

---

## 🟠 High — Fixed

### 4. Session cookie fallback heuristic was overly permissive

**Risk:** If the named session cookie wasn't found, `web/middleware.js` scanned
every cookie for a 64-character hex pattern. Any analytics tracker or third-party
tool that happened to set such a cookie would grant `hasSession = true`,
potentially bypassing auth-required route protection.

**Fix:** The fallback heuristic is deleted entirely.
Only the exact `SESSION_COOKIE_NAME` cookie is checked.

```js
// Before (removed):
const fallback = all.find(c => /^[0-9a-f]{64}$/i.test(c.value));

// After:
const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
```

### 5. Bootstrap mode gated only by `APP_ENV=dev`

**Risk:** Bootstrap mode — which grants `owner` role to any unauthenticated
request when no API keys exist — was enabled solely by `APP_ENV=dev`. A common
misconfiguration on staging environments could expose this path.

**Fix:** Bootstrap now requires an **explicit** `BOOTSTRAP_MODE=true` environment
variable in addition to `APP_ENV=dev`. The API logs a startup warning if
`BOOTSTRAP_MODE=true` is detected outside a dev environment.

```env
# .env (dev only)
APP_ENV=dev
BOOTSTRAP_MODE=true
BOOTSTRAP_API_KEY=cck_your-dev-key-here
```

### 6. X-User-Email impersonation gated only by `APP_ENV=dev`

**Risk:** In `APP_ENV=dev`, any caller could pass `X-User-Email` to act as
any user. A staging environment running `APP_ENV=dev` while network-accessible
would allow arbitrary user impersonation.

**Fix:** Now requires both `APP_ENV=dev` **and** `ALLOW_EMAIL_IMPERSONATION=true`.

```env
# .env (dev only, explicit opt-in)
ALLOW_EMAIL_IMPERSONATION=true
```

### 7. `Secure` cookie flag only in `APP_ENV=prod`

**Risk:** Any non-production environment using HTTPS (staging, Cloudflare
preview, QA) set session cookies without `Secure=true`. Cookies could be
transmitted over HTTP if the user navigated to the HTTP version of the URL.

**Fix:** The session cookie now reads the `X-Forwarded-Proto` header. Cloudflare
terminates TLS and sets this header to `https` even though the internal Docker
request is HTTP. `Secure=true` is now set whenever the connection arrived via HTTPS.

```python
# auth_routes.py
forwarded_proto = request.headers.get("x-forwarded-proto", "").lower()
is_https = forwarded_proto == "https" or IS_PROD
response.set_cookie(..., secure=is_https, ...)
```

### 8. No burst rate limits on write endpoints

**Risk:** An attacker with a valid API key could flood the database with thousands
of projects, memories, or organizations per second.

**Fix:** Per-IP and per-account burst limits added to all write endpoints:

| Endpoint | Limit | Env var |
|---|---|---|
| `POST /orgs` | 60/min per-IP + 60/min per-account | `WRITE_RATE_LIMIT_PER_*_PER_MINUTE` |
| `POST /projects` | 60/min per-IP + 60/min per-account | `WRITE_RATE_LIMIT_PER_*_PER_MINUTE` |
| `POST /projects/{id}/memories` | 60/min per-IP + 60/min per-account | `WRITE_RATE_LIMIT_PER_*_PER_MINUTE` |
| `POST /ingest/raw` | 30/min per-IP + 30/min per-account | `INGEST_RATE_LIMIT_PER_*_PER_MINUTE` |

All limits use the same Redis-backed (with in-memory fallback) infrastructure as
the existing auth rate limits. Set any limit to `0` to disable it.

### 9. Extension content script matched `<all_urls>`

**Risk:** The browser extension content script was injected into every page the
user visited. This added overhead on every page load, increased the extension's
attack surface, and risked conflicts with arbitrary host page JavaScript.

**Fix:** `matches` in `manifest.config.ts` is now narrowed to the 13 specific
AI platform URLs listed in `host_permissions`. Generic capture from any other
page uses `activeTab` + `chrome.scripting.executeScript` (only runs when the
user explicitly clicks, no persistent injection overhead).

### 10. No origin validation in `onMessageExternal`

**Risk:** The extension's external message listener accepted auth-push messages
without validating `sender.origin`. If `externally_connectable` domains were
ever broadened, an attacker-controlled page could overwrite the stored API key.

**Fix:** Two layers of defence added to `auth.ts`:

1. `sender.origin` is validated against `ALLOWED_SENDER_ORIGINS` — an explicit
   Set containing only `localhost:3000` and `app.thecontextcache.com`.
2. The API key format is validated (`/^cck_[A-Za-z0-9_-]{20,}$/`) before storing.

```typescript
if (!ALLOWED_SENDER_ORIGINS.has(senderOrigin)) {
  sendResponse({ ok: false, error: 'untrusted_origin' })
  return false
}
if (!_isValidApiKeyFormat(message.apiKey)) {
  sendResponse({ ok: false, error: 'invalid_key_format' })
  return false
}
```

---

## 🟡 Medium — Fixed

### 11. Silenced exceptions hid real bugs

**Risk:** Multiple `except Exception: pass` blocks across `main.py` were
intentionally lenient (e.g., "don't break auth over a stats write") but
completely invisible in logs, hiding schema mismatches, pool exhaustion,
and deadlocks.

**Fix:** All bare-pass blocks now log at `WARNING` level with `exc_info=True`:

```python
except Exception:
    logger.warning(
        "[auth] Failed to update API key usage stats for key_id=%s",
        api_key_row.id, exc_info=True,
    )
```

### 12. Deprecated `@app.on_event` handlers

**Risk:** FastAPI deprecated `@app.on_event("startup")` and
`@app.on_event("shutdown")` in favour of the `lifespan` context manager.

**Fix:** Migrated to the recommended pattern:

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    yield
    # shutdown

app = FastAPI(lifespan=lifespan)
```

### 13. No explicit database connection pool configuration

**Risk:** SQLAlchemy's defaults (5 connections, 10 overflow) exhaust quickly
because the auth middleware opens an `AsyncSessionLocal()` on **every** HTTP
request in addition to the route-level `get_db()` session.

**Fix:** Explicit pool parameters, tunable via environment variables:

| Env var | Default | Purpose |
|---|---|---|
| `DB_POOL_SIZE` | `10` | Persistent connection count |
| `DB_MAX_OVERFLOW` | `20` | Burst connections above pool_size |
| `DB_POOL_TIMEOUT` | `30` | Seconds to wait before raising PoolTimeout |
| `DB_POOL_RECYCLE` | `1800` | Recycle connections older than 30 min |

`pool_pre_ping=True` is always enabled to discard stale connections silently.

---

## 🟢 Low / Future-proofing — Tracked in Roadmap

These items are acknowledged but require larger changes:

| # | Item | Status |
|---|---|---|
| 16 | Single-server architecture | Roadmap: managed Postgres, horizontal API scaling |
| 13 | No TypeScript in the Next.js web app | Roadmap: incremental migration starting with `api.js` |
| 15 | Fragile DOM-based extension scrapers | Roadmap: scraper health checks + version annotations |

---

## Updated Security Checklist

- [x] `web/.next/` excluded from git
- [x] No plaintext credentials in source code
- [x] Session cookie `Secure` flag uses `X-Forwarded-Proto`
- [x] Bootstrap mode requires explicit `BOOTSTRAP_MODE=true`
- [x] Email impersonation requires explicit `ALLOW_EMAIL_IMPERSONATION=true`
- [x] Cookie fallback heuristic removed
- [x] Burst rate limits on all write endpoints
- [x] Extension content script narrowed to AI platforms only
- [x] Extension validates sender origin + key format
- [x] All exception blocks log at WARNING
- [x] FastAPI lifespan pattern (no deprecated on_event)
- [x] Explicit DB connection pool configuration
- [x] Auth middleware decomposed into testable units
