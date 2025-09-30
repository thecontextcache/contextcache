---
title: Data Model
description: "Quads, provenance, audit chains, and Memory Packs"
---

# Data Model

ContextCache represents knowledge as a graph of typed relationships (quads) with full provenance tracking and cryptographic audit trails.

## Core Concepts

### Quads

A **quad** is the fundamental unit of knowledge in ContextCache:
(subject, predicate, object, context)

**Components:**
- **Subject**: The entity being described (node in the graph)
- **Predicate**: The relationship type (edge label)
- **Object**: The value or target entity (node or literal)
- **Context**: The source or scope of this assertion

**Example:**
```json
{
  "subject": "Marie Curie",
  "predicate": "won",
  "object": "Nobel Prize in Physics",
  "context": "Wikipedia: Marie Curie, paragraph 3"
}
Entities
Entities are nodes in the knowledge graph representing people, places, concepts, or things.
Schema:
pythonclass Entity:
    id: UUID
    project_id: UUID
    name: str
    entity_type: str  # person, organization, concept, location, etc.
    aliases: list[str]
    created_at: datetime
    updated_at: datetime
Example:
json{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Marie Curie",
  "entity_type": "person",
  "aliases": ["Maria Skłodowska", "Madame Curie"]
}
Relations
Relations are typed edges connecting entities.
Schema:
pythonclass Relation:
    id: UUID
    project_id: UUID
    predicate: str
    subject_id: UUID  # FK to Entity
    object_id: UUID   # FK to Entity or Literal
    confidence: float  # 0.0 to 1.0
    created_at: datetime
Example:
json{
  "predicate": "won",
  "subject_id": "550e8400-...",  # Marie Curie
  "object_id": "660e8400-...",   # Nobel Prize in Physics
  "confidence": 0.95
}
Facts
Facts combine quads with provenance and metadata.
Schema:
pythonclass Fact:
    id: UUID
    project_id: UUID
    subject: str
    predicate: str
    object: str
    context: str
    confidence: float
    provenance: Provenance
    embedding: list[float]  # 768-dim vector for semantic search
    rank_score: float  # Computed by analyzer
    decay_factor: float  # Time-based decay
    created_at: datetime
    last_accessed: datetime
Example:
json{
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "subject": "Marie Curie",
  "predicate": "discovered",
  "object": "Radium",
  "context": "Research paper: Curie, M. (1898)",
  "confidence": 0.98,
  "provenance": {
    "source_type": "document",
    "source_id": "doc-123",
    "extractor": "default_extractor_v1",
    "extracted_at": "2025-01-15T10:30:00Z"
  },
  "rank_score": 0.87,
  "decay_factor": 0.92
}
Provenance
Provenance tracks the origin and chain of custody for every fact.
Schema:
pythonclass Provenance:
    source_type: str  # document, url, user_input, imported_pack
    source_id: str
    source_url: str | None
    document_title: str | None
    chunk_id: str | None
    chunk_text: str
    extractor_name: str
    extractor_version: str
    extraction_method: str  # llm, rule_based, hybrid
    extracted_at: datetime
    confidence: float
    metadata: dict
Example:
json{
  "source_type": "url",
  "source_url": "https://en.wikipedia.org/wiki/Marie_Curie",
  "document_title": "Marie Curie - Wikipedia",
  "chunk_id": "chunk-42",
  "chunk_text": "In 1903, Marie Curie became the first woman to win a Nobel Prize...",
  "extractor_name": "default_extractor",
  "extractor_version": "0.1.0",
  "extraction_method": "llm",
  "extracted_at": "2025-01-15T10:30:00Z",
  "confidence": 0.95,
  "metadata": {
    "model": "gpt-4",
    "temperature": 0.1,
    "chunk_position": 42
  }
}
Audit Chain
Every mutation to the knowledge graph is recorded in an immutable, hash-linked chain.
Schema:
pythonclass AuditEvent:
    id: UUID
    project_id: UUID
    event_type: str  # fact_added, fact_updated, fact_deleted, rank_computed
    event_data: dict
    actor: str  # system, user, analyzer
    timestamp: datetime
    prev_hash: bytes  # BLAKE3 hash of previous event
    current_hash: bytes  # BLAKE3(prev_hash || event_data)
Event Types:

fact_added: New fact ingested
fact_updated: Fact confidence or rank changed
fact_deleted: Fact removed
rank_computed: Ranking algorithm executed
decay_applied: Time decay applied
pack_imported: Memory Pack imported
pack_exported: Memory Pack exported

Chain Structure:
Genesis Event (prev_hash = 0x00...00)
    |
    v
Event 1 (prev_hash = hash(genesis))
    |
    v
Event 2 (prev_hash = hash(event_1))
    |
    v
Event N (prev_hash = hash(event_N-1))
Verification:
pythondef verify_chain(events: list[AuditEvent]) -> bool:
    for i, event in enumerate(events):
        if i == 0:
            assert event.prev_hash == b'\x00' * 32
        else:
            expected_hash = compute_hash(events[i-1])
            assert event.prev_hash == expected_hash
        
        computed = compute_hash(event)
        assert event.current_hash == computed
    
    return True
Memory Packs
Memory Packs are signed, portable exports of knowledge graphs.
Schema:
pythonclass MemoryPack:
    version: str  # "1.0"
    format: str  # "json-ld"
    created_at: datetime
    project_name: str
    facts: list[Fact]
    entities: list[Entity]
    relations: list[Relation]
    provenance: list[Provenance]
    metadata: dict
    signature: bytes  # Ed25519 signature
    public_key: bytes  # Ed25519 public key for verification
JSON-LD Structure:
json{
  "@context": "https://thecontextcache.com/schema/v1",
  "@type": "MemoryPack",
  "version": "1.0",
  "created_at": "2025-01-15T12:00:00Z",
  "project_name": "Nobel Prize Research",
  "facts": [
    {
      "@type": "Fact",
      "subject": "Marie Curie",
      "predicate": "won",
      "object": "Nobel Prize in Physics",
      "context": "Wikipedia",
      "confidence": 0.98,
      "provenance": { ... }
    }
  ],
  "entities": [ ... ],
  "relations": [ ... ],
  "metadata": {
    "fact_count": 1523,
    "entity_count": 342,
    "relation_count": 1891,
    "created_by": "user@example.com",
    "tags": ["physics", "history", "nobel"]
  },
  "signature": "base64-encoded-signature",
  "public_key": "base64-encoded-public-key"
}
Signature Scheme:
python# Export
signing_key = Ed25519SigningKey.generate()
pack_json = json.dumps(memory_pack, sort_keys=True)
signature = signing_key.sign(pack_json.encode())

pack_with_sig = {
    **memory_pack,
    "signature": base64.b64encode(signature),
    "public_key": base64.b64encode(signing_key.verify_key.encode())
}

# Import
verify_key = Ed25519VerifyKey(base64.b64decode(pack["public_key"]))
pack_without_sig = {k: v for k, v in pack.items() if k not in ["signature", "public_key"]}
pack_json = json.dumps(pack_without_sig, sort_keys=True)
verify_key.verify(pack_json.encode(), base64.b64decode(pack["signature"]))
Ranking Scores
Facts are scored by pluggable ranking algorithms. The default algorithm is Personalized PageRank with Time Decay.
Score Components:
final_score = pagerank_score * decay_factor * confidence
PageRank:

Computed on the entity-relation graph
Damping factor: 0.85
Personalization: Higher weight for recently accessed facts
Convergence: Within 1e-6 tolerance or 100 iterations

Time Decay:
decay_factor = exp(-lambda * days_since_creation)

Lambda: Decay rate (default: ln(2) / 90 days)
Half-life: 90 days

Confidence:

Extractor confidence (0.0 to 1.0)
Higher for structured sources (APIs) vs unstructured (web scraping)

Storage:
sqlCREATE TABLE fact_scores (
    fact_id UUID PRIMARY KEY,
    pagerank_score FLOAT NOT NULL,
    decay_factor FLOAT NOT NULL,
    confidence FLOAT NOT NULL,
    final_score FLOAT GENERATED ALWAYS AS 
        (pagerank_score * decay_factor * confidence) STORED,
    computed_at TIMESTAMP NOT NULL,
    INDEX idx_final_score (project_id, final_score DESC)
);
Database Schema
Core Tables:
sql-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    salt BYTEA NOT NULL,  -- 128 bits for Argon2id
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Entities
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    encrypted_name BYTEA NOT NULL,  -- XChaCha20
    nonce BYTEA NOT NULL,
    tag BYTEA NOT NULL,
    entity_type TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_project_entities (project_id)
);

-- Facts
CREATE TABLE facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    encrypted_content BYTEA NOT NULL,  -- XChaCha20(subject||predicate||object||context)
    nonce BYTEA NOT NULL,
    tag BYTEA NOT NULL,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    embedding vector(768),  -- pgvector
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP DEFAULT NOW(),
    INDEX idx_project_facts (project_id),
    INDEX idx_embedding (embedding vector_cosine_ops)
);

-- Relations
CREATE TABLE relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES entities(id),
    predicate TEXT NOT NULL,
    object_id UUID NOT NULL REFERENCES entities(id),
    confidence FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_subject (subject_id),
    INDEX idx_object (object_id)
);

-- Provenance
CREATE TABLE provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    encrypted_data BYTEA NOT NULL,  -- XChaCha20(JSON)
    nonce BYTEA NOT NULL,
    tag BYTEA NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_fact_provenance (fact_id)
);

-- Audit Events
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    actor TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    prev_hash BYTEA NOT NULL,
    current_hash BYTEA NOT NULL,
    INDEX idx_project_events (project_id, timestamp DESC),
    INDEX idx_prev_hash (prev_hash)
);

-- Fact Scores
CREATE TABLE fact_scores (
    fact_id UUID PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
    pagerank_score FLOAT NOT NULL,
    decay_factor FLOAT NOT NULL,
    confidence FLOAT NOT NULL,
    final_score FLOAT GENERATED ALWAYS AS 
        (pagerank_score * decay_factor * confidence) STORED,
    computed_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_final_score (final_score DESC)
);
Query Patterns
Semantic Search:
sqlSELECT f.id, f.encrypted_content, s.final_score
FROM facts f
JOIN fact_scores s ON f.id = s.fact_id
WHERE f.project_id = :project_id
ORDER BY f.embedding <=> :query_embedding  -- pgvector cosine similarity
LIMIT 20;
Graph Traversal:
sql-- Find all facts related to an entity (2-hop)
WITH RECURSIVE related AS (
    -- Base: Direct relations
    SELECT r.object_id AS entity_id, 1 AS depth
    FROM relations r
    WHERE r.subject_id = :entity_id
    
    UNION
    
    -- Recursive: 2-hop relations
    SELECT r.object_id, rel.depth + 1
    FROM relations r
    JOIN related rel ON r.subject_id = rel.entity_id
    WHERE rel.depth < 2
)
SELECT DISTINCT f.*
FROM facts f
JOIN relations r ON (r.subject_id IN (SELECT entity_id FROM related) 
                  OR r.object_id IN (SELECT entity_id FROM related))
WHERE f.project_id = :project_id;
Top-K Facts:
sqlSELECT f.id, f.encrypted_content, s.final_score
FROM facts f
JOIN fact_scores s ON f.id = s.fact_id
WHERE f.project_id = :project_id
ORDER BY s.final_score DESC
LIMIT :k;
Next Steps

See MCP Servers for the protocol interface to manipulate this data model
See API Reference for REST endpoints
See Security Model for encryption details