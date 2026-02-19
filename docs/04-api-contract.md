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
If the email already belongs to an existing user, `detail` is a friendly
"already registered" sign-in message.

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
{"email":"user@example.com","is_admin":true,"is_unlimited":false,"created_at":"...","last_login_at":"..."}
```

## Admin endpoints

Admin routes allow either:
- session auth with `is_admin=true`
- API key auth where resolved org role is `admin` or `owner`

Non-admin returns `403`.

### Invite management
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/invites` | Create invite — body: `{"email":"...","notes":"..."}` (returns `409` when user already exists or active invite exists) |
| `GET`  | `/admin/invites` | List invites (`limit`, `offset`, `email_q`, `status`) |
| `POST` | `/admin/invites/{id}/revoke` | Revoke a pending invite |

### Waitlist management
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/waitlist` | Public — join waitlist; body: `{"email":"..."}` (`409` if already waitlisted) |
| `POST` | `/waitlist/join` | Alias for the above |
| `GET`  | `/admin/waitlist` | List waitlist entries (admin only), supports `limit`, `offset`, `status`, `email_q` |
| `POST` | `/admin/waitlist/{id}/approve` | Approve → creates invite (`409` when user already exists or active invite exists) |
| `POST` | `/admin/waitlist/{id}/reject` | Reject waitlist entry |

### User management
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/admin/users` | List users (`limit`, `offset`, `email_q`, `status=active|disabled`, `is_admin`, `is_disabled`) |
| `POST` | `/admin/users/{id}/disable` | Disable user account |
| `POST` | `/admin/users/{id}/enable` | Re-enable user account |
| `POST` | `/admin/users/{id}/revoke-sessions` | Revoke all active sessions |
| `POST` | `/admin/users/{id}/grant-admin` | Grant admin role |
| `POST` | `/admin/users/{id}/revoke-admin` | Remove admin role |
| `POST` | `/admin/users/{id}/set-unlimited?unlimited=true\|false` | Toggle daily usage limit bypass |
| `GET`  | `/admin/users/{id}/stats` | Per-user usage stats (total memories, today counters) |
| `GET`  | `/admin/users/{id}/login-events` | Last 10 login IP records |

Response for `GET /admin/users/{id}/stats`:
```json
{
  "user_id": 1,
  "memory_count": 42,
  "today_memories": 3,
  "today_recalls": 7,
  "today_projects": 1
}
```

### Usage summary
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/admin/usage` | Usage summary across all users |
| `GET`  | `/me/usage` | Current user's today usage + configured limits |

Response for `GET /me/usage`:
```json
{
  "day": "2026-02-19",
  "memories_created": 4,
  "recall_queries": 2,
  "projects_created": 1,
  "limits": {
    "memories_per_day": 100,
    "recalls_per_day": 50,
    "projects_per_day": 10
  }
}
```

Daily limits are configured via environment variables (`DAILY_MAX_MEMORIES`, `DAILY_MAX_RECALLS`, `DAILY_MAX_PROJECTS`; legacy aliases still supported). Set to `0` to disable. Users with `is_unlimited=true` bypass all limits regardless of the global values.

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
