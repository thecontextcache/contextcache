# Roadmap

<!--
  This document defines the phased development plan.
  Each phase has clear scope and "Definition of Done" criteria.
  
  Rule: Complete Phase N before starting Phase N+1.
-->

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   Phase 1 (MVP)          Phase 2             Phase 3                │
│   ─────────────          ───────             ───────                │
│   Core CRUD              Auth + Search       Integrations           │
│   Memory Packs           Basic UI            Graph Memory           │
│   Docker Deploy          Teams               Tool Plugins           │
│                                                                     │
│   [████████████]         [░░░░░░░░░░░░]      [░░░░░░░░░░░░]        │
│   IN PROGRESS            NOT STARTED         NOT STARTED            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: MVP

> Ship a minimal product that teams can use today.

### Scope

| Feature | Status | Notes |
|---------|--------|-------|
| Projects CRUD | 🔄 In Progress | Create + List |
| Memory Cards CRUD | 🔄 In Progress | Create + List |
| Recall endpoint | 🔄 In Progress | Returns memory pack text |
| Simple matching | 🔄 In Progress | Substring match (ILIKE) |
| Docker Compose | ✅ Done | API + Postgres + Docs |
| MkDocs documentation | 🔄 In Progress | This site |
| Tailscale deployment | ✅ Done | Private access |
| 1Password secrets | ✅ Done | .env generation |

### Definition of Done

Phase 1 is complete when:

- [ ] `POST /projects` creates a project
- [ ] `GET /projects` lists all projects
- [ ] `POST /projects/{id}/memories` creates a memory card
- [ ] `GET /projects/{id}/memories` lists memories (newest first)
- [ ] `GET /projects/{id}/recall?query=...` returns memory pack text
- [ ] Full stack runs via `docker compose up -d`
- [ ] Documentation covers all endpoints
- [ ] Demo workflow works: create → add → recall → paste into ChatGPT

### Excluded from Phase 1

- Update/delete endpoints
- Authentication
- Web UI
- Full-text search or embeddings
- Multi-user / teams

---

## Phase 2: Auth + Search + UI

> Add user management and better search.

### Scope

| Feature | Description |
|---------|-------------|
| User authentication | JWT-based auth |
| User model | `users` table with email/password |
| `author_id` on memories | Track who created each card |
| Update/delete endpoints | Full CRUD for memories |
| Full-text search | Postgres FTS or trigram |
| Optional: Embeddings | pgvector for semantic search |
| Basic web UI | React/Vue frontend |
| Teams / organizations | Multi-tenant support |
| Audit logging | Who did what, when |

### Definition of Done

Phase 2 is complete when:

- [ ] Users can register and login
- [ ] API requires authentication
- [ ] Memories track `author_id`
- [ ] Update and delete endpoints work
- [ ] Search returns ranked results (not just substring)
- [ ] Basic UI allows all CRUD operations
- [ ] Multiple users can share a project

### Prerequisites

- Phase 1 complete
- Decision: Auth provider (self-hosted vs OAuth)
- Decision: UI framework (React, Vue, etc.)

---

## Phase 3: Integrations + Graph

> Connect to AI tools and add knowledge graph.

### Scope

| Feature | Description |
|---------|-------------|
| ChatGPT plugin | Native integration |
| Claude integration | MCP or API |
| Ollama integration | Local model support |
| Knowledge graph | Neo4j or similar |
| Relationship tracking | Links between memories |
| Advanced recall | Graph + vector hybrid |
| API versioning | v1 API with stability guarantees |
| Rate limiting | Prevent abuse |
| Webhooks | Notify external systems |

### Definition of Done

Phase 3 is complete when:

- [ ] ChatGPT can fetch memory packs natively
- [ ] Claude can use ContextCache via MCP
- [ ] Memories can link to each other
- [ ] Graph queries enhance recall results
- [ ] API is versioned and documented for third parties

### Prerequisites

- Phase 2 complete
- Decision: Graph database (Neo4j, etc.)
- Decision: MCP implementation approach

---

## Future Ideas (Backlog)

These are ideas for post-Phase 3, not commitments:

| Idea | Description |
|------|-------------|
| Browser extension | Capture insights from web pages |
| Slack integration | Publish memories from Slack |
| CLI tool | `contextcache recall "query"` |
| Mobile app | iOS/Android for on-the-go capture |
| Memory suggestions | AI suggests what to save |
| Memory decay | Automatically archive old cards |
| Export formats | Markdown, JSON, PDF exports |
| Self-hosted SaaS | Multi-org hosting |

---

## Decision Log

Key decisions affecting the roadmap:

| Decision | Date | Rationale |
|----------|------|-----------|
| No auth in MVP | 2024-01 | Simplicity; single-user fine for validation |
| Substring search first | 2024-01 | YAGNI; embeddings add complexity |
| No UI in MVP | 2024-01 | API proves value; UI is cosmetic |
| Postgres only | 2024-01 | No exotic DBs until needed |
| Docker Compose | 2024-01 | Simple orchestration for MVP |

---

## How to Update This Roadmap

1. **Adding a feature:** Add to appropriate phase, update status
2. **Changing scope:** Document decision in Decision Log
3. **Completing a phase:** Update all statuses, write retrospective
4. **New phase:** Define scope, DoD, and prerequisites

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01 | Initial roadmap |
