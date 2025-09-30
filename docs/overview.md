---
title: Overview
description: "Privacy-first, local-first memory engine for AI research"
---

# What is ContextCache?

ContextCache is a privacy-first memory engine that transforms documents into a queryable knowledge graph. Every fact is traceable, explainable, auditable, and portable.

## Key Features

<CardGroup cols={2}>
  <Card title="Privacy First" icon="lock">
    End-to-end encryption with XChaCha20-Poly1305. Your data never leaves your control.
  </Card>
  <Card title="Explainable Answers" icon="chart-line">
    Every answer includes confidence scores, reasoning paths, and full provenance.
  </Card>
  <Card title="Audit Chains" icon="link">
    Cryptographically verifiable event logs with BLAKE3 hash chains.
  </Card>
  <Card title="Memory Packs" icon="box-archive">
    Export and share signed knowledge graphs with Ed25519 signatures.
  </Card>
</CardGroup>

## Architecture

ContextCache consists of:

- **Frontend**: Next.js web interface for visual knowledge exploration
- **Backend**: FastAPI service with 5 specialized MCP servers
- **Database**: Postgres with pgvector for semantic search
- **Queue**: Redis for background jobs and rate limiting
- **Worker**: Background processor for ranking and decay algorithms
```mermaid
graph LR
    A[Documents] --> B[MCP Docs Server]
    B --> C[MCP Extractor]
    C --> D[Quads]
    D --> E[MCP Memory Server]
    E --> F[Knowledge Graph]
    F --> G[MCP Audit Server]
    G --> H[Verifiable Chain]
Core Workflow
<Steps>
  <Step title="Import Documents">
    Upload PDFs, URLs, or text. Policy gate enforces domain allowlists and size limits.
  </Step>
  <Step title="Extract Knowledge">
    Extractor server converts text into structured quads (subject, predicate, object, context).
  </Step>
  <Step title="Rank Facts">
    Pluggable algorithms (PageRank, Bayesian novelty, time decay) score relevance.
  </Step>
  <Step title="Ask Questions">
    Query the knowledge graph and get explainable answers with citations.
  </Step>
  <Step title="Verify & Export">
    Audit chains prove integrity. Export signed Memory Packs for sharing.
  </Step>
</Steps>
Why ContextCache?
For Researchers

Reproducible: Full audit trail from source to conclusion
Collaborative: Share Memory Packs with verifiable provenance
Transparent: See exactly why each fact was ranked

For Privacy-Conscious Users

Zero-knowledge: Your passphrase never leaves your device
Local-first: Run entirely offline with SQLite
No accounts: No tracking, no telemetry, no backdoors

For Developers

Extensible: Plugin architecture for custom analyzers
MCP Protocol: Standard interface for agent integration
Open Source: Dual-licensed (Apache 2.0 / PolyForm NC)

Tech Stack
LayerTechnologyFrontendNext.js 15, TypeScript, Tailwind, CytoscapeBackendFastAPI, Pydantic v2, MCP ProtocolDatabaseNeon Postgres (pgvector)Cache/QueueUpstash RedisCryptoPyNaCl, Argon2, BLAKE3Testingpytest, Playwright, k6
Use Cases
<AccordionGroup>
  <Accordion title="Academic Research">
    Track sources, maintain provenance, and generate reproducible literature reviews with full citation chains.
  </Accordion>
  <Accordion title="Legal Discovery">
    Ingest case documents, extract facts, and maintain cryptographic audit trails for compliance.
  </Accordion>
  <Accordion title="Intelligence Analysis">
    Build knowledge graphs from open-source intelligence with verifiable reasoning paths.
  </Accordion>
  <Accordion title="Personal Knowledge">
    Create your own searchable memory bank without surrendering control to third parties.
  </Accordion>
</AccordionGroup>
What Makes It Different?
FeatureContextCacheTraditional RAGVector DBsProvenanceFull source-to-answer chainLimitedNoneExplainabilityConfidence + reasoningBlack boxSimilarity scores onlyAudit TrailCryptographic verificationLogs onlyNonePrivacyE2E encrypted, local-firstCloud-dependentCloud-dependentPortabilitySigned export/importVendor lock-inVendor lock-in
Next Steps
<CardGroup cols={2}>
  <Card title="Quick Start" icon="rocket" href="/quickstart">
    Get ContextCache running locally in 5 minutes
  </Card>
  <Card title="Data Model" icon="diagram-project" href="/data-model">
    Understand quads, provenance, and Memory Packs
  </Card>
  <Card title="Security Model" icon="shield-halved" href="/security">
    Learn about our cryptographic guarantees
  </Card>
  <Card title="MCP Servers" icon="server" href="/mcp">
    Explore the protocol interface for agents
  </Card>
</CardGroup>