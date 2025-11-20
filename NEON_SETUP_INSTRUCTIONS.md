# Neon Database Setup Instructions

This guide will help you set up the ContextCache database in Neon step-by-step.

## Important Notes

⚠️ **Do NOT paste the entire `NEON_COMPLETE_SETUP.sql` file at once into Neon SQL Editor**
- Neon has a query size limit
- Run the migrations in order as shown below

## Prerequisites

1. Log in to your Neon console: https://console.neon.tech
2. Select your ContextCache database
3. Open the SQL Editor

---

## Step 1: Enable Extensions

Copy and paste this into the SQL Editor, then click **Run**:

```sql
-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For text search
```

---

## Step 2: Run Migration 001 (Multi-tenant Auth)

Copy the contents of `api/migrations/001_add_multi_tenant_auth.sql` and paste into SQL Editor, then click **Run**.

**What this creates:**
- `users` table (Clerk authentication)
- `projects` table (multi-tenant)
- `entities` table (knowledge graph)
- `facts` table (knowledge graph)
- `relations` table (knowledge graph)
- `provenance` table (source tracking)
- `audit_events` table (blockchain-style audit log)
- `fact_scores` table (ranking system)

---

## Step 3: Run Migration 002 (Content Encryption)

Copy the contents of `api/migrations/002_add_content_encryption.sql` and paste into SQL Editor, then click **Run**.

**What this adds:**
- `documents` table (uploaded files/URLs)
- `document_chunks` table (embeddings for semantic search)
- Encryption columns for end-to-end encryption
- Vector indexes for similarity search

---

## Step 4: Add User Settings Table (New)

Copy and paste this into the SQL Editor, then click **Run**:

```sql
-- USER SETTINGS TABLE (for API keys, preferences)
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_api_keys JSONB,  -- Encrypted API keys for AI providers
    api_keys_nonce TEXT,  -- Nonce for API keys encryption
    default_embedding_provider VARCHAR(50) DEFAULT 'huggingface' NOT NULL,
    default_model_name VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

COMMENT ON TABLE user_settings IS 'User preferences and encrypted API keys';
COMMENT ON COLUMN user_settings.encrypted_api_keys IS 'Encrypted API keys as JSON';
```

---

## Step 5: Verify Tables

Run this to verify all tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**You should see:**
- audit_events
- document_chunks
- documents
- entities
- fact_scores
- facts
- projects
- provenance
- relations
- user_settings
- users

---

## Step 6: Verify Extensions

Run this to verify extensions are enabled:

```sql
SELECT extname, extversion 
FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'vector', 'pg_trgm');
```

**You should see:**
- uuid-ossp
- vector
- pg_trgm

---

## Step 7: Check Indexes

Run this to verify indexes are created:

```sql
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;
```

---

## Troubleshooting

### Error: "extension vector does not exist"
- Contact Neon support to enable `pgvector` extension for your database
- Or use Neon's "Enable extensions" UI in the dashboard

### Error: "relation already exists"
- This is fine - the migrations use `IF NOT EXISTS`
- The migration will skip existing tables

### Error: "syntax error" or query truncated
- Don't paste the entire `NEON_COMPLETE_SETUP.sql` at once
- Follow the steps above (run migrations in order)

---

## Next Steps

After completing the setup:

1. ✅ All tables created
2. ✅ All indexes created
3. ✅ All extensions enabled
4. 🚀 Your backend API is ready to connect

Update your backend `.env` file with the Neon connection string:

```bash
DATABASE_URL=postgresql://user:password@your-neon-host.neon.tech/contextcache?sslmode=require
```

Then restart your backend API.

