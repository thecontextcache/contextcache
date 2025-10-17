-- Migration: Add multi-tenant authentication support
-- Purpose: Add users table and update projects for user isolation
-- Date: 2025-01-17

-- ============================================================================
-- 1. CREATE USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    kek_salt BYTEA NOT NULL, -- Salt for deriving KEK from master passphrase
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast Clerk user lookups
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);

COMMENT ON TABLE users IS 'User accounts linked to Clerk authentication';
COMMENT ON COLUMN users.clerk_user_id IS 'Clerk user ID from JWT sub claim';
COMMENT ON COLUMN users.kek_salt IS 'Salt for deriving Key Encryption Key (KEK) from master passphrase';

-- ============================================================================
-- 2. UPDATE PROJECTS TABLE (Multi-Tenant)
-- ============================================================================

-- Add user_id foreign key
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Add encrypted DEK columns
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS encrypted_dek BYTEA;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS dek_nonce BYTEA;

-- Create index for user-based queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

COMMENT ON COLUMN projects.user_id IS 'Owner of this project (multi-tenant isolation)';
COMMENT ON COLUMN projects.encrypted_dek IS 'Data Encryption Key (DEK) encrypted with users KEK';
COMMENT ON COLUMN projects.dek_nonce IS 'Nonce for DEK encryption (AES-GCM)';

-- ============================================================================
-- 3. UPDATE DOCUMENTS TABLE (Multi-Tenant)
-- ============================================================================

-- Add user_id for extra isolation (optional but recommended)
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

COMMENT ON COLUMN documents.user_id IS 'Owner of this document (for extra isolation)';

-- ============================================================================
-- 4. MIGRATION CLEANUP (Optional)
-- ============================================================================

-- Remove old salt column from projects (if exists)
-- Uncomment after verifying migration works
-- ALTER TABLE projects DROP COLUMN IF EXISTS salt;

-- ============================================================================
-- 5. DATA MIGRATION (For Existing Projects)
-- ============================================================================

-- If you have existing projects, you need to:
-- 1. Create a "migration" or "anonymous" user
-- 2. Assign all existing projects to this user
-- 3. Generate encrypted_dek for each project

-- Example (run manually, don't automate without testing):
/*
-- Create migration user
INSERT INTO users (clerk_user_id, email, kek_salt)
VALUES ('migration_user', 'migration@example.com', '\x0000000000000000')
ON CONFLICT (clerk_user_id) DO NOTHING;

-- Assign existing projects to migration user
UPDATE projects 
SET user_id = (SELECT id FROM users WHERE clerk_user_id = 'migration_user')
WHERE user_id IS NULL;
*/

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify tables exist
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('users', 'projects', 'documents')
ORDER BY table_name, ordinal_position;

-- Check foreign keys
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('projects', 'documents');

