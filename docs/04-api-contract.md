# API Contract (MVP)

<!--
  This document is the single source of truth for API endpoints.
  All endpoints, request/response shapes, and status codes are defined here.
  
  Base URL: http://<server-ip>:8000 (accessed via Tailscale)
  Interactive docs: http://<server-ip>:8000/docs (Swagger UI)
-->

## Base URL

```
http://<tailscale-ip>:8000
```

All endpoints are relative to this base.

## Authentication (Phase 2.1)

- Public endpoints (no key required): `/health`, `/docs`, `/openapi.json`
- All other endpoints require header:

```http
X-API-Key: <API_KEY>
```

- If `API_KEY` is not configured on the server, auth middleware allows requests (dev convenience).

---

## Health Check

### `GET /health`

Verify the API is running.

**Request:**
```http
GET /health
```

**Response:** `200 OK`
```json
{
  "status": "ok"
}
```

**Use case:** Load balancer health checks, deployment verification.

---

## Projects

### `POST /projects`

Create a new project.

**Request:**
```http
POST /projects
Content-Type: application/json

{
  "name": "Backend Refactor"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Project name (max 200 chars) |

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "Backend Refactor",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Errors:**
- `422 Unprocessable Entity` — Missing or invalid `name`
- `401 Unauthorized` — Missing or invalid API key

---

### `GET /projects`

List all projects.

**Request:**
```http
GET /projects
```

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "name": "Backend Refactor",
    "created_at": "2024-01-15T10:30:00Z"
  },
  {
    "id": 2,
    "name": "Frontend Redesign",
    "created_at": "2024-01-16T09:00:00Z"
  }
]
```

**Notes:**
- Returns empty array `[]` if no projects exist
- No pagination in MVP (fine for small datasets)

---

## Memory Cards

### `POST /projects/{project_id}/memories`

Create a memory card in a project.

**Request:**
```http
POST /projects/1/memories
Content-Type: application/json

{
  "type": "decision",
  "content": "We will use Postgres for storage."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | One of: `decision`, `finding`, `definition`, `note`, `link`, `todo` |
| `content` | string | Yes | The memory card content |

**Response:** `201 Created`
```json
{
  "id": 1,
  "project_id": 1,
  "type": "decision",
  "content": "We will use Postgres for storage.",
  "created_at": "2024-01-15T11:00:00Z"
}
```

**Errors:**
- `404 Not Found` — Project does not exist
- `422 Unprocessable Entity` — Invalid `type` or missing required fields
- `401 Unauthorized` — Missing or invalid API key

---

### `GET /projects/{project_id}/memories`

List all memory cards for a project.

**Request:**
```http
GET /projects/1/memories
```

**Response:** `200 OK`
```json
[
  {
    "id": 2,
    "project_id": 1,
    "type": "finding",
    "content": "API latency is 200ms p99",
    "created_at": "2024-01-15T12:00:00Z"
  },
  {
    "id": 1,
    "project_id": 1,
    "type": "decision",
    "content": "We will use Postgres for storage.",
    "created_at": "2024-01-15T11:00:00Z"
  }
]
```

**Notes:**
- Ordered by `created_at` descending (newest first)
- Returns empty array `[]` if no memories exist

**Errors:**
- `404 Not Found` — Project does not exist
- `401 Unauthorized` — Missing or invalid API key

---

## Recall (Memory Pack)

### `GET /projects/{project_id}/recall`

Generate a paste-ready memory pack.

**Request:**
```http
GET /projects/1/recall?query=postgres&limit=10
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | No | `""` | Search term for filtering |
| `limit` | integer | No | 10 | Max cards to return |

**Response:** `200 OK`
```json
{
  "project_id": 1,
  "query": "postgres",
  "memory_pack_text": "PROJECT MEMORY PACK\nQuery: postgres\n\nDECISION:\n- We will use Postgres for storage.\n\nFINDING:\n- Postgres handles 10k concurrent connections.",
  "items": [
    {
      "id": 1,
      "project_id": 1,
      "type": "decision",
      "content": "We will use Postgres for storage.",
      "created_at": "2024-01-15T11:00:00Z"
    },
    {
      "id": 3,
      "project_id": 1,
      "type": "finding",
      "content": "Postgres handles 10k concurrent connections.",
      "created_at": "2024-01-15T14:00:00Z"
    }
  ]
}
```

**Memory Pack Format:**
```
PROJECT MEMORY PACK
Query: <query>

DECISION:
- <content>

FINDING:
- <content>
...
```

**How to use:**
1. Call this endpoint with your query
2. Copy `memory_pack_text` from response
3. Paste into ChatGPT, Claude, or any AI tool
4. Ask your question below the pasted context

**Matching (MVP):**
- Tokenized overlap scoring between query and memory content
- Recency boost as a secondary ranking signal
- Empty query returns most recent cards
- Phase 2 adds Postgres FTS and/or embeddings

**Errors:**
- `404 Not Found` — Project does not exist
- `401 Unauthorized` — Missing or invalid API key

---

## Error Responses

`404` and `500` errors follow this format:

```json
{
  "detail": "Error message here"
}
```

Validation errors (`422`) return:

```json
{
  "detail": "Validation error",
  "errors": [
    {
      "loc": ["body", "name"],
      "msg": "String should have at least 1 character",
      "type": "string_too_short"
    }
  ]
}
```

**Common status codes:**

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `404` | Resource not found |
| `401` | Unauthorized |
| `422` | Validation error |
| `500` | Server error |

---

## Planned Endpoints (Phase 2+)

These endpoints are NOT in MVP but are planned:

| Method | Endpoint | Phase | Description |
|--------|----------|-------|-------------|
| `PATCH` | `/projects/{id}/memories/{id}` | 2 | Update a memory card |
| `DELETE` | `/projects/{id}/memories/{id}` | 2 | Delete a memory card |
| `DELETE` | `/projects/{id}` | 2 | Delete a project |
| `GET` | `/projects/{id}/memories?type=decision` | 2 | Filter by type |
| `POST` | `/auth/login` | 2 | User authentication |

---

## Example: Full Workflow

```bash
# 1. Create a project
curl -X POST http://localhost:8000/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project"}'
# Response: {"id": 1, "name": "My Project", ...}

# 2. Add memory cards
curl -X POST http://localhost:8000/projects/1/memories \
  -H "Content-Type: application/json" \
  -d '{"type": "decision", "content": "We use Postgres for storage."}'

curl -X POST http://localhost:8000/projects/1/memories \
  -H "Content-Type: application/json" \
  -d '{"type": "definition", "content": "Memory pack = formatted recall output for pasting."}'

# 3. Recall a memory pack
curl "http://localhost:8000/projects/1/recall?query=postgres&limit=10"
# Response includes memory_pack_text ready to paste

# 4. Paste into ChatGPT/Claude and ask your question
```
