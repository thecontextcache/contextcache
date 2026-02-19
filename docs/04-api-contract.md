# API Contract

Base URL: `http://<host>:8000`

## Public endpoints

- `GET /health`
- `GET /docs`
- `GET /openapi.json`
- `POST /auth/request-link`
- `GET /auth/verify?token=...`

## Authentication

Protected endpoints accept either:

1. Session cookie (`contextcache_session`) from magic-link login (web flow)
2. `X-API-Key` (programmatic/dev flow)

Org scoping:
- API-key requests can send `X-Org-Id` (must match key org).
- Session requests derive org from domain membership; optional `X-Org-Id` must be one of user memberships.

Dev-only header:
- `X-User-Email` is honored only in `APP_ENV=dev`.

If no active API keys exist:
- `APP_ENV=dev`: bootstrap convenience may allow keyless API-key path.
- non-dev: protected requests return `503` until keys exist.

## Auth endpoints

### `POST /auth/request-link`
Body:
```json
{"email":"user@example.com"}
```
Rules:
- invite-only (or existing user)
- rate-limited per IP + per email

Response `200`:
```json
{"status":"ok","detail":"Check your email for a sign-in link.","debug_link":null}
```
`debug_link` is only returned in dev when SES fallback logging is used.

### `GET /auth/verify?token=...`
- validates single-use token
- consumes token
- creates/updates user
- sets HttpOnly session cookie

Response `200`:
```json
{"status":"ok","redirect_to":"/app"}
```

### `POST /auth/logout`
Revokes current session cookie.

### `GET /auth/me`
Session-only endpoint.

Response:
```json
{"email":"user@example.com","is_admin":true,"created_at":"...","last_login_at":"..."}
```

## Admin endpoints (session + `is_admin=true`)

- `POST /admin/invites`
- `GET /admin/invites`
- `POST /admin/invites/{id}/revoke`
- `GET /admin/users`
- `POST /admin/users/{id}/disable`
- `POST /admin/users/{id}/enable`
- `POST /admin/users/{id}/revoke-sessions`
- `GET /admin/usage`

Non-admin returns `403`.

## Core org/project endpoints

- `GET /me`
- `POST /orgs`
- `GET /orgs`
- `POST /orgs/{org_id}/projects`
- `GET /orgs/{org_id}/projects`
- `POST /projects`
- `GET /projects`
- `POST /projects/{project_id}/memories`
- `GET /projects/{project_id}/memories`
- `GET /projects/{project_id}/recall?query=...&limit=10`

## Recall response

```json
{
  "project_id": 1,
  "query": "migrations reliability",
  "memory_pack_text": "...",
  "items": [
    {
      "id": 11,
      "project_id": 1,
      "type": "finding",
      "content": "...",
      "created_at": "...",
      "rank_score": 0.42
    }
  ]
}
```

- FTS matches include `rank_score` (float).
- Recency fallback rows use `rank_score: null`.
- `memory_pack_text` remains grouped and paste-ready.

## Errors

```json
{"detail":"..."}
```

Common codes: `400`, `401`, `403`, `404`, `422`, `429`, `500`, `503`.
