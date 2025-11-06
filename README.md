# ContextCache

Privacy-first knowledge graphs for AI research and analysis

---

## Overview

ContextCache transforms unstructured documents into queryable knowledge graphs with complete privacy and traceability. Built for researchers, analysts, and students who need AI-powered answers they can trust and verify.

## Key Features

### Privacy-First Architecture
- **Zero-knowledge encryption**: Your passphrase never leaves your device
- **Client-side encryption**: All data encrypted before transmission
- **Argon2id key derivation**: Industry-standard cryptographic protection

### Intelligent Knowledge Extraction
- **Quad-based storage**: Facts stored as subject-predicate-object-source tuples
- **Hybrid search**: Combines BM25, dense embeddings, PageRank, and temporal decay
- **Semantic understanding**: Natural language queries with contextual results
- **Multiple AI providers**: Choose between HuggingFace (local), Ollama (self-hosted), OpenAI, or Anthropic
- **Privacy-first embeddings**: Default to local processing with open-source models

### Complete Auditability
- **Full provenance tracking**: Every fact linked to its source
- **Cryptographic verification**: Tamper-evident event chains
- **Confidence scoring**: Transparent reasoning and evidence paths

### Cloud-Native Design
- **Serverless architecture**: Auto-scaling with zero maintenance
- **Multi-tenant support**: Secure project isolation
- **Global performance**: Edge deployment with sub-100ms latency

## Technical Architecture

### Frontend
- **Framework**: Next.js 15 with TypeScript
- **Authentication**: Clerk
- **Deployment**: Cloudflare Workers
- **UI**: Modern, responsive design with dark mode support

### Backend
- **API**: FastAPI (Python)
- **Database**: PostgreSQL with pgvector (Neon)
- **Cache**: Redis (Upstash)
- **Deployment**: Google Cloud Run

### MCP Server Integration
ContextCache includes Model Context Protocol servers for:
- Document extraction
- Knowledge retrieval
- Audit logging
- Policy enforcement

## Security

- **E2EE**: End-to-end encryption for all user data
- **Zero-trust architecture**: No plaintext data on servers
- **Cryptographic verification**: All operations are auditable
- **Rate limiting**: Protection against abuse
- **CORS policies**: Strict origin validation

## Use Cases

**Academic Research**
- Track citations and sources across papers
- Build literature review knowledge bases
- Verify claims with provenance

**Business Intelligence**
- Extract insights from reports and documents
- Maintain audit trails for compliance
- Query knowledge bases with natural language

**Personal Knowledge Management**
- Organize research notes and articles
- Build interconnected knowledge graphs
- Export and share findings securely

## Technology Stack

**Core Technologies**:
- TypeScript, Python, PostgreSQL, Redis
- Next.js 15, FastAPI, pgvector
- Cloudflare Workers, Google Cloud Run

**AI & Embeddings**:
- Hugging Face Transformers (sentence-transformers)
- Ollama (local LLM support)
- OpenAI (optional)
- Anthropic Claude (optional)

**Key Libraries**:
- Clerk (authentication)
- Zustand (state management)
- Axios (HTTP client)
- Framer Motion (animations)
- Tailwind CSS (styling)

## Documentation

- [API Reference](docs/api-reference.md)
- [Data Model](docs/data-model.md)
- [Security Architecture](docs/security.md)
- [MCP Integration](docs/mcp.md)

## License

See [LICENSING.md](LICENSING.md) for details.

## Contributing

We welcome contributions. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting pull requests.

## Support

For issues or questions, please visit our [GitHub Issues](https://github.com/thecontextcache/contextcache/issues).

---

Built with privacy, security, and transparency at the core.
