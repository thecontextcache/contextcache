# Architecture

## System Overview

```mermaid
graph TB
    subgraph Server ["Ubuntu Server (Tailscale / private network)"]
        WEB["Next.js UI<br/>:3000"]
        API["FastAPI<br/>:8000"]
        DB["Postgres 16<br/>:5432 (internal)"]
        REDIS["Redis<br/>:6379 (internal)"]
        WORKER["Celery Worker/Beat<br/>optional profile"]
        DOCS["MkDocs<br/>:8001"]
    end

    Browser["Browser / curl"] -->|"HTTP (CORS)"| WEB
    Browser -->|"HTTP + X-API-Key"| API
    Browser -->|"HTTP"| DOCS
    WEB -->|"fetch + credentials:include"| API
    API -->|"asyncpg"| DB
    API -->|"alembic migrations on startup"| DB
    API -->|"rate limits / counters"| REDIS
    WORKER -->|"broker/result"| REDIS
    WORKER -->|"embeddings + cleanup jobs"| DB

    style Server fill:#f0fdf4,stroke:#14b8a6,stroke-width:2px
    style API fill:#ecfdf5,stroke:#0d9488
    style DB fill:#eff6ff,stroke:#2563eb
```

---

## Auth Flow — Magic Link

```mermaid
sequenceDiagram
    actor User
    participant Web as Next.js UI
    participant API as FastAPI
    participant DB as Postgres
    participant Email as Email (SES / dev log)

    User->>Web: Enter invited email
    Web->>API: POST /auth/request-link {email}
    API->>DB: Lookup invite, create magic token
    API->>Email: Send link (dev: log debug_link)
    Email-->>User: Email with ?token=...

    User->>Web: Click link → /auth/verify?token=...
    Web->>API: GET /auth/verify?token=...
    API->>DB: Validate token (expire + mark used)
    API-->>Web: Set-Cookie: session=... (HttpOnly)
    Web->>User: Redirect to /app
```

---

## Request Lifecycle

```mermaid
sequenceDiagram
    participant Browser
    participant API as FastAPI Middleware
    participant DB as Postgres

    Browser->>API: Request + Cookie (session) or X-API-Key
    API->>DB: Validate session or API key hash
    DB-->>API: AuthSession / ApiKey row
    API->>API: Resolve org_id, role, actor_user_id
    API->>DB: Execute business query
    DB-->>API: Result rows
    API-->>Browser: JSON response
```

---

## Components

### 1. FastAPI (API Server)

**Purpose:** Handle all HTTP requests for projects, memory cards, and recall.

**Key details:**
- Written in Python with FastAPI framework
- Connects to Postgres via SQLAlchemy (async)
- Runs in Docker container
- Exposes port 8000

**Endpoints:** See [API Contract](04-api-contract.md)

### 2. Postgres (Database)

**Purpose:** Persistent storage for projects and memory cards.

**Key details:**
- Standard Postgres 16 image
- Data persisted in Docker volume (`postgres_data`)
- Only accessible from within Docker network (not exposed externally)
- Schema managed by SQLAlchemy models

**Tables:** See [Data Model](03-data-model.md)

### 3. MkDocs (Documentation)

**Purpose:** This documentation site—project dashboard and runbooks.

**Key details:**
- Material theme for clean UI
- Runs in Docker container
- Exposes port 8001
- Auto-rebuilds on file changes (dev mode)

### 4. Next.js (Tiny Web UI)

**Purpose:** Fast shareable interface for creating memories and exporting recall output.

**Key details:**
- Next.js app-router frontend
- Runs in Docker container
- Exposes port 3000
- Calls FastAPI directly (CORS-enabled)

---

## Data Flow

### Write Path (Create Memory Card)

```
User                    API                     Postgres
  │                      │                         │
  │  POST /memories      │                         │
  │─────────────────────▶│                         │
  │                      │  INSERT INTO memories   │
  │                      │────────────────────────▶│
  │                      │                         │
  │                      │  Return new record      │
  │                      │◀────────────────────────│
  │  { id, type, ... }   │                         │
  │◀─────────────────────│                         │
```

### Read Path (Recall Memory Pack)

```
User                    API                     Postgres
  │                      │                         │
  │  GET /recall?query=  │                         │
  │─────────────────────▶│                         │
  │                      │  CAG pre-check (golden docs) │
  │                      │  if miss: hybrid query        │
  │                      │  FTS + pgvector + recency     │
  │                      │────────────────────────▶│
  │                      │                         │
  │                      │  Return matching rows   │
  │                      │◀────────────────────────│
  │                      │                         │
  │                      │  Format as memory pack  │
  │                      │  (text block)           │
  │                      │                         │
  │  { memory_pack_text, │                         │
  │    items: [...] }    │                         │
  │◀─────────────────────│                         │
```

---

## Why This Works for "Unlimited Context"

We don't try to expand the model's context window. That's the model's job.

Instead, we produce a **curated memory pack**:

1. **Human curation** — Only high-signal cards are stored (no noise)
2. **Query-scoped** — Recall returns only relevant cards for the query
3. **Size-limited** — The `limit` parameter caps output size
4. **Paste-ready** — Formatted text is easy to paste without editing

Result: Prompts stay small, signal stays high.

---

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | Python 3.11+ | Team familiarity, ecosystem |
| Framework | FastAPI | Modern, fast, auto-docs |
| Database | Postgres | Reliable, battle-tested |
| ORM | SQLAlchemy | Flexible, async support |
| Package manager | uv | Fast, lockfile-based |
| Containers | Docker Compose | Simple multi-service orchestration |
| Docs | MkDocs Material | Clean, markdown-based |

---

## Future Architecture (Post-MVP)

Phase 2+ may add:
- advanced re-ranking (RRF / learned ranking)
- dedicated analyzer microservice
- external auth providers (OIDC/SSO)
- multi-region deployment patterns

Beta currently runs hybrid retrieval, Redis-backed limits, and optional worker jobs.
