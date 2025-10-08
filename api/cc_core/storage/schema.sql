-- ============================================================================
-- ContextCache Database Schema
-- Postgres 16 with pgvector extension
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- PROJECTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    salt BYTEA NOT NULL,  -- 128 bits for Argon2id
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- ============================================================================
-- ENTITIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    encrypted_name BYTEA NOT NULL,  -- XChaCha20-Poly1305
    nonce BYTEA NOT NULL,           -- 192 bits
    tag BYTEA NOT NULL,             -- 128 bits (MAC)
    entity_type TEXT NOT NULL,      -- person, organization, concept, location, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_entities_project ON entities(project_id);
CREATE INDEX idx_entities_type ON entities(project_id, entity_type);

-- ============================================================================
-- FACTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS facts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    encrypted_content BYTEA NOT NULL,  -- XChaCha20(subject||predicate||object||context)
    nonce BYTEA NOT NULL,
    tag BYTEA NOT NULL,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    embedding vector(768),  -- OpenAI text-embedding-3-small dimension
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_facts_project ON facts(project_id);
CREATE INDEX idx_facts_created_at ON facts(project_id, created_at DESC);
CREATE INDEX idx_facts_embedding ON facts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_facts_confidence ON facts(project_id, confidence DESC);

-- ============================================================================
-- RELATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    predicate TEXT NOT NULL,
    object_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_relations_project ON relations(project_id);
CREATE INDEX idx_relations_subject ON relations(subject_id);
CREATE INDEX idx_relations_object ON relations(object_id);
CREATE INDEX idx_relations_predicate ON relations(project_id, predicate);

-- ============================================================================
-- PROVENANCE
-- ============================================================================
CREATE TABLE IF NOT EXISTS provenance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    encrypted_data BYTEA NOT NULL,  -- XChaCha20(JSON with source, extractor, etc.)
    nonce BYTEA NOT NULL,
    tag BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_provenance_fact ON provenance(fact_id);

-- ============================================================================
-- AUDIT EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,  -- fact_added, fact_updated, ranking_computed, etc.
    event_data JSONB NOT NULL,
    actor TEXT NOT NULL,  -- user, system, analyzer
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    prev_hash BYTEA NOT NULL,      -- BLAKE3 hash of previous event
    current_hash BYTEA NOT NULL    -- BLAKE3(prev_hash || event_data)
);

CREATE INDEX idx_audit_project_time ON audit_events(project_id, timestamp DESC);
CREATE INDEX idx_audit_prev_hash ON audit_events(prev_hash);
CREATE INDEX idx_audit_event_type ON audit_events(project_id, event_type);

-- ============================================================================
-- FACT SCORES
-- ============================================================================
CREATE TABLE IF NOT EXISTS fact_scores (
    fact_id UUID PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
    pagerank_score FLOAT NOT NULL DEFAULT 0.0,
    decay_factor FLOAT NOT NULL DEFAULT 1.0,
    confidence FLOAT NOT NULL DEFAULT 0.0,
    final_score FLOAT GENERATED ALWAYS AS (pagerank_score * decay_factor * confidence) STORED,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_fact_scores_final ON fact_scores(final_score DESC);
CREATE INDEX idx_fact_scores_computed ON fact_scores(computed_at DESC);

-- ============================================================================
-- DOCUMENTS (for tracking imported documents)
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    encrypted_title BYTEA,
    nonce BYTEA,
    tag BYTEA,
    source_type TEXT NOT NULL,  -- url, file, user_input
    source_url TEXT,
    content_hash TEXT NOT NULL,  -- SHA256 for deduplication
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    fact_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_status ON documents(project_id, status);
CREATE INDEX idx_documents_hash ON documents(project_id, content_hash);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for projects
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for entities
CREATE TRIGGER update_entities_updated_at BEFORE UPDATE ON entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- No initial data needed for zero-knowledge system