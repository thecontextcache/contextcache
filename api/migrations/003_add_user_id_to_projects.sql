-- Migration: Add user_id and encryption columns to projects table
-- This associates projects with users for multi-tenant support
-- and adds encrypted DEK storage for master key encryption

-- Add user_id column (nullable first to allow existing data)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add encrypted DEK columns for master key encryption
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS encrypted_dek BYTEA;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS dek_nonce BYTEA;

-- Make salt nullable (legacy column, kept for compatibility)
ALTER TABLE projects 
ALTER COLUMN salt DROP NOT NULL;

-- Add foreign key constraint
ALTER TABLE projects 
ADD CONSTRAINT fk_projects_user_id 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Create index for faster user project lookups
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Add comments
COMMENT ON COLUMN projects.user_id IS 'Owner of this project (multi-tenant isolation)';
COMMENT ON COLUMN projects.encrypted_dek IS 'Data Encryption Key (DEK) encrypted with users KEK';
COMMENT ON COLUMN projects.dek_nonce IS 'Nonce for DEK encryption';

-- Note: If you have existing projects, you'll need to assign them to a user:
-- UPDATE projects SET user_id = '<some-user-id>' WHERE user_id IS NULL;

-- After assigning all projects to users, make the column NOT NULL:
-- ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;

