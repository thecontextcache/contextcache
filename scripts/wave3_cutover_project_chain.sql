-- Wave 3C: cut over projects/memories/raw_captures/tags chain from *_bigint
-- shadow columns to canonical column names.

BEGIN;

-- 0) Drop child FKs first
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_project_id_fkey;
ALTER TABLE memories DROP CONSTRAINT IF EXISTS fk_memories_project_id_bigint;

ALTER TABLE inbox_items DROP CONSTRAINT IF EXISTS inbox_items_project_id_fkey;
ALTER TABLE inbox_items DROP CONSTRAINT IF EXISTS fk_inbox_items_project_id_bigint;

ALTER TABLE raw_captures DROP CONSTRAINT IF EXISTS raw_captures_project_id_fkey;
ALTER TABLE raw_captures DROP CONSTRAINT IF EXISTS fk_raw_captures_project_id_bigint;

ALTER TABLE recall_logs DROP CONSTRAINT IF EXISTS recall_logs_project_id_fkey;
ALTER TABLE recall_logs DROP CONSTRAINT IF EXISTS fk_recall_logs_project_id_bigint;

ALTER TABLE recall_timings DROP CONSTRAINT IF EXISTS recall_timings_project_id_fkey;
ALTER TABLE recall_timings DROP CONSTRAINT IF EXISTS fk_recall_timings_project_id_bigint;

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_project_id_fkey;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS fk_tags_project_id_bigint;

ALTER TABLE inbox_items DROP CONSTRAINT IF EXISTS inbox_items_raw_capture_id_fkey;
ALTER TABLE inbox_items DROP CONSTRAINT IF EXISTS fk_inbox_items_raw_capture_id_bigint;

ALTER TABLE inbox_items DROP CONSTRAINT IF EXISTS inbox_items_promoted_memory_id_fkey;
ALTER TABLE inbox_items DROP CONSTRAINT IF EXISTS fk_inbox_items_promoted_memory_id_bigint;

ALTER TABLE memory_embeddings DROP CONSTRAINT IF EXISTS memory_embeddings_memory_id_fkey;
ALTER TABLE memory_embeddings DROP CONSTRAINT IF EXISTS fk_memory_embeddings_memory_id_bigint;

ALTER TABLE memory_tags DROP CONSTRAINT IF EXISTS memory_tags_memory_id_fkey;
ALTER TABLE memory_tags DROP CONSTRAINT IF EXISTS fk_memory_tags_memory_id_bigint;
ALTER TABLE memory_tags DROP CONSTRAINT IF EXISTS memory_tags_tag_id_fkey;
ALTER TABLE memory_tags DROP CONSTRAINT IF EXISTS fk_memory_tags_tag_id_bigint;

-- 1) Drop constraints/indexes tied to old int4 column names
ALTER TABLE tags DROP CONSTRAINT IF EXISTS uq_tags_project_name;
ALTER TABLE memory_tags DROP CONSTRAINT IF EXISTS uq_memory_tags;
ALTER TABLE memory_embeddings DROP CONSTRAINT IF EXISTS memory_embeddings_memory_id_key;

DROP INDEX IF EXISTS ix_memories_project_hilbert_index;
DROP INDEX IF EXISTS ix_inbox_items_project_status;
DROP INDEX IF EXISTS ix_recall_logs_project_created;

-- 2) Rotate parent PKs
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_pkey;
ALTER TABLE projects ALTER COLUMN id_bigint SET NOT NULL;
ALTER TABLE projects ALTER COLUMN id_bigint SET DEFAULT nextval('projects_id_seq'::regclass);
ALTER TABLE projects RENAME COLUMN id TO id_int4;
ALTER TABLE projects RENAME COLUMN id_bigint TO id;
ALTER TABLE projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
DROP INDEX IF EXISTS uq_projects_id_bigint;
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_id ON projects(id);

ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_pkey;
ALTER TABLE memories ALTER COLUMN id_bigint SET NOT NULL;
ALTER TABLE memories ALTER COLUMN id_bigint SET DEFAULT nextval('memories_id_seq'::regclass);
ALTER TABLE memories RENAME COLUMN id TO id_int4;
ALTER TABLE memories RENAME COLUMN id_bigint TO id;
ALTER TABLE memories ADD CONSTRAINT memories_pkey PRIMARY KEY (id);
DROP INDEX IF EXISTS uq_memories_id_bigint;
CREATE UNIQUE INDEX IF NOT EXISTS uq_memories_id ON memories(id);

ALTER TABLE raw_captures DROP CONSTRAINT IF EXISTS raw_captures_pkey;
ALTER TABLE raw_captures ALTER COLUMN id_bigint SET NOT NULL;
ALTER TABLE raw_captures ALTER COLUMN id_bigint SET DEFAULT nextval('raw_captures_id_seq'::regclass);
ALTER TABLE raw_captures RENAME COLUMN id TO id_int4;
ALTER TABLE raw_captures RENAME COLUMN id_bigint TO id;
ALTER TABLE raw_captures ADD CONSTRAINT raw_captures_pkey PRIMARY KEY (id);
DROP INDEX IF EXISTS uq_raw_captures_id_bigint;
CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_captures_id ON raw_captures(id);

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_pkey;
ALTER TABLE tags ALTER COLUMN id_bigint SET NOT NULL;
ALTER TABLE tags ALTER COLUMN id_bigint SET DEFAULT nextval('tags_id_seq'::regclass);
ALTER TABLE tags RENAME COLUMN id TO id_int4;
ALTER TABLE tags RENAME COLUMN id_bigint TO id;
ALTER TABLE tags ADD CONSTRAINT tags_pkey PRIMARY KEY (id);
DROP INDEX IF EXISTS uq_tags_id_bigint;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_id ON tags(id);

-- 3) Swap child FK columns to canonical names
ALTER TABLE memories RENAME COLUMN project_id TO project_id_int4;
ALTER TABLE memories RENAME COLUMN project_id_bigint TO project_id;

ALTER TABLE inbox_items RENAME COLUMN project_id TO project_id_int4;
ALTER TABLE inbox_items RENAME COLUMN project_id_bigint TO project_id;

ALTER TABLE raw_captures RENAME COLUMN project_id TO project_id_int4;
ALTER TABLE raw_captures RENAME COLUMN project_id_bigint TO project_id;

ALTER TABLE recall_logs RENAME COLUMN project_id TO project_id_int4;
ALTER TABLE recall_logs RENAME COLUMN project_id_bigint TO project_id;

ALTER TABLE recall_timings RENAME COLUMN project_id TO project_id_int4;
ALTER TABLE recall_timings RENAME COLUMN project_id_bigint TO project_id;

ALTER TABLE tags RENAME COLUMN project_id TO project_id_int4;
ALTER TABLE tags RENAME COLUMN project_id_bigint TO project_id;

ALTER TABLE inbox_items RENAME COLUMN raw_capture_id TO raw_capture_id_int4;
ALTER TABLE inbox_items RENAME COLUMN raw_capture_id_bigint TO raw_capture_id;

ALTER TABLE inbox_items RENAME COLUMN promoted_memory_id TO promoted_memory_id_int4;
ALTER TABLE inbox_items RENAME COLUMN promoted_memory_id_bigint TO promoted_memory_id;

ALTER TABLE memory_embeddings RENAME COLUMN memory_id TO memory_id_int4;
ALTER TABLE memory_embeddings RENAME COLUMN memory_id_bigint TO memory_id;

ALTER TABLE memory_tags RENAME COLUMN memory_id TO memory_id_int4;
ALTER TABLE memory_tags RENAME COLUMN memory_id_bigint TO memory_id;
ALTER TABLE memory_tags RENAME COLUMN tag_id TO tag_id_int4;
ALTER TABLE memory_tags RENAME COLUMN tag_id_bigint TO tag_id;

-- 4) Reconnect FKs on canonical bigint columns
ALTER TABLE memories ADD CONSTRAINT memories_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE inbox_items ADD CONSTRAINT inbox_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE raw_captures ADD CONSTRAINT raw_captures_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE recall_logs ADD CONSTRAINT recall_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE recall_timings ADD CONSTRAINT recall_timings_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE tags ADD CONSTRAINT tags_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE inbox_items ADD CONSTRAINT inbox_items_raw_capture_id_fkey FOREIGN KEY (raw_capture_id) REFERENCES raw_captures(id) ON DELETE SET NULL;
ALTER TABLE inbox_items ADD CONSTRAINT inbox_items_promoted_memory_id_fkey FOREIGN KEY (promoted_memory_id) REFERENCES memories(id) ON DELETE SET NULL;
ALTER TABLE memory_embeddings ADD CONSTRAINT memory_embeddings_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE;
ALTER TABLE memory_tags ADD CONSTRAINT memory_tags_memory_id_fkey FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE;
ALTER TABLE memory_tags ADD CONSTRAINT memory_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

-- 5) Recreate unique constraints/indexes on canonical columns
ALTER TABLE tags ADD CONSTRAINT uq_tags_project_name UNIQUE (project_id, name);
ALTER TABLE memory_tags ADD CONSTRAINT uq_memory_tags UNIQUE (memory_id, tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_embeddings_memory_id ON memory_embeddings(memory_id);

CREATE INDEX IF NOT EXISTS ix_memories_project_hilbert_index ON memories(project_id, hilbert_index);
CREATE INDEX IF NOT EXISTS ix_inbox_items_project_status ON inbox_items(project_id, status);
CREATE INDEX IF NOT EXISTS ix_recall_logs_project_created ON recall_logs(project_id, created_at);

DROP INDEX IF EXISTS ix_memories_project_id_bigint;
DROP INDEX IF EXISTS ix_inbox_items_project_id_bigint;
DROP INDEX IF EXISTS ix_raw_captures_project_id_bigint;
DROP INDEX IF EXISTS ix_recall_logs_project_id_bigint;
DROP INDEX IF EXISTS ix_recall_timings_project_id_bigint;
DROP INDEX IF EXISTS ix_tags_project_id_bigint;
DROP INDEX IF EXISTS ix_inbox_items_raw_capture_id_bigint;
DROP INDEX IF EXISTS ix_inbox_items_promoted_memory_id_bigint;
DROP INDEX IF EXISTS ix_memory_embeddings_memory_id_bigint;
DROP INDEX IF EXISTS ix_memory_tags_memory_id_bigint;
DROP INDEX IF EXISTS ix_memory_tags_tag_id_bigint;

COMMIT;
