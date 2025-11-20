# 🗄️ Database Setup Guide

## Neon PostgreSQL Configuration

Your ContextCache instance uses **Neon PostgreSQL** with pgvector extension for storing documents, embeddings, and user data.

---

## 📋 **Required Migrations**

You have **2 migration files** that need to be run in your Neon database:

### **1. Multi-Tenant Authentication** (`migrations/001_add_multi_tenant_auth.sql`)
- Creates `users` table for Clerk authentication
- Creates `projects` table with user isolation
- Adds foreign key constraints for multi-tenancy

### **2. Content Encryption** (`migrations/002_add_content_encryption.sql`)
- Adds encryption fields to store encrypted DEKs
- Adds nonce fields for XChaCha20-Poly1305
- Updates document chunks table

---

## 🚀 **How to Run Migrations**

### **Option 1: Neon SQL Editor (Recommended)**

1. **Log into Neon Console**: https://console.neon.tech
2. **Select your project**: `contextcache` (or your project name)
3. **Go to SQL Editor**
4. **Run Migration 001**:
   ```sql
   -- Copy and paste contents of migrations/001_add_multi_tenant_auth.sql
   -- Then click "Run"
   ```

5. **Run Migration 002**:
   ```sql
   -- Copy and paste contents of migrations/002_add_content_encryption.sql
   -- Then click "Run"
   ```

### **Option 2: Using psql**

```bash
# Connect to your Neon database
psql "your-neon-connection-string-here"

# Run migrations
\i api/migrations/001_add_multi_tenant_auth.sql
\i api/migrations/002_add_content_encryption.sql
```

### **Option 3: Using Python Script**

```bash
cd api
python -c "
from cc_core.storage.database import engine
import asyncio
from sqlalchemy import text

async def run_migrations():
    async with engine.begin() as conn:
        # Migration 001
        with open('migrations/001_add_multi_tenant_auth.sql') as f:
            await conn.execute(text(f.read()))
        
        # Migration 002
        with open('migrations/002_add_content_encryption.sql') as f:
            await conn.execute(text(f.read()))
    print('✅ Migrations complete!')

asyncio.run(run_migrations())
"
```

---

## ✅ **Verify Migrations**

After running migrations, verify they were successful:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Should include:
-- audit_events
-- document_chunks
-- documents
-- projects
-- user_settings (if migration 3 exists)
-- users

-- Check users table structure
\d users

-- Check projects table has user_id foreign key
\d projects

-- Check encryption fields exist
\d document_chunks
```

---

## 🔧 **Database Schema Overview**

### **users**
- `id` (UUID, primary key)
- `clerk_user_id` (unique)
- `email`
- `kek_salt` (for master key derivation)
- `created_at`, `updated_at`

### **projects**
- `id` (UUID, primary key)
- `user_id` (foreign key → users)
- `name`
- `encrypted_dek` (project data encryption key, encrypted with user's KEK)
- `dek_nonce`
- `created_at`, `updated_at`

### **documents**
- `id` (UUID, primary key)
- `project_id` (foreign key → projects)
- `source_type` (file, url, text)
- `source_url`
- `content_hash`
- `status` (queued, processing, completed, failed)
- `fact_count`
- `created_at`, `processed_at`

### **document_chunks**
- `id` (UUID, primary key)
- `document_id` (foreign key → documents)
- `chunk_index`
- `text` (plaintext for search)
- `encrypted_text` (encrypted with project DEK)
- `nonce` (for decryption)
- `embedding` (pgvector, for semantic search)
- `start_offset`, `end_offset`
- `created_at`

### **audit_events**
- `id` (UUID, primary key)
- `project_id` (foreign key → projects)
- `event_type`
- `event_data` (JSON)
- `actor` (user who performed action)
- `timestamp`
- `prev_hash` (blockchain-style linking)
- `current_hash`

---

## 🔐 **Encryption Flow**

```
User Master Key (20+ chars)
         ↓
   Argon2id + Salt
         ↓
      KEK (Key Encryption Key)
         ↓ (encrypts)
      DEK (Data Encryption Key, per project)
         ↓ (encrypts)
   Document Content
```

**Why this matters for the database:**
- KEK Salt is stored in `users.kek_salt`
- Encrypted DEK is stored in `projects.encrypted_dek`
- Encrypted content is stored in `document_chunks.encrypted_text`
- The database **never sees** unencrypted KEK or DEK
- Only the user (with master key) can decrypt

---

## 🛠️ **Troubleshooting**

### **Issue: "relation does not exist"**
```
ERROR: relation "users" does not exist
```
**Solution**: You need to run migration 001

### **Issue: "column does not exist"**
```
ERROR: column "encrypted_dek" does not exist
```
**Solution**: You need to run migration 002

### **Issue: "pgvector extension not found"**
```
ERROR: type "vector" does not exist
```
**Solution**: Enable pgvector in Neon:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### **Issue: "duplicate key value violates unique constraint"**
```
ERROR: duplicate key value violates unique constraint "users_clerk_user_id_key"
```
**Solution**: User already exists. This is normal on re-run. Safe to ignore.

---

## 📊 **Check Current Database Status**

```sql
-- Check if migrations have been run
SELECT 
    COUNT(*) as user_count,
    (SELECT COUNT(*) FROM projects) as project_count,
    (SELECT COUNT(*) FROM documents) as document_count,
    (SELECT COUNT(*) FROM document_chunks) as chunk_count
FROM users;

-- Check encryption is working
SELECT 
    id,
    name,
    CASE 
        WHEN encrypted_dek IS NOT NULL THEN '✓ Encrypted'
        ELSE '✗ Not Encrypted'
    END as encryption_status
FROM projects
LIMIT 5;
```

---

## 🔄 **Rollback (if needed)**

If something goes wrong, you can rollback:

```sql
-- WARNING: This will delete ALL data!
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS document_chunks CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Then re-run migrations
```

---

## 📝 **Connection String Format**

Your Neon connection string should look like:

```
postgresql://username:password@ep-xxxxx.us-east-2.aws.neon.tech/contextcache?sslmode=require
```

Set this as your `DATABASE_URL` environment variable:
```bash
# Backend (.env)
DATABASE_URL="postgresql://..."

# Or in Cloud Run
gcloud run services update contextcache-api \
  --set-env-vars DATABASE_URL="postgresql://..."
```

---

## ✅ **Checklist**

- [ ] Neon project created
- [ ] pgvector extension enabled
- [ ] Migration 001 executed
- [ ] Migration 002 executed
- [ ] Verification queries successful
- [ ] `DATABASE_URL` set in backend environment
- [ ] Backend can connect (check `/health` endpoint)

---

**Once migrations are complete, your database is ready!** 🎉

The backend will automatically create users and projects as people sign up and use the system.

