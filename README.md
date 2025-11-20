# ContextCache

**Privacy-first knowledge graph engine for AI research and analysis.**

[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Alpha-yellow.svg)](https://thecontextcache.com)

## Overview

ContextCache is an enterprise-grade knowledge management system that combines zero-knowledge encryption with AI-powered semantic search. Your data is encrypted end-to-end, and your passphrase never leaves your device.

### Key Features

- **🔒 Zero-Knowledge Encryption** - End-to-end encryption with XChaCha20-Poly1305
- **🧠 AI-Powered Search** - Semantic search using pgvector and multiple embedding providers
- **🔐 Cryptographically Auditable** - BLAKE3 hash-linked audit chains
- **⚡ Serverless & Scalable** - Built on Cloudflare Workers and Google Cloud Run
- **🎯 Multi-Tenant** - Complete data isolation per user
- **🤖 MCP Integration** - Model Context Protocol servers for AI agents

## Tech Stack

**Frontend:**
- Next.js 15 (React 19)
- Tailwind CSS
- Clerk Authentication
- Cloudflare Pages

**Backend:**
- FastAPI (Python 3.13)
- PostgreSQL with pgvector (Neon)
- Redis (Upstash)
- Google Cloud Run

**Security:**
- XChaCha20-Poly1305 encryption
- Argon2id key derivation
- Ed25519 signatures
- BLAKE3 hashing

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Python 3.13+
- Google Cloud account
- Cloudflare account
- Clerk account
- Neon PostgreSQL database
- Upstash Redis

### Local Development

```bash
# Clone repository
git clone https://github.com/thecontextcache/contextcache.git
cd contextcache

# Frontend setup
cd frontend
pnpm install
cp .env.example .env.local
# Edit .env.local with your keys
pnpm dev

# Backend setup (in new terminal)
cd api
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your keys
uvicorn main:app --reload
```

### Production Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for complete instructions.

## Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS
┌──────▼──────────────────┐
│  Cloudflare Pages       │
│  (Next.js Frontend)     │
└──────┬──────────────────┘
       │ HTTPS
┌──────▼──────────────────┐
│  Google Cloud Run       │
│  (FastAPI Backend)      │
└──────┬──────────────────┘
       │
┌──────▼──────────────────┐
│  Neon PostgreSQL        │
│  Upstash Redis          │
└─────────────────────────┘
```

## Security

ContextCache implements defense-in-depth security:

- **Encryption at Rest**: All data encrypted with user-derived keys
- **Encryption in Transit**: TLS 1.3 for all connections
- **Zero-Knowledge**: Server never sees unencrypted data or passphrases
- **SQL Injection Prevention**: Parameterized queries only
- **Authentication**: JWT-based with Clerk
- **Authorization**: Resource-level ownership checks
- **Rate Limiting**: Redis-based rate limiting
- **Audit Logging**: Immutable, hash-linked audit chains

See [SECURITY.md](SECURITY.md) for security policy and reporting vulnerabilities.

## Documentation

- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Production deployment instructions
- [API Reference](docs/api-reference.md) - REST API documentation
- [Data Model](docs/data-model.md) - Database schema and relationships
- [MCP Documentation](docs/mcp.md) - Model Context Protocol integration
- [Security](docs/security.md) - Security architecture and best practices

## License

Proprietary software. All rights reserved.

See [LICENSE](LICENSE) and [LICENSING.md](LICENSING.md) for details.

## Support

For issues and questions:
- Check the [documentation](docs/)
- Review [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- Open an issue on GitHub (for bugs only)

## Status

**Alpha Version** - Under active development. Not recommended for production use with sensitive data.

---

© 2024-2025 ContextCache. All rights reserved.
