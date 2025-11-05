<p align="center">
  <img src="docs/assets/logo.png" alt="ContextCache" width="200"/>
</p>

<h1 align="center">ContextCache</h1>
<p align="center">Privacy-first, cloud-native knowledge graphs for AI research</p>

<p align="center">
  <a href="https://thecontextcache.bsky.social">Website</a> •
  <a href="docs/quickstart.md">Quickstart</a> •
  <a href="docs/overview.md">Documentation</a> •
  <a href="docs/api-reference.md">API Reference</a>
</p>

---

## 🎯 What It Does

ContextCache transforms documents into queryable knowledge graphs where every fact is:
- **🔒 Private** → Zero-knowledge encryption, your passphrase never leaves your device
- **📊 Traceable** → Full provenance from source to answer
- **🔍 Explainable** → Confidence scores and reasoning paths  
- **✅ Auditable** → Cryptographically verifiable event chains
- **🌐 Cloud-Native** → Multi-tenant, scalable, and serverless

Built for researchers, students, and analysts who need AI answers they can trust and verify.

---

## 🚀 Quick Start

### Option 1: Cloud Deployment (Recommended)

#### Step 1: Database Setup
```bash
# 1. Clone the repository
git clone https://github.com/thecontextcache/contextcache.git
cd contextcache

# 2. Create Neon PostgreSQL database (https://neon.tech)
# Get your DATABASE_URL from Neon dashboard

# 3. Run database migrations
cd api
psql $DATABASE_URL -f migrations/001_add_multi_tenant_auth.sql
psql $DATABASE_URL -f migrations/002_add_content_encryption.sql
```

#### Step 2: Backend Deployment (Cloud Run)
```bash
# 1. Set up GCP Secret Manager with these secrets:
# - DATABASE_URL (from Neon)
# - REDIS_URL (from Upstash)
# - CLERK_SECRET_KEY (from Clerk dashboard)
# - SESSION_ENCRYPTION_KEY (generate: openssl rand -base64 32)

# 2. Deploy API and worker
cd infra/cloudrun
./deploy-api.sh
./deploy-worker.sh

# 3. Note your Cloud Run URL (e.g., https://contextcache-api-xxx.run.app)
```

#### Step 3: Frontend Deployment (Cloudflare Pages)

**Important**: This project uses Next.js 15 with Server-Side Rendering (SSR) deployed to Cloudflare Workers via the `@cloudflare/next-on-pages` adapter.

```bash
# 1. Push code to GitHub
git push origin main

# 2. Connect Cloudflare Pages to your GitHub repo:
#    - Go to https://dash.cloudflare.com
#    - Workers & Pages → Create application → Pages → Connect to Git
#    - Select your repository and branch (main)

# 3. Configure build settings in Cloudflare:
#    Framework preset: Next.js
#    Build command: cd frontend && pnpm install && pnpm build && npx @cloudflare/next-on-pages
#    Build output directory: frontend/.vercel/output/static
#    Root directory: / (leave blank)

# 4. Add environment variables in Cloudflare Pages (both Production AND Preview):
NEXT_PUBLIC_API_URL=https://your-cloud-run-url.run.app
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_EXPORT=true
NEXT_PUBLIC_ENABLE_GRAPH_VIEW=true
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx

# 5. Deploy and verify
#    - Cloudflare will automatically deploy on every push to main
#    - Check build logs for any errors
#    - Visit your Cloudflare Pages URL to test
```

**Troubleshooting Cloudflare Deployment**:
- If you see "Output directory not found", ensure build output directory is set to `frontend/.vercel/output/static`
- If environment variables are missing, add them to **both** Production AND Preview environments
- If React Server Components fail, verify the adapter build step completed successfully
- See [CLOUDFLARE_ISSUE.md](CLOUDFLARE_ISSUE.md) for detailed troubleshooting

### Option 2: Local Development

```bash
# 1. Install dependencies
cd api && pip install -r requirements.txt
cd ../frontend && pnpm install

# 2. Set up environment variables
cp api/.env.example api/.env.local
cp frontend/.env.example frontend/.env.local
# Edit .env.local files with your credentials

# 3. Start backend (terminal 1)
cd api
uvicorn main:app --reload

# 4. Start worker (terminal 2)
cd api
python -m arq cc_core.worker.WorkerSettings

# 5. Start frontend (terminal 3)
cd frontend
pnpm dev

# 6. Open http://localhost:3000
```

**Note**: Local development uses Next.js dev server with automatic Cloudflare Workers platform setup via `setupDevPlatform()` in `next.config.ts`.

---

## 🏗️ Architecture

> 📖 **Detailed Documentation**: See [ARCHITECTURE.md](ARCHITECTURE.md) for comprehensive system architecture diagrams and [FLOW_DIAGRAMS.md](FLOW_DIAGRAMS.md) for detailed user flow diagrams.

### Cloud-Native Stack

**Frontend:**
- Next.js 15 (App Router, SSR) · TypeScript · Tailwind CSS
- **Cloudflare Workers** via `@cloudflare/next-on-pages` adapter
- Clerk (Authentication) · Framer Motion (Animations)
- Zustand (State Management) · Axios (API Client)
- Glassmorphism UI with dark/light theme

**Backend:**
- Python 3.13 · FastAPI · SQLAlchemy (Async)
- Clerk JWT Verification · Pydantic v2
- Arq (Background Jobs) · MCP Protocol
- Content encryption (XChaCha20-Poly1305)

**Database & Infrastructure:**
- Neon PostgreSQL with pgvector (vector search)
- Upstash Redis (caching, sessions, rate limiting, job queue)
- Google Cloud Run (serverless containers)
- **Cloudflare Pages + Workers** (frontend hosting with SSR)

### Security Architecture

```
User's Master Passphrase (memorized)
          ↓ Argon2id KDF
Key Encryption Key (KEK)
          ↓ Encrypted in Redis (1-hour session)
Data Encryption Key (DEK, per project)
          ↓ Encrypted in database
Document Content
          ↓ XChaCha20-Poly1305
```

**Zero-Knowledge**: Server never sees plaintext passphrase or KEK  
**Multi-Tenant**: Complete user isolation at database level  
**Session-Bound**: Keys expire automatically after 1 hour  

---

## 🔑 Key Features

### 🔐 Authentication & Security
- **Clerk Integration**: Email/password, OAuth (Google, GitHub)
- **Session Management**: Unlock once per session with master passphrase
- **Zero-Knowledge**: Your passphrase never leaves your device
- **Multi-Tenant**: Complete data isolation between users

### 📊 Knowledge Graphs
- **Hybrid Ranking**: BM25 + Dense Cosine + PageRank + Temporal Decay
- **Vector Search**: Semantic similarity with pgvector
- **Graph Traversal**: PageRank for authority ranking
- **Explainable AI**: Confidence scores and provenance chains

### 🔌 MCP Servers (Model Context Protocol)
- **docs_server**: Document ingestion and processing
- **extractor_server**: Knowledge extraction (facts, entities)
- **memory_server**: Memory pack management
- **audit_server**: Audit trails and provenance
- **policy_gate**: Policy enforcement

### 📈 Performance
- **Serverless**: Auto-scaling with Cloud Run
- **Caching**: Redis for KEK/DEK and PageRank scores
- **Background Jobs**: Async processing with Arq
- **Optimized Queries**: Indexed database queries

---

## 📚 Documentation

### Architecture & Design
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Comprehensive system architecture with detailed Mermaid diagrams
- **[FLOW_DIAGRAMS.md](FLOW_DIAGRAMS.md)** - Detailed user flow diagrams (registration, upload, query, encryption, etc.)
- **[CLOUDFLARE_ISSUE.md](CLOUDFLARE_ISSUE.md)** - Next.js SSR deployment troubleshooting guide

### Guides & References
- **[Quickstart Guide](docs/quickstart.md)** - Get started in 5 minutes
- **[API Reference](docs/api-reference.md)** - Complete API documentation
- **[Security Model](docs/security.md)** - Encryption and threat model
- **[MCP Servers](docs/mcp.md)** - Model Context Protocol integration
- **[Algorithms](docs/internal/ALGORITHM_STATUS.md)** - Ranking and retrieval algorithms
- **[Deployment](DEPLOYMENT.md)** - Production deployment guide

---

## 🛠️ Development

### Project Structure

```
contextcache/
├── api/                      # FastAPI backend
│   ├── cc_core/
│   │   ├── auth/            # Clerk JWT verification
│   │   ├── crypto/          # Encryption (Argon2, XChaCha20)
│   │   ├── models/          # Database models
│   │   ├── services/        # Business logic
│   │   ├── analyzers/       # Ranking algorithms
│   │   └── mcp/             # MCP servers
│   ├── migrations/          # Database migrations
│   └── main.py              # FastAPI app
├── frontend/                # Next.js frontend
│   ├── app/                 # App router pages
│   ├── components/          # React components
│   ├── lib/                 # API client, utils
│   └── hooks/               # React hooks
├── infra/                   # Infrastructure
│   ├── cloudrun/            # Cloud Run deployment
│   └── k6/                  # Load testing
└── docs/                    # Documentation
```

### Running Tests

```bash
# Backend tests
cd api
pytest tests/ -v

# Frontend tests
cd frontend
pnpm test

# Load testing
cd infra/k6
./run_load_test.sh
```

### Code Quality

```bash
# Linting
cd api && ruff check .
cd frontend && pnpm lint

# Type checking
cd api && mypy .
cd frontend && pnpm type-check

# Security scanning
cd api && bandit -r cc_core/
```

---

## 🌐 API Endpoints

### Authentication
- `POST /auth/unlock` - Unlock session with master passphrase
- `GET /auth/status` - Check if session is unlocked
- `POST /auth/logout` - Clear all session keys

### Projects
- `POST /projects` - Create encrypted project
- `GET /projects` - List user's projects
- `GET /projects/{id}` - Get project details
- `GET /projects/{id}/stats` - Get project statistics

### Documents
- `POST /documents/ingest` - Upload and process documents
- `GET /documents` - List project documents
- `DELETE /documents/{id}` - Delete document

### Query
- `POST /ask` - Ask questions about your knowledge
- `GET /facts` - List extracted facts
- `GET /entities` - List extracted entities

---

## 💰 Cost

### Free Tier (Perfect for getting started)
- **Clerk**: 10,000 MAU (Monthly Active Users)
- **Upstash Redis**: 10,000 requests/day
- **Neon PostgreSQL**: 512MB compute, 1GB storage
- **Cloud Run**: 2M requests/month
- **Cloudflare Pages**: Unlimited

### At Scale
- **1,000 users**: ~$30/month
- **10,000 users**: ~$150/month
- **100,000 users**: ~$800/month

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas We Need Help
- 🐛 Bug fixes and testing
- 📚 Documentation improvements
- 🎨 UI/UX enhancements
- 🚀 Performance optimizations
- 🔐 Security audits

---

## 📄 License

Dual-licensed:
- **PolyForm Noncommercial License 1.0.0** (default)
- **Apache License 2.0** (for approved open-source use)

See [LICENSING.md](LICENSING.md) for details.

---

## 🙏 Acknowledgments

Built with:
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [Next.js](https://nextjs.org/) - React framework
- [Clerk](https://clerk.com/) - Authentication
- [Neon](https://neon.tech/) - Serverless Postgres
- [Upstash](https://upstash.com/) - Serverless Redis
- [pgvector](https://github.com/pgvector/pgvector) - Vector similarity search

---

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/thecontextcache/contextcache/issues)
- **Discussions**: [GitHub Discussions](https://github.com/thecontextcache/contextcache/discussions)
- **Social**: [@thecontextcache](https://thecontextcache.bsky.social)

---

## 🗺️ Roadmap

### v0.2 (Current - Production Ready)
- ✅ Clerk authentication integration
- ✅ Multi-tenant architecture with RLS
- ✅ Three-layer encryption (KEK/DEK hierarchy)
- ✅ XChaCha20-Poly1305 content encryption
- ✅ Argon2id key derivation
- ✅ Project management with encrypted metadata
- ✅ Document ingestion with chunking
- ✅ Background jobs with Arq + Redis
- ✅ PageRank graph ranking
- ✅ Hybrid search (BM25 + vector + PageRank)
- ✅ Glassmorphism UI with dark/light themes
- ✅ Framer Motion animations
- ✅ Cloudflare Workers SSR deployment
- ✅ Session-based unlock flow
- ✅ Cryptographic audit trails

### v0.3 (Next - Q1 2025)
- [ ] Neural reranking models
- [ ] GraphQL API
- [ ] Team/workspace features
- [ ] Document export/import
- [ ] Browser extension
- [ ] Advanced graph visualizations
- [ ] Collaborative knowledge graphs

### v1.0 (Future - Q2 2025)
- [ ] Mobile app (React Native)
- [ ] Offline mode with sync
- [ ] API marketplace
- [ ] Enterprise SSO (SAML)
- [ ] Self-hosted option
- [ ] Custom embedding models
- [ ] Advanced analytics dashboard

---

<p align="center">
  Made with ❤️ by the ContextCache team
</p>

<p align="center">
  <a href="https://github.com/thecontextcache/contextcache">⭐ Star us on GitHub</a> •
  <a href="https://thecontextcache.bsky.social">🦋 Follow on Bluesky</a>
</p>
