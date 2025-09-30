---
title: MCP Servers
description: "Model Context Protocol server architecture and APIs"
---

# MCP Servers

ContextCache exposes its functionality through five specialized MCP (Model Context Protocol) servers. Each server handles a specific domain and can be used independently or composed together.

## Architecture Overview
┌─────────────────────────────────────────────────────────────┐
│                        Frontend / Agent                      │
└─────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│                       Policy Gate                            │
│  Rate Limiting │ Allowlists │ Quotas │ PoW Challenge       │
└─────────────────────────────────────────────────────────────┘
│
┌────────────────────┼────────────────────┐
▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Docs Server  │    │  Extractor   │    │   Memory     │
│              │───▶│    Server    │───▶│   Server     │
└──────────────┘    └──────────────┘    └──────────────┘
│
▼
┌──────────────┐
│    Audit     │
│    Server    │
└──────────────┘

## Server Catalog

### 1. Docs Server

**Purpose:** Safe document fetching and chunking

**Port:** 8001

**Responsibilities:**
- Fetch documents from allowed domains
- Parse PDFs, HTML, plain text
- Chunk documents for processing
- Enforce size and timeout limits
- Deduplicate content

**Tools:**

#### `fetch_document`
Fetch and parse a document from a URL.

**Input:**
```json
{
  "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
  "project_id": "550e8400-e29b-41d4-a716-446655440000"
}
Output:
json{
  "document_id": "doc-123",
  "title": "Artificial intelligence - Wikipedia",
  "content": "Full document text...",
  "metadata": {
    "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "content_type": "text/html",
    "content_length": 145234,
    "fetched_at": "2025-01-15T10:30:00Z"
  }
}
Errors:

domain_not_allowed: URL domain not in allowlist
document_too_large: Exceeds MAX_DOCUMENT_SIZE_MB
fetch_timeout: Request exceeded FETCH_TIMEOUT_SECONDS
invalid_url: Malformed URL

chunk_document
Split document into semantic chunks.
Input:
json{
  "document_id": "doc-123",
  "chunk_size": 1000,
  "overlap": 200,
  "method": "semantic"
}
Output:
json{
  "chunks": [
    {
      "chunk_id": "chunk-1",
      "text": "Artificial intelligence (AI) is intelligence...",
      "start_offset": 0,
      "end_offset": 1000,
      "metadata": {
        "section": "Introduction",
        "paragraph_index": 1
      }
    }
  ]
}
Errors:

document_not_found: Invalid document_id
invalid_chunk_size: chunk_size must be between 100 and 10000

deduplicate_chunks
Remove duplicate or near-duplicate chunks.
Input:
json{
  "chunks": [ ... ],
  "threshold": 0.95
}
Output:
json{
  "unique_chunks": [ ... ],
  "duplicates_removed": 12
}

2. Extractor Server
Purpose: Extract structured facts from text
Port: 8002
Responsibilities:

Convert text chunks into quads
Assign confidence scores
Generate provenance metadata
Support multiple extraction methods (LLM, rule-based)

Tools:
extract_facts
Extract facts from text chunks.
Input:
json{
  "chunks": [
    {
      "chunk_id": "chunk-1",
      "text": "Marie Curie won the Nobel Prize in Physics in 1903."
    }
  ],
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "extractor": "default",
  "extraction_method": "llm"
}
Output:
json{
  "facts": [
    {
      "subject": "Marie Curie",
      "predicate": "won",
      "object": "Nobel Prize in Physics",
      "context": "1903",
      "confidence": 0.98,
      "provenance": {
        "chunk_id": "chunk-1",
        "extractor_name": "default",
        "extractor_version": "0.1.0",
        "extraction_method": "llm",
        "extracted_at": "2025-01-15T10:35:00Z"
      }
    }
  ]
}
Errors:

extraction_failed: LLM or rule-based extraction error
invalid_extractor: Unknown extractor name
rate_limit_exceeded: Too many extraction requests

validate_facts
Validate extracted facts for quality.
Input:
json{
  "facts": [ ... ]
}
Output:
json{
  "valid_facts": [ ... ],
  "invalid_facts": [
    {
      "fact": { ... },
      "reason": "subject is empty"
    }
  ]
}

3. Memory Server
Purpose: Store and query the knowledge graph
Port: 8003
Responsibilities:

Add/update/delete facts
Semantic search (pgvector)
Graph traversal
Rank facts by score
Apply time decay

Tools:
add_facts
Add facts to the knowledge graph.
Input:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "facts": [ ... ]
}
Output:
json{
  "fact_ids": [
    "770e8400-e29b-41d4-a716-446655440000",
    "880e8400-e29b-41d4-a716-446655440001"
  ],
  "audit_event_id": "990e8400-e29b-41d4-a716-446655440002"
}
Errors:

duplicate_fact: Fact already exists (based on content hash)
project_not_found: Invalid project_id
encryption_failed: Cannot encrypt fact content

query_facts
Semantic search over facts.
Input:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "query": "What did Marie Curie discover?",
  "limit": 20,
  "min_confidence": 0.7
}
Output:
json{
  "facts": [
    {
      "fact_id": "770e8400-...",
      "subject": "Marie Curie",
      "predicate": "discovered",
      "object": "Radium",
      "context": "Research paper: Curie, M. (1898)",
      "confidence": 0.98,
      "rank_score": 0.87,
      "similarity": 0.93
    }
  ]
}
Errors:

query_too_long: Query exceeds 1000 characters
invalid_limit: Limit must be between 1 and 100

rank_facts
Trigger ranking algorithm execution.
Input:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "analyzer": "ppr_time_decay",
  "force_recompute": false
}
Output:
json{
  "job_id": "job-456",
  "status": "queued",
  "estimated_duration_seconds": 30
}
Errors:

analyzer_not_found: Unknown analyzer name
rank_in_progress: Ranking already running for this project

apply_decay
Apply time-based decay to fact scores.
Input:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000"
}
Output:
json{
  "facts_updated": 1523,
  "audit_event_id": "aa0e8400-..."
}

4. Audit Server
Purpose: Manage cryptographic audit chains
Port: 8004
Responsibilities:

Append audit events
Verify hash chains
Export audit logs
Generate integrity proofs

Tools:
append_event
Add event to audit chain.
Input:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "fact_added",
  "event_data": {
    "fact_id": "770e8400-...",
    "action": "add",
    "actor": "user"
  }
}
Output:
json{
  "event_id": "bb0e8400-...",
  "current_hash": "a3f5d8c2...",
  "prev_hash": "9e4b7a1f...",
  "timestamp": "2025-01-15T10:40:00Z"
}
Errors:

chain_integrity_error: prev_hash does not match last event
invalid_event_type: Unknown event type

verify_chain
Verify integrity of audit chain.
Input:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "start_event_id": null,
  "end_event_id": null
}
Output:
json{
  "valid": true,
  "events_verified": 1523,
  "first_event_hash": "00000000...",
  "last_event_hash": "a3f5d8c2..."
}
Errors:

chain_broken: Hash mismatch at event N
missing_events: Gap in event sequence

export_audit_log
Export audit chain for external verification.
Input:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "format": "json",
  "include_event_data": true
}
Output:
json{
  "events": [ ... ],
  "verification_instructions": "Run: blake3_verify_chain(events)",
  "exported_at": "2025-01-15T10:45:00Z"
}

5. Policy Gate
Purpose: Enforce rate limits, quotas, and security policies
Port: 8005
Responsibilities:

Per-project token buckets
Per-IP rate limits
Domain/path allowlists
Proof-of-Work challenges
Resource quotas

Tools:
check_rate_limit
Check if request is allowed under rate limits.
Input:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_ip": "203.0.113.45",
  "endpoint": "ingest",
  "cost": 1
}
Output:
json{
  "allowed": true,
  "remaining": 29,
  "reset_at": "2025-01-15T10:46:00Z",
  "retry_after": null
}
Errors:

rate_limit_exceeded: Token bucket exhausted
pow_required: Must solve Proof-of-Work challenge

check_domain_allowed
Verify if domain is in allowlist.
Input:
json{
  "url": "https://en.wikipedia.org/wiki/AI",
  "project_id": "550e8400-e29b-41d4-a716-446655440000"
}
Output:
json{
  "allowed": true,
  "domain": "en.wikipedia.org",
  "reason": "domain in global allowlist"
}
Errors:

domain_not_allowed: Domain not in allowlist
url_invalid: Malformed URL

solve_pow
Submit Proof-of-Work solution.
Input:
json{
  "challenge": "a3f5d8c2...",
  "nonce": 123456,
  "difficulty": 4
}
Output:
json{
  "valid": true,
  "token": "pow-token-xyz",
  "expires_at": "2025-01-15T11:00:00Z"
}
Errors:

invalid_solution: Nonce does not satisfy difficulty
challenge_expired: Challenge timestamp too old


MCP Protocol Details
Request Format
All MCP servers accept JSON-RPC 2.0 requests:
json{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tool_name",
  "params": { ... }
}
Response Format
Success:
json{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}
Error:
json{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid request",
    "data": { ... }
  }
}
Error Codes

-32700: Parse error (invalid JSON)
-32600: Invalid request
-32601: Method not found
-32602: Invalid params
-32603: Internal error
-32000 to -32099: Custom application errors

Authentication
Internal calls (server-to-server):
Authorization: Bearer <API_INTERNAL_KEY>
User calls (frontend to server):
Authorization: Bearer <user_session_token>
X-Project-ID: <project_uuid>
Rate Limiting
All endpoints return rate limit headers:
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1705318800
When rate limited:
HTTP 429 Too Many Requests
Retry-After: 60

Server Configuration
Environment Variables
Each server can be configured via environment variables:
bash# Docs Server
MCP_DOCS_SERVER_PORT=8001
MAX_DOCUMENT_SIZE_MB=50
ALLOWED_DOMAINS=example.com,arxiv.org,wikipedia.org
FETCH_TIMEOUT_SECONDS=30

# Extractor Server
MCP_EXTRACTOR_SERVER_PORT=8002
DEFAULT_EXTRACTOR=default
EXTRACTION_TIMEOUT_SECONDS=60

# Memory Server
MCP_MEMORY_SERVER_PORT=8003
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Audit Server
MCP_AUDIT_SERVER_PORT=8004
AUDIT_RETENTION_DAYS=365

# Policy Gate
MCP_POLICY_GATE_PORT=8005
RATE_LIMIT_LIGHT_READ=120
RATE_LIMIT_INGEST=30
POW_ENABLED=false
POW_DIFFICULTY=4
Deployment
Each server runs as a separate Cloud Run service:
bash# Deploy all servers
gcloud run deploy contextcache-mcp-docs --image=gcr.io/.../api:tag
gcloud run deploy contextcache-mcp-extractor --image=gcr.io/.../api:tag
gcloud run deploy contextcache-mcp-memory --image=gcr.io/.../api:tag
gcloud run deploy contextcache-mcp-audit --image=gcr.io/.../api:tag
gcloud run deploy contextcache-mcp-policy-gate --image=gcr.io/.../api:tag

Usage Examples
Python Client
pythonimport httpx

class MCPClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key
    
    def call(self, method: str, params: dict):
        response = httpx.post(
            self.base_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params
            },
            headers={"Authorization": f"Bearer {self.api_key}"}
        )
        return response.json()["result"]

# Usage
docs_client = MCPClient("http://localhost:8001", "api-key")
doc = docs_client.call("fetch_document", {
    "url": "https://en.wikipedia.org/wiki/AI",
    "project_id": "550e8400-..."
})
TypeScript Client
typescriptclass MCPClient {
  constructor(private baseUrl: string, private apiKey: string) {}
  
  async call(method: string, params: object) {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params
      })
    });
    
    const data = await response.json();
    return data.result;
  }
}

// Usage
const memoryClient = new MCPClient('http://localhost:8003', 'api-key');
const facts = await memoryClient.call('query_facts', {
  project_id: '550e8400-...',
  query: 'What is AI?',
  limit: 10
});

Next Steps

See API Reference for REST endpoint documentation
See Cookbook for end-to-end workflow examples
See Security Model for authentication details