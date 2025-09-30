---
title: API Reference
description: "REST API and GraphQL endpoints"
---

# API Reference

ContextCache exposes both REST and MCP (Model Context Protocol) interfaces. This document covers the REST API. For MCP servers, see [MCP Documentation](/mcp).

## Base URL

**Development:**
http://localhost:8000

**Production:**
https://api.thecontextcache.com

## Authentication

All requests require authentication via Bearer token:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.thecontextcache.com/projects
Headers:

Authorization: Bearer <token> (required)
X-Project-ID: <uuid> (required for project-scoped endpoints)
Content-Type: application/json

Rate Limits
Default rate limits per project:
Endpoint TypeLimitWindowLight reads120 requests1 minuteIngest/Extract30 requests1 minuteHeavy compute10 requests1 minute
Rate limit headers:
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1705318800
429 Response:
json{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "retry_after": 60
}
Common Parameters
Pagination:

limit: Number of results (default: 20, max: 100)
offset: Number of results to skip (default: 0)
cursor: Cursor-based pagination token

Sorting:

sort_by: Field to sort by
sort_order: asc or desc (default: desc)

Filtering:

min_confidence: Minimum confidence score (0.0 to 1.0)
created_after: ISO 8601 timestamp
created_before: ISO 8601 timestamp

Endpoints
Health Check
GET /health
Check API health status.
Response:
json{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2025-01-15T10:30:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "mcp_servers": "operational"
  }
}

Projects
POST /projects
Create a new project.
Request:
json{
  "name": "My Research Project",
  "passphrase": "correct horse battery staple mountain river sunset"
}
Response:
json{
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "My Research Project",
  "salt": "base64-encoded-salt",
  "created_at": "2025-01-15T10:30:00Z"
}
Errors:

400: Weak passphrase (min 20 characters)
409: Project name already exists


GET /projects
List all projects.
Query Parameters:

limit (default: 20)
offset (default: 0)

Response:
json{
  "projects": [
    {
      "project_id": "550e8400-...",
      "name": "My Research Project",
      "fact_count": 1523,
      "entity_count": 342,
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-20T14:22:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}

GET /projects/{project_id}
Get project details.
Response:
json{
  "project_id": "550e8400-...",
  "name": "My Research Project",
  "salt": "base64-encoded-salt",
  "fact_count": 1523,
  "entity_count": 342,
  "relation_count": 1891,
  "last_rank_computed": "2025-01-20T12:00:00Z",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-20T14:22:00Z"
}
Errors:

404: Project not found


DELETE /projects/{project_id}
Delete a project and all associated data.
Response:
json{
  "message": "Project deleted successfully",
  "facts_deleted": 1523,
  "entities_deleted": 342,
  "audit_events_archived": 4567
}
Errors:

404: Project not found


Documents
POST /documents/ingest
Ingest a document from URL or upload.
Request (URL):
json{
  "project_id": "550e8400-...",
  "source_type": "url",
  "source_url": "https://en.wikipedia.org/wiki/Artificial_intelligence"
}
Request (Upload):
bashcurl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "X-Project-ID: 550e8400-..." \
  -F "file=@paper.pdf" \
  https://api.thecontextcache.com/documents/ingest
Response:
json{
  "job_id": "job-123",
  "status": "queued",
  "document_id": "doc-456",
  "estimated_duration_seconds": 30
}
Errors:

400: Invalid URL or file format
413: File too large (max 50MB)
403: Domain not in allowlist


GET /documents/{document_id}
Get document metadata.
Response:
json{
  "document_id": "doc-456",
  "project_id": "550e8400-...",
  "title": "Artificial intelligence - Wikipedia",
  "source_type": "url",
  "source_url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
  "content_length": 145234,
  "chunk_count": 142,
  "fact_count": 89,
  "status": "processed",
  "created_at": "2025-01-15T10:35:00Z",
  "processed_at": "2025-01-15T10:36:30Z"
}
Errors:

404: Document not found


Facts
POST /facts
Add facts manually.
Request:
json{
  "project_id": "550e8400-...",
  "facts": [
    {
      "subject": "Marie Curie",
      "predicate": "won",
      "object": "Nobel Prize in Physics",
      "context": "1903",
      "confidence": 0.98,
      "provenance": {
        "source_type": "user_input",
        "source_id": "manual-entry-1"
      }
    }
  ]
}
Response:
json{
  "fact_ids": [
    "770e8400-e29b-41d4-a716-446655440000"
  ],
  "audit_event_id": "990e8400-..."
}
Errors:

400: Invalid fact structure
409: Duplicate fact


GET /facts
List facts with pagination.
Query Parameters:

project_id (required)
limit (default: 20, max: 100)
offset (default: 0)
min_confidence (default: 0.0)
sort_by (options: rank_score, created_at, confidence)
sort_order (default: desc)

Response:
json{
  "facts": [
    {
      "fact_id": "770e8400-...",
      "subject": "Marie Curie",
      "predicate": "won",
      "object": "Nobel Prize in Physics",
      "context": "1903",
      "confidence": 0.98,
      "rank_score": 0.87,
      "created_at": "2025-01-15T10:40:00Z"
    }
  ],
  "total": 1523,
  "limit": 20,
  "offset": 0
}

GET /facts/{fact_id}
Get fact details with full provenance.
Response:
json{
  "fact_id": "770e8400-...",
  "project_id": "550e8400-...",
  "subject": "Marie Curie",
  "predicate": "won",
  "object": "Nobel Prize in Physics",
  "context": "1903",
  "confidence": 0.98,
  "rank_score": 0.87,
  "decay_factor": 0.92,
  "provenance": {
    "source_type": "url",
    "source_url": "https://en.wikipedia.org/wiki/Marie_Curie",
    "document_title": "Marie Curie - Wikipedia",
    "chunk_id": "chunk-42",
    "chunk_text": "In 1903, Marie Curie became...",
    "extractor_name": "default_extractor",
    "extractor_version": "0.1.0",
    "extracted_at": "2025-01-15T10:35:00Z"
  },
  "created_at": "2025-01-15T10:40:00Z",
  "last_accessed": "2025-01-20T14:22:00Z"
}
Errors:

404: Fact not found


DELETE /facts/{fact_id}
Delete a fact.
Response:
json{
  "message": "Fact deleted successfully",
  "audit_event_id": "aa0e8400-..."
}
Errors:

404: Fact not found


Query
POST /query
Semantic search over facts.
Request:
json{
  "project_id": "550e8400-...",
  "query": "What did Marie Curie discover?",
  "limit": 20,
  "min_confidence": 0.7,
  "explain": true
}
Response:
json{
  "query": "What did Marie Curie discover?",
  "facts": [
    {
      "fact_id": "770e8400-...",
      "subject": "Marie Curie",
      "predicate": "discovered",
      "object": "Radium",
      "context": "Research paper: Curie, M. (1898)",
      "confidence": 0.98,
      "rank_score": 0.87,
      "similarity": 0.93,
      "explanation": {
        "pagerank_score": 0.92,
        "decay_factor": 0.95,
        "semantic_similarity": 0.93,
        "reasoning": "High pagerank due to connections to Nobel Prize facts..."
      }
    }
  ],
  "total": 5,
  "processing_time_ms": 45
}

Ranking
POST /ranking/compute
Trigger ranking algorithm execution.
Request:
json{
  "project_id": "550e8400-...",
  "analyzer": "ppr_time_decay",
  "force_recompute": false
}
Response:
json{
  "job_id": "job-789",
  "status": "queued",
  "estimated_duration_seconds": 30
}

GET /ranking/status/{job_id}
Check ranking job status.
Response:
json{
  "job_id": "job-789",
  "status": "completed",
  "started_at": "2025-01-20T12:00:00Z",
  "completed_at": "2025-01-20T12:00:28Z",
  "facts_ranked": 1523,
  "audit_event_id": "bb0e8400-..."
}
Status values:

queued: Job waiting to start
running: Job in progress
completed: Job finished successfully
failed: Job encountered error


Audit
GET /audit/events
List audit events.
Query Parameters:

project_id (required)
limit (default: 50, max: 500)
cursor (pagination cursor)
event_type (filter by type)
start_time (ISO 8601)
end_time (ISO 8601)

Response:
json{
  "events": [
    {
      "event_id": "cc0e8400-...",
      "project_id": "550e8400-...",
      "event_type": "fact_added",
      "event_data": {
        "fact_id": "770e8400-...",
        "action": "add"
      },
      "actor": "user",
      "timestamp": "2025-01-15T10:40:00Z",
      "prev_hash": "9e4b7a1f...",
      "current_hash": "a3f5d8c2..."
    }
  ],
  "next_cursor": "dd0e8400-...",
  "has_more": true
}

POST /audit/verify
Verify audit chain integrity.
Request:
json{
  "project_id": "550e8400-...",
  "start_event_id": null,
  "end_event_id": null
}
Response:
json{
  "valid": true,
  "events_verified": 1523,
  "first_event_hash": "00000000...",
  "last_event_hash": "a3f5d8c2...",
  "verification_time_ms": 234
}
Errors:

chain_broken: Hash mismatch detected
missing_events: Gap in event sequence


GET /audit/export
Export audit log.
Query Parameters:

project_id (required)
format (options: json, csv, jsonl)

Response:
json{
  "format": "json",
  "events": [ ... ],
  "exported_at": "2025-01-20T14:30:00Z",
  "download_url": "https://storage.googleapis.com/.../audit-log.json"
}

Memory Packs
POST /packs/export
Export a Memory Pack.
Request:
json{
  "project_id": "550e8400-...",
  "include_facts": true,
  "include_entities": true,
  "include_relations": true,
  "min_rank_score": 0.5
}
Response:
json{
  "pack_id": "pack-123",
  "download_url": "https://storage.googleapis.com/.../memory-pack.json",
  "signature": "base64-encoded-ed25519-signature",
  "public_key": "base64-encoded-public-key",
  "expires_at": "2025-01-21T14:30:00Z"
}

POST /packs/import
Import a Memory Pack.
Request:
bashcurl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "X-Project-ID: 550e8400-..." \
  -F "pack=@memory-pack.json" \
  https://api.thecontextcache.com/packs/import
Response:
json{
  "job_id": "job-456",
  "status": "queued",
  "signature_valid": true,
  "facts_to_import": 523,
  "estimated_duration_seconds": 15
}
Errors:

400: Invalid pack format
403: Signature verification failed
409: Pack already imported


Error Responses
All errors follow this format:
json{
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional context"
  },
  "timestamp": "2025-01-20T14:30:00Z",
  "request_id": "req-abc123"
}
Common Error Codes:
CodeHTTP StatusDescriptioninvalid_request400Malformed requestunauthorized401Invalid or missing auth tokenforbidden403Insufficient permissionsnot_found404Resource does not existconflict409Resource already existsrate_limit_exceeded429Too many requestsinternal_error500Server errorservice_unavailable503Temporary outage

OpenAPI Specification
Full OpenAPI 3.0 spec available at:
GET /openapi.json
Interactive documentation (Swagger UI):
GET /docs
ReDoc alternative:
GET /redoc

GraphQL (Planned v0.2)
GraphQL endpoint will be available at:
POST /graphql
GraphQL Playground:
GET /graphql/playground

SDK Libraries
Official SDKs:
Python:
bashpip install contextcache-sdk
TypeScript:
bashpnpm add @contextcache/sdk
Examples:
pythonfrom contextcache import ContextCache

client = ContextCache(api_key="YOUR_API_KEY")
project = client.projects.create(name="My Project", passphrase="...")
facts = client.query(project_id=project.id, query="What is AI?")

Webhook Events (Planned v0.3)
Subscribe to events via webhooks:
Events:

fact.added
fact.updated
fact.deleted
ranking.completed
pack.exported
pack.imported

Webhook payload:
json{
  "event": "fact.added",
  "project_id": "550e8400-...",
  "timestamp": "2025-01-20T14:30:00Z",
  "data": { ... }
}

Support

Interactive docs: /docs
GitHub Issues: https://github.com/thecontextcache/contextcache/issues
Email: thecontextcache@gmail.com