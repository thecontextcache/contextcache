# Roadmap & Pending Tasks

## Status: Invite-only Alpha (February 2026)

---

## ✅ Completed (Alpha)

### Auth & Access
- Invite-only magic-link authentication (no passwords)
- Session-protected `/app`, `/brain`, and `/admin` pages
- Waitlist with approve/reject workflow
- Admin invite, user, and session controls
- Per-user `is_unlimited` flag to bypass daily limits
- Login IP tracking (last 10 per user, auto-purged after 90 days)

### Core Product
- Org-scoped projects and memory cards
- PostgreSQL FTS recall (`websearch_to_tsquery` + `ts_rank_cd`)
- Memory pack output grouped by type
- Server-only analyzer module (`analyzer/core.py` — never shipped to browser)
- Tags and metadata on memory cards

### Infrastructure
- Docker Compose with optional Celery worker profile
- Celery Beat with nightly cleanup tasks:
  - Purge expired magic links (hourly)
  - Purge old usage counters (nightly, 90-day rolling)
  - Purge old login events (nightly, 90-day rolling)
- Cloudflare Tunnel — Mode C subdomain deployment (docs in `06-deployment.md`)
- Amazon SES integration (sandbox — awaiting production approval)

### Usage Limits
- Daily per-user counters (projects, memories, recall queries)
- Configurable via `DAILY_MAX_PROJECTS`, `DAILY_MAX_MEMORIES`, `DAILY_MAX_RECALLS`
- Per-user override via admin toggle
- `/me/usage` endpoint

### UX
- Next.js App Router with dark/light theme
- Brain visualization (`/brain`) — interactive neural graph of projects and memories
- Terms of Service checkbox on sign-in
- 404 / 500 error pages
- Legal page with full terms, privacy, and IP retention details
- Admin panel: users, invites, waitlist, login IPs, usage stats

### CLI & SDK
- `cc` CLI (Python, zero dependencies): health, projects, mem, recall, usage, invites, waitlist
- Python SDK (`cli/sdk.py`): full API wrapper for scripting and CI/CD

### Documentation
- API contract (`04-api-contract.md`)
- Deployment guide with Cloudflare Mode C (`06-deployment.md`)
- Security model (`07-security.md`)
- CLI & SDK reference (`09-cli-sdk.md`)
- Legal & licensing (`legal.md`)

---

## 🔜 Pending (Near-term)

### SES Production
- **Blocked on:** Amazon SES production access approval.
- **Action:** Once approved, set `APP_ENV=prod`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_REGION`, `SES_FROM_EMAIL=support@thecontextcache.com`.
- Magic-link emails will then be sent via SES instead of logged to console.

### Brain Visualization — Enhancements
- Multi-project recall with cross-project edge highlighting.
- Touch/mobile support (pinch-zoom, tap to select).
- Animated node creation when a new memory is saved (pulse-in).
- Export graph as PNG / SVG.

### Admin UX Polish
- Server/query pagination + status/email filters are now available for admin lists.
- Remaining: date-range filters and bulk actions.

### Background Worker Expansion
- Embedding generation: Celery task to compute and store OpenAI / sentence-transformer
  embeddings in `memory_embeddings` table (scaffolded, not yet implemented).
- Reindex project task: rebuild FTS tsvector for all memories in a project.
- Embedding-based recall path: hybrid FTS + cosine similarity (requires pgvector extension).

---

## 🗓 Later (Post-Alpha)

### Payments & Pricing
- Stripe integration for paid tiers.
- Usage limits tied to pricing tiers (free / pro / team).
- Invoice and subscription management.

### ML / Analyzer Microservice
- Split `analyzer/core.py` into a standalone internal service (Docker, no public port).
- Switch via `ANALYZER_MODE=service` + `ANALYZER_SERVICE_URL=http://analyzer:9000`.
- No custom model training required for v1; Postgres FTS + recency scoring suffices.
- Future: sentence-transformer embeddings for semantic recall.

### Enterprise Features
- SSO / OIDC integration (Okta, Google Workspace, Azure AD).
- Organisation-level billing and per-seat pricing.
- Audit log export (CSV / JSON).
- Custom data retention policies.
- SCIM provisioning.

### Observability
- Prometheus exporter for API and worker metrics.
- Grafana dashboard for request rates, memory counts, recall latency.
- Sentry / OpenTelemetry tracing.
- Uptime monitoring with alerting.

### Redis-backed Rate Limiting
- Replace in-process `slowapi` limiter with Redis-backed version for multi-instance scaling.
- Requires Redis to be part of the default (non-worker) stack.

### Trademark & Legal
- Register "thecontextcache™" as a trademark (pending incorporation).
- Update ™ → ® once registration is confirmed.
- Engage legal counsel for enterprise contract templates.

---

## Architecture decisions deferred

| Decision | Status | Notes |
|----------|--------|-------|
| Vector DB (pgvector vs Pinecone) | Deferred | pgvector preferred — no extra infra |
| Message queue (Redis vs Kafka) | Redis chosen | Kafka overkill for alpha |
| Auth (magic link vs OAuth) | Magic link only | OAuth added post-alpha |
| Embeddings model | Deferred | sentence-transformers or OpenAI ada-002 |
| Kubernetes | Deferred | Docker Compose + Cloudflare sufficient for alpha |
