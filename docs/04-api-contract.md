# API Contract (Phase B)

## Base URL

`http://<tailscale-ip>:8000`

## Auth + Org Headers

Public routes:

- `GET /health`
- `GET /docs`
- `GET /openapi.json`

Protected routes use:

- `X-API-Key: <plaintext key>`
- `X-Org-Id: <org_id>` (preferred; auto-defaults when only one org exists)

Optional dev header for role simulation:

- `X-User-Email: <user email>` (maps request to membership role in org)
- If omitted, the server uses the first membership row for that org as actor context.

Notes:

- API keys are DB-backed (`api_keys` table), hashed at rest.
- If no active API keys exist yet, protected requests are allowed in bootstrap mode.

## Roles

- `viewer`: read/list/recall
- `member`: viewer + create memories
- `admin`: member + manage projects + create/revoke API keys
- `owner`: admin + manage memberships/org

## Endpoints

### Health

- `GET /health` -> `{ "status": "ok" }`

### Org + Membership

- `POST /orgs` (bootstrap when no orgs; otherwise `admin+`)
- `GET /orgs`
- `POST /orgs/{org_id}/memberships` (`owner`)
- `GET /orgs/{org_id}/memberships` (`owner`)
- `GET /me` (resolved context)

### Org-scoped Projects

- `POST /orgs/{org_id}/projects` (`admin+`)
- `GET /orgs/{org_id}/projects` (`viewer+`)

### API Keys

- `POST /orgs/{org_id}/api-keys` (`admin+`)  
  Returns plaintext once:

```json
{
  "id": 1,
  "org_id": 1,
  "name": "team-key",
  "prefix": "cck_ab12",
  "created_at": "2026-01-01T00:00:00Z",
  "revoked_at": null,
  "api_key": "cck_ab12..."
}
```

- `GET /orgs/{org_id}/api-keys` (`admin+`) (no plaintext)
- `POST /orgs/{org_id}/api-keys/{key_id}/revoke` (`admin+`)

### Legacy Project Routes (still supported; org-scoped internally)

- `POST /projects` (`admin+`)
- `GET /projects` (`viewer+`)
- `POST /projects/{project_id}/memories` (`member+`)
- `GET /projects/{project_id}/memories` (`viewer+`)
- `GET /projects/{project_id}/recall` (`viewer+`)

Cross-org access is blocked (returns `403` or `404` depending on context).
Project responses include `org_id` and `created_by_user_id`.

## Recall Behavior

`GET /projects/{project_id}/recall?query=...&limit=10`

- Primary: Postgres FTS with `websearch_to_tsquery('english', query)`
- Filter: `search_tsv @@ tsquery`
- Rank: `ts_rank_cd(search_tsv, tsquery)` DESC
- Tie-break: `created_at` DESC
- Fallback: recent memories when no FTS matches
- `memory_pack_text` remains paste-ready grouped text

Recall response item shape:

```json
{
  "id": 10,
  "project_id": 5,
  "type": "finding",
  "content": "Postgres FTS ranking improved precision.",
  "created_at": "2026-01-01T00:00:00Z",
  "rank_score": 0.42
}
```

- `rank_score` is `null` for recency fallback rows.

## Error Format

```json
{
  "detail": "Error message"
}
```

Common codes:

- `200` success
- `201` created
- `400` bad request (e.g. invalid `X-Org-Id`)
- `401` unauthorized (missing/invalid key)
- `403` forbidden (role/org mismatch)
- `404` not found
- `422` validation error
- `500` server error
