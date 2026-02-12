# Data Model (MVP)

<!--
  This document defines the database schema for MVP.
  Two tables only: projects and memories.
  
  Rule: Don't add fields until they're needed. YAGNI.
-->

## Overview

MVP has two tables:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌─────────────┐           ┌─────────────────────────────┐ │
│   │  projects   │ 1───────* │         memories            │ │
│   │             │           │                             │ │
│   │  id         │           │  id                         │ │
│   │  name       │◀──────────│  project_id (FK)            │ │
│   │  created_at │           │  type                       │ │
│   └─────────────┘           │  content                    │ │
│                             │  created_at                 │ │
│                             └─────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Tables

### `projects`

Top-level container for memory cards.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `INTEGER` | `PRIMARY KEY`, `AUTO INCREMENT` | Unique project identifier |
| `name` | `VARCHAR(200)` | `NOT NULL` | Human-readable project name |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | When the project was created |

**Example row:**
```json
{
  "id": 1,
  "name": "Backend Refactor",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Notes:**
- Project names don't need to be unique (for now)
- No soft delete in MVP; delete is permanent (Phase 2)
- No `updated_at` in MVP (not needed yet)

---

### `memories`

Individual memory cards within a project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `INTEGER` | `PRIMARY KEY`, `AUTO INCREMENT` | Unique memory identifier |
| `project_id` | `INTEGER` | `NOT NULL`, `FOREIGN KEY → projects.id` | Which project this belongs to |
| `type` | `VARCHAR(50)` | `NOT NULL` | Card type (see below) |
| `content` | `TEXT` | `NOT NULL` | The actual memory content |
| `search_tsv` | `TSVECTOR` | `NULL`, maintained by trigger | Search document for FTS ranking |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT NOW()` | When the card was created |

**Example row:**
```json
{
  "id": 1,
  "project_id": 1,
  "type": "decision",
  "content": "We will use Postgres for storage, not SQLite.",
  "created_at": "2024-01-15T11:00:00Z"
}
```

---

## Memory Card Types

The `type` field is a constrained string (enum-like). MVP supports:

| Type | Purpose | Example |
|------|---------|---------|
| `decision` | A choice that was made | "We will use Postgres, not SQLite" |
| `finding` | Something discovered during work | "The API latency is 200ms p99" |
| `definition` | A term or concept defined | "Memory pack = formatted recall output" |
| `note` | General observation | "Need to revisit auth design" |
| `link` | Reference to external resource | "Docs: https://fastapi.tiangolo.com" |
| `todo` | Action item | "Add rate limiting before launch" |

**Validation:** API rejects types not in this list.

---

## Indexes

Recall performance uses project scoping + FTS index:

```sql
-- Speed up recall queries scoped by project
CREATE INDEX idx_memories_project_id ON memories(project_id);

-- Speed up full-text recall
CREATE INDEX idx_memories_search_tsv ON memories USING GIN (search_tsv);
```

**Note:** Recall uses `plainto_tsquery('english', query)` + `ts_rank_cd(search_tsv, tsquery)`, with recency fallback when there are no FTS matches.

---

## Relationships

```
projects (1) ───────── (*) memories
   │                        │
   │                        │
   └─── One project has ────┘
        many memory cards
```

- Deleting a project should cascade-delete its memories (FK constraint)
- Recall is always scoped to a single project

---

## Not in MVP (Phase 2+)

These fields are explicitly deferred:

| Field | Table | Phase | Notes |
|-------|-------|-------|-------|
| `author_id` | memories | 2 | Requires users table |
| `updated_at` | both | 2 | Needed when update endpoints exist |
| `tags` | memories | 2 | Array or join table |
| `source_url` | memories | 2 | For link-type cards |
| `visibility` | memories | 2 | project / private |
| `embedding` | memories | 2 | pgvector for semantic search |

---

## SQLAlchemy Model Reference

The Python models in `api/app/models.py` should match this schema:

```python
# Project model
class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship: one project has many memories
    memories = relationship("Memory", back_populates="project", cascade="all, delete-orphan")

# Memory model
class Memory(Base):
    __tablename__ = "memories"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)  # decision|finding|definition|note|link|todo
    content = Column(Text, nullable=False)
    search_tsv = Column(TSVECTOR, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship: each memory belongs to one project
    project = relationship("Project", back_populates="memories")
```
