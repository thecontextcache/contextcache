# Security

## Auth model

ContextCache supports two auth modes:

1. Session auth (web): invite-only magic links + HttpOnly cookie
2. API key auth (programmatic): hashed DB keys scoped to org

## Session protections

Cookie settings:
- `HttpOnly=true`
- `Secure=true` only in `APP_ENV=prod`
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

Current limiter is Redis-backed:
- `/auth/request-link`: per-IP + per-email
- `/auth/verify`: per-IP
- `/projects/{id}/recall`: per-IP + per-account

Behavior:
- `APP_ENV=prod`: Redis is required; if Redis is unavailable, protected rate-limited routes return `503`.
- `APP_ENV=dev/test`: temporary in-memory fallback is allowed for local convenience.

## Auditing and usage

- Writes produce `audit_logs` with actor context and key prefix where available
- `usage_events` tracks coarse telemetry with `ip_prefix` (not raw long-term IP)
- No third-party analytics beacons or advertising trackers are embedded in the web UI.

## Operational hardening notes

- Keep `.env` out of git
- Rotate leaked API keys immediately
- Use TLS in production
- Restrict CORS origins to trusted web hosts
- Keep `X-User-Email` disabled outside dev (enforced in middleware)
- Ignore untrusted forwarding headers; trust `CF-Connecting-IP` (or socket peer fallback).

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
