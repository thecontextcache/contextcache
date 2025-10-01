-- ContextCache Database Schema (PostgreSQL with pgvector)
-- Version: 0.1.0

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    salt BYTEA NOT NULL CHECK (length(salt) = 16),
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    metadata JSONB,
    CONSTRAINT projects_name_not_empty CHECK (trim(name) <> '')
);

CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- Entities table
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    encrypted_name BYTEA NOT NULL,
    nonce BYTEA NOT NULL CHECK (length(nonce) = 24),
    tag BYTEA NOT NULL,
    entity_type TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    CONSTRAINT entities_type_not_empty CHECK (trim(entity_type) <> '')
);

CREATE INDEX idx_entities_project ON entities(project_id);
CREATE INDEX idx_entities_type ON entities(project_id, entity_type);

-- Facts table
CREATE TABLE IF NOT EXISTS facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    encrypted_content BYTEA NOT NULL,
    nonce BYTEA NOT NULL CHECK (length(nonce) = 24),
    tag BYTEA NOT NULL,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    embedding vector(768),
    rank_score FLOAT NOT NULL DEFAULT 0.0 CHECK (rank_score >= 0 AND rank_score <= 1),
    decay_factor FLOAT NOT NULL DEFAULT 1.0 CHECK (decay_factor >= 0 AND decay_factor <= 1),
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    last_accessed TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX idx_facts_project ON facts(project_id);
CREATE INDEX idx_facts_rank ON facts(project_id, rank_score DESC);
CREATE INDEX idx_facts_created ON facts(project_id, created_at DESC);
CREATE INDEX idx_facts_embedding ON facts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Relations table
CREATE TABLE IF NOT EXISTS relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    predicate TEXT NOT NULL,
    object_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    CONSTRAINT relations_predicate_not_empty CHECK (trim(predicate) <> '')
);

CREATE INDEX idx_relations_project ON relations(project_id);
CREATE INDEX idx_relations_subject ON relations(subject_id);
CREATE INDEX idx_relations_object ON relations(object_id);
CREATE INDEX idx_relations_predicate ON relations(project_id, predicate);

-- Provenance table
CREATE TABLE IF NOT EXISTS provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    encrypted_data BYTEA NOT NULL,
    nonce BYTEA NOT NULL CHECK (length(nonce) = 24),
    tag BYTEA NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX idx_provenance_fact ON provenance(fact_id);

-- Audit events table
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    actor TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    prev_hash BYTEA NOT NULL CHECK (length(prev_hash) = 32),
    current_hash BYTEA NOT NULL CHECK (length(current_hash) = 32),
    CONSTRAINT audit_events_type_not_empty CHECK (trim(event_type) <> ''),
    CONSTRAINT audit_events_actor_not_empty CHECK (trim(actor) <> '')
);

CREATE INDEX idx_audit_project ON audit_events(project_id, timestamp DESC);
CREATE INDEX idx_audit_prev_hash ON audit_events(prev_hash);
CREATE UNIQUE INDEX idx_audit_current_hash ON audit_events(current_hash);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'utc');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Comments for documentation
COMMENT ON TABLE projects IS 'User projects with encryption metadata';
COMMENT ON TABLE entities IS 'Knowledge graph nodes (encrypted)';
COMMENT ON TABLE facts IS 'Knowledge quads with embeddings (encrypted)';
COMMENT ON TABLE relations IS 'Typed edges between entities';
COMMENT ON TABLE provenance IS 'Fact origin and extraction history (encrypted)';
COMMENT ON TABLE audit_events IS 'Cryptographic audit chain (BLAKE3)';