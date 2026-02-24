# Security

## Auth model

ContextCache supports two auth modes:

1. Session auth (web): invite-only magic links + HttpOnly cookie
2. API key auth (programmatic): hashed DB keys scoped to org

## Session protections

Cookie settings:
- `HttpOnly=true`
- `Secure=true` when `APP_ENV=prod` **or** when `X-Forwarded-Proto: https` is present (Cloudflare tunnel)
- `SameSite=lax`
- explicit `Max-Age`, `Expires`, `Path=/`

Session controls:
- magic links are single-use (`consumed_at`)
- magic link TTL defaults to 10 minutes
- sessions are revocable (`revoked_at`)
- max active sessions per user (default 3), oldest revoked first

## Invite-only enforcement

`POST /auth/request-link` returns `403` when:
- no invite and no existing user
- invite revoked
- invite expired

`GET /auth/verify`:
- rejects expired/consumed tokens
- marks token consumed on success
- marks invite accepted when applicable
- blocks disabled users

## Email delivery behavior

- Uses AWS SES via `boto3`
- `APP_ENV=dev`: SES failures log `[magic-link-debug]` and flow returns success with `debug_link`
- non-dev: SES failure returns `500` (`Email delivery failed`)
- emergency override: `MAGIC_LINK_ALLOW_LOG_FALLBACK=true` allows logged `debug_link` outside dev.
  Use only as a temporary recovery switch; disable after SES is healthy.

## API key storage + org isolation

- plaintext key never stored
- SHA-256 hash in `api_keys.key_hash`
- key prefix stored separately for identification
- revoked keys are rejected
- key org isolation enforced (cross-org blocked)

## Authorization

- `/admin/*` requires admin privileges via:
  - session auth with `is_admin=true`, or
  - org API key context with role `owner|admin`
- Core APIs require session or API key
- Role checks on org resources: `viewer`, `member`, `admin`, `owner`

## Rate limiting

Redis-backed with in-memory fallback for dev:

| Endpoint | Limit |
|---|---|
| `POST /auth/request-link` | 5/hr per-IP, 3/hr per-email |
| `GET /auth/verify` | 20/hr per-IP |
| `GET /projects/{id}/recall` | 240/hr per-IP, 240/hr per-account |
| `POST /orgs` | 60/min per-IP, 60/min per-account |
| `POST /projects` | 60/min per-IP, 60/min per-account |
| `POST /projects/{id}/memories` | 60/min per-IP, 60/min per-account |
| `POST /ingest/raw` | 30/min per-IP, 30/min per-account |

All write-endpoint limits are tunable via `WRITE_RATE_LIMIT_PER_*_PER_MINUTE`
and `INGEST_RATE_LIMIT_PER_*_PER_MINUTE` env vars. Set to `0` to disable.

Behavior:
- `APP_ENV=prod`: Redis is required; if Redis is unavailable, protected rate-limited routes return `503`.
- `APP_ENV=dev/test`: temporary in-memory fallback is allowed for local convenience.

## Auditing and usage

- Writes produce `audit_logs` with actor context and key prefix where available
- `usage_events` tracks coarse telemetry with `ip_prefix` (not raw long-term IP)
- No third-party analytics beacons or advertising trackers are embedded in the web UI.

## Bootstrap mode

Bootstrap mode allows the first API key to be created without existing credentials.
It requires **two** explicit flags — `APP_ENV=dev` alone is not sufficient:

```env
APP_ENV=dev
BOOTSTRAP_MODE=true          # explicit opt-in required
BOOTSTRAP_API_KEY=cck_...    # key to auto-create
```

If `BOOTSTRAP_MODE=true` is detected on a non-dev environment, the API logs a
startup warning. Bootstrap mode is disabled automatically once any active API
key exists.

## Email impersonation (dev only)

`X-User-Email` header impersonation requires **both**:

```env
APP_ENV=dev
ALLOW_EMAIL_IMPERSONATION=true
```

## Operational hardening notes

- Keep `.env` out of git — `web/.next/` is also excluded (build artifacts)
- Rotate leaked API keys immediately
- Use TLS in production
- Restrict CORS origins to trusted web hosts
- Keep `X-User-Email` disabled outside dev (enforced in middleware)
- Ignore untrusted forwarding headers; trust `CF-Connecting-IP` (or socket peer fallback)
- Never commit database credentials as fallback defaults in scripts

## Security best practices checklist

- Rotate API keys regularly and revoke old keys on role changes.
- Keep Cloudflare/TLS enabled for all public endpoints.
- Restrict dashboard/API access by IP at the firewall when possible.
- Retain audit logs and usage records per your policy; purge old rows on schedule.
- Confirm only the last 10 login events per user are retained and older rows are purged after 90 days.

## Security audit automation

CI now runs a dedicated security job:

- Bandit static analysis over `api/app`
- Python dependency audit (`pip-audit`) using locked requirements
- NPM dependency audit (`npm audit --audit-level=critical`) for web runtime deps

Workflow file: `.github/workflows/ci.yml` (`security-scan` job).

Use this as baseline coverage and add provider-native tooling (e.g. GitHub Advanced Security or Aikido) when available.
