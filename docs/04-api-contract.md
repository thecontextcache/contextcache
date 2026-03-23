# API Contract

Base URL: `http://<host>:8000`

Default version header on every response:

- `X-ContextCache-API-Version: 2026-03-20` (or the configured `API_VERSION`)

## Public endpoints

- `GET /health`
- `GET /docs`
- `GET /openapi.json`
- `GET /integrations/capabilities`
- `GET /ingest/capabilities`
- `POST /auth/request-link`
- `GET /auth/verify?token=...`

## Authentication

Protected endpoints accept either:

1. Session cookie (`contextcache_session`) from magic-link login (web flow)
2. `X-API-Key` (programmatic/dev flow)
3. `Authorization: Bearer <token>` when `EXTERNAL_AUTH_ENABLED=true`

Org scoping:
- API-key requests can send `X-Org-Id` (must match key org).
- Session requests derive org from domain membership; optional `X-Org-Id` must be one of user memberships.
- Bearer-token requests authenticate upstream, but org membership and role are still
  resolved locally from ContextCache's `users` / `memberships` tables.

Dev-only header:
- `X-User-Email` is honored only in `APP_ENV=dev`.

If no active API keys exist:
- `APP_ENV=dev`: bootstrap convenience may allow keyless API-key path.
- non-dev: protected requests return `503` until keys exist.

### External auth bridge contract

When `EXTERNAL_AUTH_ENABLED=true`, the API accepts `Authorization: Bearer <token>`
and calls the configured introspection endpoint:

- `POST ${EXTERNAL_AUTH_INTROSPECTION_URL}`
- request body:

```json
{"token":"<bearer-token>","audience":"contextcache-api"}
```

- optional service-to-service header:
  - `Authorization: Bearer ${EXTERNAL_AUTH_SERVICE_TOKEN}`

Expected `200` response:

```json
{
  "active": true,
  "email": "user@example.com",
  "sub": "auth-service-subject",
  "display_name": "User Name",
  "is_admin": false
}
```

Rules:
- `active=false` means the token is rejected with `401`.
- HTTP `401/403/5xx` from the auth service are treated as upstream auth-service failures and return `503`.
- The email is projected into local `auth_users` / `users` rows if missing.
- Global admin is still local by default; remote `is_admin` is only honored when
  `EXTERNAL_AUTH_TRUST_ADMIN_CLAIMS=true`.

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
| `POST` | `/admin/users/{id}/set-plan?plan_code=free\|pro\|team\|super` | Set user subscription plan |
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
| `POST` | `/admin/orgs/{org_id}/set-plan?plan_code=free\|pro\|team\|super` | Set org subscription plan |
| `GET`  | `/admin/recall/logs` | Last recall decision logs (`limit`, `offset`, `project_id`) |
| `GET`  | `/admin/cag/cache-stats` | CAG cache metrics (status, size, hit rate, capacity) |
| `POST` | `/admin/cag/evaporate` | Trigger immediate cache maintenance pass |
| `GET`  | `/admin/system/llm-health` | LLM extraction readiness (worker flag, Gemini key presence, SDK install status, model) |
| `GET`  | `/admin/system/engine-status` | Process-local recall-engine diagnostics (configured mode, circuit state, last private-engine error, bounded fallback settings) |
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
- `POST /orgs/{org_id}/api-keys` — create org API key (requires org `admin`/`owner`; global session admin allowed)
- `GET /orgs/{org_id}/api-keys` — list org API keys (requires org `admin`/`owner`; global session admin allowed)
- `POST /orgs/{org_id}/api-keys/{key_id}/revoke` — revoke key (requires org `admin`/`owner`; global session admin allowed)
- `POST /orgs/{org_id}/api-key-access-requests` — request API-key access (non-admin org members/viewers)
- `GET /orgs/{org_id}/api-key-access-requests` — list access requests (org admin/owner sees all; requester sees own; global session admin sees all)
- `POST /orgs/{org_id}/api-key-access-requests/{request_id}/approve` — approve request and promote requester to org `admin`
- `POST /orgs/{org_id}/api-key-access-requests/{request_id}/reject` — reject request
- `POST /projects`
- `GET /projects`
- `POST /projects/{project_id}/memories`
- `POST /integrations/memories`
- `GET /integrations/memories?project_id=...&limit=...&offset=...`
- `POST /integrations/memories/{memory_id}/contextualize`
- `POST /ingest/raw`
- `GET /ingest/raw/{capture_id}`
- `POST /ingest/raw/{capture_id}/replay`
- `GET /projects/{project_id}/memories`
- `GET /projects/{project_id}/recall?query=...&limit=10`
- `POST /brain/batch`
- `POST /brain/batch/{action_id}/undo`
- `GET /health/worker`
- `GET /health/redis`

## Integrations capabilities contract

`GET /integrations/capabilities` and `GET /ingest/capabilities` expose the
stable machine-facing contract for extensions, CLI tools, and future agents.

Response:

```json
{
  "api_version": "2026-03-20",
  "auth_modes": ["session", "api_key", "bearer_optional"],
  "ingest_sources": ["extension", "api", "cli", "agent"],
  "recall_formats": ["memory_pack_text", "items"],
  "brain_batch_max_targets": 1000,
  "supports_idempotency": true,
  "supports_ingest_replay": true,
  "supports_batch_undo": ["add_tag", "remove_tag", "pin", "unpin"]
}
```

Clients should read this once at startup and:

1. cache `api_version`
2. respect `brain_batch_max_targets`
3. only enable replay / undo UX when supported

## Raw ingest contract

`POST /ingest/raw` accepts raw capture payloads from extension/CLI/agent sources.

Recommended headers:

- `Idempotency-Key: <stable-client-generated-id>`
- `X-API-Key: <org-api-key>` or authenticated session/bearer token
- `X-Org-Id: <org-id>` when using API keys

Response:

```json
{
  "status": "queued",
  "capture_id": 14,
  "processing_status": "queued",
  "duplicate": false
}
```

Response headers:

- `X-ContextCache-API-Version`
- `X-ContextCache-Capture-Id`
- `X-ContextCache-Processing-Status`

Idempotency rules:

1. same org + same `Idempotency-Key` returns the existing capture
2. duplicate replay does not create a second `raw_captures` row
3. refinery replay deletes prior `inbox_items` for that capture before rewriting

Dispatch note:

- When the raw capture row is stored successfully but worker dispatch fails, the response still returns the stable `capture_id` with `status: "failed"` and `processing_status: "failed"` so the caller can inspect or replay the capture instead of losing track of it.

### `GET /ingest/raw/{capture_id}`

Returns capture status for extension/agent polling:

```json
{
  "id": 14,
  "org_id": 1,
  "project_id": 3,
  "source": "extension",
  "idempotency_key": "ext-4f6c",
  "processing_status": "failed",
  "attempt_count": 2,
  "processing_started_at": "2026-03-20T14:20:00Z",
  "processed_at": null,
  "last_error": "refinery timeout",
  "last_error_at": "2026-03-20T14:20:08Z",
  "dead_lettered_at": null
}
```

### `POST /ingest/raw/{capture_id}/replay`

Allowed when the capture belongs to the caller's org and is in `failed` or
`dead_letter` state. This resets status back to `queued` or `processing`
depending on worker mode.

Replay is rejected for captures already in `queued`, `processing`, or `processed`
state to avoid duplicate worker fan-out and conflicting inline processing.

Global admin API-key view:
- `GET /admin/api-keys` — list API keys across all orgs (`org_id` filter optional; session admin only)

Access-request audit trail:
- Creation, approval, and rejection write rows into `audit_logs` with actions:
  - `api_key_access_request.create`
  - `api_key_access_request.approve`
  - `api_key_access_request.reject`

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

Response headers:

- `X-ContextCache-API-Version`
- `X-ContextCache-Recall-Strategy`
- `X-ContextCache-Recall-Served-By`
- `X-ContextCache-Recall-Duration-Ms`

These headers are the stable low-overhead observability surface for agents and
CLI tools that need latency and strategy visibility without parsing admin logs.

Failure mode:

- If a configured private recall engine raises at runtime, the API returns `503 Service Unavailable` for recall requests during the cooldown window instead of silently degrading into an unbounded in-process ranking path.
- If no private recall engine is configured, the API uses local fallback ranking with a bounded candidate set controlled by `LOCAL_RECALL_FALLBACK_MAX_MEMORIES`.

## Brain batch contract

`POST /brain/batch` applies a batch action to a set of memory IDs.

Rules:

1. requests must include `actionId`
2. `Idempotency-Key` is recommended and takes precedence for replay detection
3. requests larger than `BRAIN_BATCH_MAX_TARGETS` return `413`
4. the server chunks DB reads internally using `BRAIN_BATCH_DB_CHUNK_SIZE`

Example request:

```json
{
  "actionId": "8c2d7f7e-cc42-45e7-a73d-9c69d9983d11",
  "action": {
    "type": "pin",
    "targetIds": ["mem_1", "mem_2"]
  }
}
```

Example response:

```json
{
  "actionId": "8c2d7f7e-cc42-45e7-a73d-9c69d9983d11",
  "type": "pin",
  "results": [
    {"id": "mem_1", "success": true},
    {"id": "mem_2", "success": true}
  ],
  "total": 2,
  "succeeded": 2,
  "failed": 0,
  "undoAvailable": true,
  "undoActionId": "8c2d7f7e-cc42-45e7-a73d-9c69d9983d11"
}
```

### `POST /brain/batch/{action_id}/undo`

Supported reversible actions:

- `add_tag`
- `remove_tag`
- `pin`
- `unpin`

Undo window is controlled by `BRAIN_BATCH_UNDO_WINDOW_SECONDS`.

- Recall ranking is implemented in a private proprietary engine when available.
- Public response shape, auth behavior, and endpoint contract are unchanged.
- Strategy and score details are written to `recall_logs` and visible via admin endpoint.
- Latency telemetry is written to `recall_timings` for operations tuning.
- Rows returned from hybrid scoring include `rank_score` (float).
- Recency fallback rows use `rank_score: null`.
- CAG short-circuit responses return `items: []` and keep the same `memory_pack_text` format.
- `memory_pack_text` remains grouped and paste-ready.
- Local fallback remains available for non-private-engine builds, but it only ranks the newest bounded candidate set instead of scanning the full project.

## Plan limits (phase 1)

- User plan limits are enforced for organization creation.
- Org plan limits are enforced for active API key creation.
- Global session admins (`auth_users.is_admin=true`) bypass plan limits.
- Plan data is stored in:
  - `plan_catalog`
  - `user_subscriptions`
  - `org_subscriptions`

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
