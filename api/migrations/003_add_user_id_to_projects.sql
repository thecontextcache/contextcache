-- Migration: Add user_id to projects table
-- This associates projects with users for multi-tenant support

-- Add user_id column (nullable first to allow existing data)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add foreign key constraint
ALTER TABLE projects 
ADD CONSTRAINT fk_projects_user_id 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Create index for faster user project lookups
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Note: If you have existing projects, you'll need to assign them to a user:
-- UPDATE projects SET user_id = '<some-user-id>' WHERE user_id IS NULL;

-- After assigning all projects to users, make the column NOT NULL:
-- ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;

