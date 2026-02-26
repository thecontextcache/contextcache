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
| `GET`  | `/admin/recall/logs` | Last recall decision logs (`limit`, `offset`, `project_id`) |
| `GET`  | `/admin/cag/cache-stats` | CAG cache metrics (status, size, hit rate, capacity) |
| `POST` | `/admin/cag/evaporate` | Trigger immediate cache maintenance pass |
| `GET`  | `/admin/system/llm-health` | LLM extraction readiness (worker flag, Gemini key presence, SDK install status, model) |
| `GET`  | `/me/usage` | Current user's today usage + configured limits |

Example `GET /admin/recall/logs` item:

```json
{
  "id": 12,
  "org_id": 1,
  "project_id": 3,
  "actor_user_id": 5,
  "strategy": "hybrid",
  "query_text": "migration reliability",
  "input_memory_ids": [44, 45, 46],
  "ranked_memory_ids": [45, 44],
  "weights": {"internal": true},
  "score_details": {"45": {"total": 0.78}},
  "created_at": "2026-02-20T01:23:45Z"
}
```

Response for `GET /me/usage`:
```json
{
  "day": "2026-02-19",
  "week_start": "2026-02-17",
  "memories_created": 4,
  "recall_queries": 2,
  "projects_created": 1,
  "weekly_memories_created": 9,
  "weekly_recall_queries": 7,
  "weekly_projects_created": 2,
  "limits": {
    "memories_per_day": 100,
    "recalls_per_day": 50,
    "projects_per_day": 10,
    "memories_per_week": 500,
    "recalls_per_week": 300,
    "projects_per_week": 50
  }
}
```

Daily + weekly limits are configured via environment variables (`DAILY_MAX_*`, `WEEKLY_MAX_*`). Set to `0` to disable. Users with `is_unlimited=true` bypass all limits regardless of global values.

## Core org/project endpoints

- `GET /me`
- `GET /me/orgs`
- `POST /orgs` — create organisation
- `GET /orgs` — list organisations visible to caller
- `PATCH /orgs/{org_id}` — rename organisation (requires `admin`)
- `DELETE /orgs/{org_id}` — delete organisation, blocked if projects exist (requires `owner`; returns 409 if projects remain)
- `POST /orgs/{org_id}/projects`
- `GET /orgs/{org_id}/projects`
- `POST /projects`
- `GET /projects`
- `POST /projects/{project_id}/memories`
- `POST /integrations/memories`
- `GET /integrations/memories?project_id=...&limit=...&offset=...`
- `POST /integrations/memories/{memory_id}/contextualize`
- `GET /projects/{project_id}/memories`
- `GET /projects/{project_id}/recall?query=...&limit=10`
- `GET /health/worker`
- `GET /health/redis`

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

- Recall ranking is implemented in a private proprietary engine.
- Public response shape, auth behavior, and endpoint contract are unchanged.
- Strategy and score details are written to `recall_logs` and visible via admin endpoint.
- Latency telemetry is written to `recall_timings` for operations tuning.
- Rows returned from hybrid scoring include `rank_score` (float).
- Recency fallback rows use `rank_score: null`.
- CAG short-circuit responses return `items: []` and keep the same `memory_pack_text` format.
- `memory_pack_text` remains grouped and paste-ready.

## Integration capture endpoint

`POST /integrations/memories` accepts:

```json
{
  "project_id": 1,
  "type": "note",
  "source": "extension",
  "title": "Optional",
  "content": "Captured content",
  "metadata": {},
  "tags": []
}
```

It is functionally equivalent to `POST /projects/{project_id}/memories` and keeps the same auth + rate-limit behavior.

Optional signing header for inbound integrations:
- `X-Integration-Signature: sha256=<hex-hmac>`
- HMAC is computed over raw request body with `INTEGRATION_SIGNING_SECRET`.
- If `INTEGRATION_SIGNING_SECRET` is unset, signature checking is skipped.

`GET /integrations/memories` returns recent ingested memories:
- with `project_id`: scoped to one project
- without `project_id`: scoped to current org

## Session org switching

- `GET /me/orgs` returns organizations available to the current actor.
  - session auth: all org memberships for the signed-in user
  - API key auth: the key-scoped org only
- The web app uses `X-Org-Id` on org-scoped requests so users can switch orgs without re-login.

`POST /integrations/memories/{memory_id}/contextualize` queues an Ollama contextualization worker task.

## Worker/Redis health

- `GET /health/worker`
  - returns worker enablement and broker URL (`status: ok|disabled`)
- `GET /health/redis`
  - connectivity probe to the Redis broker host (`status: ok|unreachable`)

## Errors

```json
{"detail":"..."}
```

Common codes: `400`, `401`, `403`, `404`, `422`, `429`, `500`, `503`.
