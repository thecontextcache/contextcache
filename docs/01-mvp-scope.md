# MVP Scope

<!--
  This document is the single source of truth for what's in/out of MVP.
  Reference this when deciding whether to add a feature.
  
  Rule: If it's not listed under "In Scope", it's out of scope for MVP.
-->

## MVP Goal (One Sentence)

> Ship a minimal product where teams can **create projects**, **publish memory cards**, and **recall a paste-ready memory pack** for any AI tool.

---

## In Scope (MVP)

These features WILL be built in MVP:

### Projects
- Create a project with a name
- List all projects
- Projects are the top-level container for memory cards

### Memory Cards
- Create a memory card with type and content
- List memory cards for a project (newest first)
- Supported types: `decision`, `finding`, `definition`, `note`, `link`, `todo`

### Recall Endpoint
- Query memories by keyword (simple substring match)
- Return a formatted "memory pack" text block
- Limit results with `?limit=N` parameter

### Infrastructure
- FastAPI backend
- Postgres database
- Docker Compose for local/server deployment
- MkDocs for documentation (this site)
- Single environment: dev/staging on Ubuntu server via Tailscale

### Audit Metadata
- `created_at` timestamp on all records
- `created_by` field (prepared for Phase 2)

---

## Out of Scope (Later Phases)

These features will NOT be built in MVP:

| Feature | Phase | Reason for Deferral |
|---------|-------|---------------------|
| Multi-user auth / roles / teams | Phase 2 | Adds complexity; single-user fine for MVP |
| Embeddings / semantic search | Phase 2 | Simple substring match is good enough for MVP |
| Update/delete memory cards | Phase 2 | Create + list covers core workflow |
| Web UI | Phase 2 | API + curl is sufficient for MVP validation |
| Graph database / knowledge graph | Phase 3 | Premature optimization |
| Tool plugins (ChatGPT/Claude integrations) | Phase 3 | Paste workflow proves value first |
| MCP server integration | Phase 3 | Focus on core API first |
| Automatic scraping / agents | Never (MVP) | Intentional human curation is a core principle |

---

## Definition of Done (MVP)

MVP is complete when:

- [ ] A user can create a project via API
- [ ] A user can add memory cards to that project
- [ ] A user can list memory cards
- [ ] A user can call `/recall?query=...` and get a paste-ready text block
- [ ] The system runs via Docker Compose on the Ubuntu server
- [ ] Documentation is complete and accessible at the docs site
- [ ] Demo workflow works end-to-end (create → add → recall → paste into ChatGPT)

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| No auto-save | High-signal curation requires human intent |
| Substring match first | YAGNI—add embeddings when substring fails |
| No UI in MVP | API validates the model; UI is cosmetic |
| Single user | Auth is complexity; defer until multi-user needed |
