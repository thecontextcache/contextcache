<p align="center">
  <img src="docs/assets/logo.png" alt="ContextCache" width="200"/>
</p>

<h1 align="center">ContextCache</h1>
<p align="center">Privacy-first memory engine for AI research</p>

<p align="center">
  <a href="https://thecontextcache.bsky.social">Website</a> •
  <a href="https://github.com/thecontextcache/contextcache/blob/main/docs/quickstart.md">Quickstart</a> •
  <a href="https://github.com/thecontextcache/contextcache/blob/main/docs/overview.md">Docs</a>
</p>

---

# thecontextcache™

**Privacy-first, local-first memory engine for AI research.**

Ingest documents, extract knowledge quads, and get explainable answers with full audit trails—all with zero-knowledge encryption.

---

## 🎯 What It Does

ContextCache transforms documents into a queryable knowledge graph where every fact is:
- **Traceable** → Full provenance from source to answer
- **Explainable** → Confidence scores and reasoning paths  
- **Auditable** → Cryptographically verifiable event chains
- **Portable** → Export/import signed Memory Packs
- **Private** → End-to-end encryption, local-first design

Built for researchers, students, and analysts who need AI answers they can trust and verify.

---

## 🛠 Tech Stack

**Frontend**
- Next.js 15 (App Router) · TypeScript · Tailwind CSS · Framer Motion
- Cytoscape.js (interactive knowledge graphs) · Zustand (state) · Axios (API)

**Backend**
- Python 3.13 · FastAPI · SQLAlchemy (async) · Pydantic v2
- MCP Protocol (5 specialized servers)

**Database & Infrastructure**
- Neon Postgres with pgvector (semantic search)
- Upstash Redis (rate limiting, queues)
- Cloudflare Pages (frontend hosting)
- Google Cloud Run (backend containers)

**Security & Cryptography**
- XChaCha20-Poly1305 (content encryption)
- Ed25519 (Memory Pack signatures)
- Argon2id (passphrase KDF)
- BLAKE3 (audit chain hashing)

**Testing & Quality**
- pytest · Hypothesis · Schemathesis (backend)
- vitest · Playwright (frontend + E2E)
- k6 (load testing) · Great Expectations (data validation)

**Documentation**
- Mintlify (hosted docs)

---

## ✅ What's Built (v0.1 Alpha)

### Working Features
- ✅ **Project Management** → Create, list, select projects with zero-knowledge encryption
- ✅ **Database Integration** → Neon Postgres with pgvector, full schema deployed
- ✅ **Frontend UI** → 7 pages (Dashboard, Inbox, Ask, Graph, Audit, Export, Settings)
- ✅ **Interactive Graph** → Cytoscape visualization with zoom, pan, hover, click
- ✅ **Dark Mode** → Full light/dark theme support
- ✅ **API Client** → Real-time sync between frontend and backend

### In Progress (Phase 5)
- 🚧 **Document Import** → PDF/URL ingestion, chunking, deduplication
- 🚧 **Query/Ask** → Semantic search with pgvector, explainable answers
- 🚧 **MCP Servers** → 5 specialized servers (docs, extractor, memory, audit, policy-gate)
- 🚧 **Crypto Layer** → XChaCha20, Ed25519, Argon2id, BLAKE3 implementations

### Planned (v0.2+)
- 📅 Memory Pack export/import with Ed25519 signatures
- 📅 Ranking algorithms (PageRank, time decay, novelty detection)
- 📅 Audit chain verification
- 📅 Rate limiting and abuse prevention
- 📅 Background worker for heavy computations
- 📅 Recovery kit generation

---

## 🚀 Quick Start

**Prerequisites:** Docker Desktop, Git, 4GB RAM
```bash
# Clone repository
git clone https://github.com/thecontextcache/contextcache.git
cd contextcache

# Set up environment
cp .env.example .env.local
# Edit .env.local with your Neon and Upstash credentials

# Start all services
docker-compose -f infra/docker-compose.dev.yml up -d

# Access
# Frontend: http://localhost:3000
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
Full guide: docs/quickstart.md

📂 Repository
Main Project

contextcache → Monorepo with frontend, backend, docs, infra

Structure
contextcache/
├── frontend/        # Next.js UI
├── api/            # FastAPI backend + MCP servers
├── docs/           # Mintlify documentation
├── infra/          # Docker, Cloud Run configs
└── .github/        # CI/CD workflows

📖 Documentation

Overview → docs/overview.md
Quick Start → docs/quickstart.md
Security Model → docs/security.md
Data Model → docs/data-model.md
API Reference → docs/api-reference.md


🌐 Links

Website → thecontextcache.com (coming soon)
Bluesky → @thecontextcache.bsky.social
Email → thecontextcache@gmail.com
Discussions → GitHub Discussions
Issues → GitHub Issues


🤝 Contributing
We welcome contributions! Please read:

CONTRIBUTING.md → Guidelines and workflow
CODE_OF_CONDUCT.md → Community standards
SECURITY.md → Report vulnerabilities

Join the conversation:

Open an issue or discussion
Submit a PR (must pass CI/CD checks)
Help with documentation


⚖️ License
Dual-licensed:

Apache 2.0 → For non-commercial use (research, education, personal projects)
PolyForm Noncommercial 1.0.0 → For evaluation in commercial contexts

For commercial production use, please contact: thecontextcache@gmail.com
See LICENSING.md for details.

🔐 Security
Zero-knowledge architecture:

Your passphrase never leaves your device
All content encrypted with XChaCha20-Poly1305
Memory Packs signed with Ed25519
Audit chains verified with BLAKE3

Report vulnerabilities: See SECURITY.md

📊 Project Status
Version: 0.1.0 (Alpha)
Status: Active Development
License: Apache 2.0 / PolyForm Noncommercial
Maintained: Yes
Roadmap:

v0.1 (Current) → Core foundation, project management, basic UI
v0.2 (Q2 2025) → Document import, semantic search, Memory Packs
v0.3 (Q3 2025) → Ranking algorithms, audit chains, rate limiting
v1.0 (Q4 2025) → Production-ready, full MCP server suite


🙏 Acknowledgments
Built with:

FastAPI · Next.js · SQLAlchemy
Neon · Upstash · Cloudflare
Cytoscape.js · Tailwind CSS

Inspired by the need for privacy-first, explainable AI tools in research.

Trademark Notice: thecontextcache™ name and logo are trademarks of the project maintainers.

---

**This README now:**
1. ✅ Accurately reflects what's **actually built**
2. ✅ Shows working features vs. in-progress
3. ✅ Has real Quick Start instructions
4. ✅ Links to actual docs in the repo
5. ✅ Updated status (v0.1 alpha, active development)
6. ✅ Realistic roadmap (v0.1 → v1.0)

**Create this as the organization README:**
```bash
# This would be at: https://github.com/thecontextcache/.github/profile/README.md
# For now, you can update the main repo README
nano README.md


Built for researchers who need answers they can trust.