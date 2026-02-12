# Data Model (Phase B)

## Overview

ContextCache now uses org-scoped multi-tenancy:

- `organizations` own `projects`
- `users` join orgs through `memberships`
- `api_keys` are stored per org (hashed, revocable)
- `audit_logs` record write actions
- `memories` keep FTS document `search_tsv`

## Core Tables

### `organizations`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER` | PK |
| `name` | `VARCHAR(200)` | required |
| `created_at` | `TIMESTAMPTZ` | default now |

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER` | PK |
| `email` | `VARCHAR(255)` | unique, required |
| `display_name` | `VARCHAR(255)` | nullable |
| `created_at` | `TIMESTAMPTZ` | default now |

### `memberships`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER` | PK |
| `org_id` | `INTEGER` | FK -> `organizations.id` |
| `user_id` | `INTEGER` | FK -> `users.id` |
| `role` | `VARCHAR(20)` | `owner|admin|member|viewer` |
| `created_at` | `TIMESTAMPTZ` | default now |

Unique: `(org_id, user_id)`.

### `projects`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER` | PK |
| `org_id` | `INTEGER` | FK -> `organizations.id`, required |
| `created_by_user_id` | `INTEGER` | FK -> `users.id`, nullable |
| `name` | `VARCHAR(200)` | required |
| `created_at` | `TIMESTAMPTZ` | default now |

### `memories`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER` | PK |
| `project_id` | `INTEGER` | FK -> `projects.id` |
| `type` | `VARCHAR(50)` | required |
| `content` | `TEXT` | required |
| `search_tsv` | `TSVECTOR` | FTS doc (trigger-maintained) |
| `created_at` | `TIMESTAMPTZ` | default now |

### `api_keys`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER` | PK |
| `org_id` | `INTEGER` | FK -> `organizations.id` |
| `name` | `VARCHAR(200)` | required |
| `key_hash` | `VARCHAR(64)` | SHA-256 hex, unique |
| `prefix` | `VARCHAR(16)` | first chars for display |
| `created_at` | `TIMESTAMPTZ` | default now |
| `revoked_at` | `TIMESTAMPTZ` | nullable |

Plaintext API key is returned once on create, never stored in plaintext.

### `audit_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER` | PK |
| `org_id` | `INTEGER` | FK -> `organizations.id` |
| `actor_user_id` | `INTEGER` | FK -> `users.id`, nullable |
| `action` | `VARCHAR(100)` | e.g. `project.create` |
| `entity_type` | `VARCHAR(100)` | e.g. `project` |
| `entity_id` | `INTEGER` | target id |
| `metadata` | `JSONB` | extra context |
| `created_at` | `TIMESTAMPTZ` | default now |

## FTS Indexing

Recall uses Postgres FTS with English config:

- Query parser: `websearch_to_tsquery('english', query)`
- Filter: `search_tsv @@ tsquery`
- Rank: `ts_rank_cd(search_tsv, tsquery)`
- Fallback: most recent memories when no FTS matches

Indexes:

```sql
CREATE INDEX idx_memories_project_id ON memories(project_id);
CREATE INDEX idx_memories_search_tsv ON memories USING GIN (search_tsv);
```
