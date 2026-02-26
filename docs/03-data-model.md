# Data Model

## Core multi-tenant tables

### `organizations`
- `id` (PK)
- `name`
- `created_at`

### `users` (domain membership identity)
- `id` (PK)
- `email` (unique)
- `display_name`
- `created_at`

### `memberships`
- `id` (PK)
- `org_id` (FK -> organizations)
- `user_id` (FK -> users)
- `role` (`owner|admin|member|viewer`)
- `created_at`

Unique: `(org_id, user_id)`.

### `projects`
- `id` (PK)
- `org_id` (FK -> organizations)
- `created_by_user_id` (FK -> users, nullable)
- `name`
- `created_at`

### `memories`
- `id` (PK)
- `project_id` (FK -> projects)
- `type`
- `content`
- `search_vector` (`jsonb`, deterministic/local embedding fallback payload)
- `embedding_vector` (`vector(1536)`, pgvector cosine search)
- `hilbert_index` (`bigint`, locality-preserving prefilter key)
- `search_tsv` (`tsvector`)
- `created_at`

FTS index: `GIN(search_tsv)`.
Vector index: `ivfflat(embedding_vector vector_cosine_ops)`.
Prefilter index: `BTREE(project_id, hilbert_index)`.

### `api_keys`
- `id` (PK)
- `org_id` (FK -> organizations)
- `name`
- `key_hash` (SHA-256 hex, unique)
- `prefix`
- `created_at`
- `revoked_at` (nullable)
- `last_used_at` (nullable) — updated on every successful API key authentication
- `use_count` (integer, default 0) — incremented atomically on every successful authentication

> `last_used_at` and `use_count` were added in migration `20260224_0014`. They are updated in the FastAPI auth middleware, never by application-layer code, so they always reflect actual usage regardless of which endpoint was called.

### `audit_logs`
- `id` (PK)
- `org_id` (FK -> organizations)
- `actor_user_id` (FK -> users, nullable)
- `api_key_prefix` (nullable)
- `action`
- `entity_type`
- `entity_id`
- `metadata` (`jsonb`)
- `created_at`

## Auth tables (invite-only alpha)

### `auth_users`
- `id` (PK)
- `email` (unique, lowercase)
- `created_at`
- `last_login_at` (nullable)
- `is_admin` (bool)
- `is_disabled` (bool)
- `invite_accepted_at` (nullable)
- `invite_token_hash` (nullable)

### `auth_magic_links`
- `id` (PK)
- `email` (indexed)
- `token_hash` (unique, indexed)
- `created_at`
- `expires_at`
- `consumed_at` (nullable)
- `request_ip` (nullable)
- `user_agent` (nullable)
- `purpose` (`login` now)
- `send_status` (`sent|failed|logged`)

### `auth_sessions`
- `id` (PK)
- `user_id` (FK -> auth_users)
- `session_token_hash` (unique)
- `created_at`
- `expires_at`
- `revoked_at` (nullable)
- `last_seen_at`
- `ip` (nullable)
- `user_agent` (nullable)
- `device_label` (nullable)

### `auth_invites`
- `id` (PK)
- `email` (indexed)
- `invited_by_user_id` (FK -> auth_users, nullable)
- `created_at`
- `expires_at`
- `accepted_at` (nullable)
- `revoked_at` (nullable)
- `notes` (nullable)

### `usage_events`
- `id` (PK)
- `user_id` (FK -> auth_users, nullable)
- `event_type` (`login_requested|login_success|project_created|memory_created|recall_called`)
- `created_at`
- `ip_prefix` (coarse `/24` or `/64`)
- `user_agent_hash` (nullable)
- `project_id` (nullable)
- `org_id` (nullable)

## Recall behavior

Recall uses a proprietary ranking pipeline in the private engine package.
The public API contract remains stable, but internal scoring, prefiltering,
and cache heuristics are intentionally not documented in the public repo.

Fallback behavior:
- If no relevant candidates are found, recall returns recent memories.
