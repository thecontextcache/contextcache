-- ============================================================================
-- USAGE TRACKING & ADMIN MIGRATION
-- Run this in Neon Console BEFORE deploying backend
-- ============================================================================

-- 1. Add admin role to users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE NOT NULL;

-- 2. Create usage_logs table (tamper-proof)
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Action details
    action_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    quantity INTEGER DEFAULT 1,
    
    -- Context
    project_id UUID,
    metadata TEXT,
    
    -- Tampering prevention (blockchain-style)
    record_hash VARCHAR(64) NOT NULL,
    previous_hash VARCHAR(64),
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for usage_logs
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_type ON usage_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);

-- 3. Create user_quotas table
CREATE TABLE IF NOT EXISTS user_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- User tier
    tier VARCHAR(20) DEFAULT 'free' NOT NULL,
    
    -- Current usage
    documents_used INTEGER DEFAULT 0 NOT NULL,
    facts_used INTEGER DEFAULT 0 NOT NULL,
    queries_used INTEGER DEFAULT 0 NOT NULL,
    api_calls_used INTEGER DEFAULT 0 NOT NULL,
    
    -- Limits (based on tier)
    documents_limit INTEGER DEFAULT 100 NOT NULL,
    facts_limit INTEGER DEFAULT 10000 NOT NULL,
    queries_limit INTEGER DEFAULT 1000 NOT NULL,
    api_calls_limit INTEGER DEFAULT 0 NOT NULL,
    
    -- Billing period
    period_start TIMESTAMP DEFAULT NOW() NOT NULL,
    period_end TIMESTAMP,
    
    -- Lock status
    locked BOOLEAN DEFAULT FALSE NOT NULL,
    lock_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for user_quotas
CREATE INDEX IF NOT EXISTS idx_user_quotas_user_id ON user_quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quotas_tier ON user_quotas(tier);

-- 4. Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_quotas_updated_at ON user_quotas;
CREATE TRIGGER update_user_quotas_updated_at
    BEFORE UPDATE ON user_quotas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Set YOUR email as admin (REPLACE WITH YOUR CLERK USER EMAIL!)
-- Find your clerk_user_id first, then run:
-- UPDATE users SET is_admin = TRUE WHERE email = 'dn@thecontextcache.com';

-- 6. Create default quotas for existing users
INSERT INTO user_quotas (user_id, tier, documents_limit, facts_limit, queries_limit, api_calls_limit)
SELECT 
    id,
    'free',
    100,
    10000,
    1000,
    0
FROM users
WHERE NOT EXISTS (SELECT 1 FROM user_quotas WHERE user_quotas.user_id = users.id);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('usage_logs', 'user_quotas');

-- Check admin users
SELECT email, is_admin, created_at 
FROM users 
WHERE is_admin = TRUE;

-- Check quotas
SELECT u.email, uq.tier, uq.documents_used, uq.documents_limit, uq.locked
FROM user_quotas uq
JOIN users u ON u.id = uq.user_id;

-- ============================================================================
-- DONE!
-- ============================================================================

