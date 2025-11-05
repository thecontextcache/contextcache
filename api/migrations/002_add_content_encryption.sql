-- Migration: Add content encryption support
-- Purpose: Add encryption fields to document_chunks for E2E encryption
-- Date: 2025-01-20

-- ============================================================================
-- 1. ADD ENCRYPTION FIELDS TO DOCUMENT_CHUNKS
-- ============================================================================

-- Add encrypted_text column (base64-encoded ciphertext)
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS encrypted_text TEXT;

-- Add nonce column (hex-encoded nonce for XChaCha20-Poly1305)
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS nonce VARCHAR(48);

COMMENT ON COLUMN document_chunks.encrypted_text IS 'Encrypted chunk text (base64, XChaCha20-Poly1305)';
COMMENT ON COLUMN document_chunks.nonce IS 'Encryption nonce (hex, 24 bytes for XChaCha20)';

-- ============================================================================
-- 2. MIGRATION STRATEGY
-- ============================================================================

-- NOTE: This migration allows both encrypted and plaintext data to coexist
-- Migration strategy:
-- 1. New chunks are always encrypted (encrypted_text + nonce populated)
-- 2. Old chunks remain in plaintext (text column populated)
-- 3. Query layer checks encrypted_text first, falls back to text
-- 4. Background job can encrypt old chunks gradually

-- ============================================================================
-- 3. VERIFICATION QUERIES
-- ============================================================================

-- Check column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'document_chunks'
  AND column_name IN ('encrypted_text', 'nonce');

-- Count encrypted vs plaintext chunks
SELECT
    COUNT(*) as total_chunks,
    COUNT(encrypted_text) as encrypted_chunks,
    COUNT(text) - COUNT(encrypted_text) as plaintext_chunks
FROM document_chunks;
