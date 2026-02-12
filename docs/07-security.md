# Security (Phase B)

## Current Controls

### API Key Auth (DB-backed)

- Protected routes require `X-API-Key`.
- Keys are stored in `api_keys` as SHA-256 hashes (`key_hash`), never plaintext.
- Key plaintext is returned once at creation.
- Revocation uses `revoked_at`; revoked keys are rejected.
- Break-glass rotation is CLI-only (`python -m app.rotate_key`) inside the API container.
- No HTTP key-rotation endpoint is exposed.

### Org Isolation

- Each key belongs to one org (`api_keys.org_id`).
- Project and memory access is validated against org context.
- Cross-org access is denied (`403` or `404`).
- `X-Org-Id` is supported for explicit scoping; single-org default works in dev.

### RBAC

- Roles: `owner`, `admin`, `member`, `viewer`.
- Enforced on route level:
  - `viewer`: read/list/recall
  - `member`: create memory
  - `admin`: manage projects and API keys
  - `owner`: manage memberships and org-level administration

### Audit Log

- Write actions store an entry in `audit_logs`:
  - action
  - entity type/id
  - org id
  - actor user id (if resolved)
  - api key prefix (if key-authenticated)
  - metadata JSON

## Operational Notes

- Public endpoints: `/health`, `/docs`, `/openapi.json`.
- Bootstrap convenience: if no active API keys exist, protected routes are temporarily allowed.
- For local/dev role simulation, `X-User-Email` can map requests to org membership.

## Secrets Hygiene

- Keep `.env` out of git.
- Rotate keys if leaked and revoke old keys immediately.
- Prefer generating keys via `/orgs/{org_id}/api-keys` instead of static env values.
