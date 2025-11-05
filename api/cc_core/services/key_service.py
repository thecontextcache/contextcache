"""
Key Service - Manages KEK and DEK storage in Redis with session binding
Implements the three-layer encryption model: Passphrase → KEK → DEK → Data
"""
import os
from typing import Optional
import redis
from nacl.secret import SecretBox
from nacl.utils import random as nacl_random
from cc_core.crypto.encryption import Encryptor


class KeyService:
    """
    Manages encryption keys with session-based security
    
    Architecture:
    - KEK (Key Encryption Key): Derived from user's master passphrase
      - Stored in Redis, encrypted with Clerk session secret
      - TTL: 1 hour (renewable)
      - Cleared on logout
    
    - DEK (Data Encryption Key): Per-project random key
      - Encrypted with KEK, stored in database
      - Cached in Redis for 5 minutes after decryption
      - Used to encrypt/decrypt project data
    """
    
    def __init__(self):
        # Connect to Redis
        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            raise ValueError("REDIS_URL not configured")
        
        self.redis = redis.from_url(redis_url, decode_responses=False)
        self.encryptor = Encryptor()
        
        # Session encryption key (MUST be set in production)
        # SECURITY: Use a dedicated 32-byte random key, NOT derived from Clerk secret
        session_key_b64 = os.getenv("SESSION_ENCRYPTION_KEY")

        if session_key_b64:
            # Production: Use dedicated key from environment
            import base64
            try:
                self.session_key = base64.b64decode(session_key_b64)
                if len(self.session_key) != 32:
                    raise ValueError("SESSION_ENCRYPTION_KEY must be exactly 32 bytes (base64 encoded)")
            except Exception as e:
                raise ValueError(f"Invalid SESSION_ENCRYPTION_KEY: {e}")
        else:
            # Development fallback: Derive from Clerk secret (NOT RECOMMENDED for production)
            clerk_secret = os.getenv("CLERK_SECRET_KEY", "")
            if not clerk_secret:
                raise ValueError("Either SESSION_ENCRYPTION_KEY or CLERK_SECRET_KEY must be configured")

            print("⚠️ WARNING: Using CLERK_SECRET_KEY for session encryption (development only)")
            print("   Generate a dedicated key: openssl rand -base64 32")
            print("   Set SESSION_ENCRYPTION_KEY environment variable for production")

            self.session_key = clerk_secret.encode()[:32].ljust(32, b'\x00')
    
    # ========================================================================
    # KEK (Key Encryption Key) Management
    # ========================================================================
    
    async def store_kek(self, session_id: str, kek: bytes, ttl: int = 3600):
        """
        Store KEK in Redis, encrypted with session key
        
        Args:
            session_id: Clerk session ID (from JWT sid claim)
            kek: Key Encryption Key (32 bytes)
            ttl: Time to live in seconds (default 1 hour)
        """
        if len(kek) != 32:
            raise ValueError("KEK must be 32 bytes")
        
        # Encrypt KEK with session key
        box = SecretBox(self.session_key)
        encrypted_kek = box.encrypt(kek)
        
        # Store in Redis with TTL
        redis_key = f"kek:{session_id}"
        self.redis.setex(redis_key, ttl, encrypted_kek)
        
        print(f"✅ KEK stored for session {session_id[:8]}... (expires in {ttl}s)")
    
    async def get_kek(self, session_id: str) -> Optional[bytes]:
        """
        Retrieve and decrypt KEK from Redis
        
        Args:
            session_id: Clerk session ID
            
        Returns:
            KEK bytes or None if not found/expired
        """
        redis_key = f"kek:{session_id}"
        encrypted_kek = self.redis.get(redis_key)
        
        if not encrypted_kek:
            print(f"⚠️ KEK not found for session {session_id[:8]}... (expired or never set)")
            return None
        
        # Decrypt KEK
        box = SecretBox(self.session_key)
        kek = box.decrypt(encrypted_kek)
        
        return kek
    
    async def extend_kek_ttl(self, session_id: str, ttl: int = 3600):
        """
        Extend KEK TTL (renewal on activity)
        
        Args:
            session_id: Clerk session ID
            ttl: New TTL in seconds
        """
        redis_key = f"kek:{session_id}"
        if self.redis.exists(redis_key):
            self.redis.expire(redis_key, ttl)
            print(f"✅ KEK TTL extended for session {session_id[:8]}...")
    
    # ========================================================================
    # DEK (Data Encryption Key) Management
    # ========================================================================
    
    async def store_dek(
        self,
        session_id: str,
        project_id: str,
        dek: bytes,
        ttl: int = 300
    ):
        """
        Cache DEK in Redis (short TTL to reduce decryption overhead)
        
        Args:
            session_id: Clerk session ID
            project_id: Project UUID
            dek: Data Encryption Key (32 bytes)
            ttl: Time to live in seconds (default 5 minutes)
        """
        if len(dek) != 32:
            raise ValueError("DEK must be 32 bytes")
        
        redis_key = f"dek:{session_id}:{project_id}"
        self.redis.setex(redis_key, ttl, dek)
        
        print(f"✅ DEK cached for project {project_id[:8]}... (expires in {ttl}s)")
    
    async def get_dek(self, session_id: str, project_id: str) -> Optional[bytes]:
        """
        Retrieve cached DEK from Redis
        
        Args:
            session_id: Clerk session ID
            project_id: Project UUID
            
        Returns:
            DEK bytes or None if not cached
        """
        redis_key = f"dek:{session_id}:{project_id}"
        dek = self.redis.get(redis_key)
        
        if dek:
            print(f"✅ DEK cache hit for project {project_id[:8]}...")
        else:
            print(f"⚠️ DEK cache miss for project {project_id[:8]}...")
        
        return dek
    
    # ========================================================================
    # Encryption/Decryption Helpers
    # ========================================================================
    
    async def encrypt_dek_with_kek(self, dek: bytes, kek: bytes) -> tuple[bytes, bytes]:
        """
        Encrypt DEK with KEK using AES-256-GCM
        
        Args:
            dek: Data Encryption Key (32 bytes)
            kek: Key Encryption Key (32 bytes)
            
        Returns:
            (encrypted_dek, nonce) tuple
        """
        return self.encryptor.encrypt(dek.hex(), kek)
    
    async def decrypt_dek_with_kek(
        self,
        encrypted_dek: bytes,
        nonce: bytes,
        kek: bytes
    ) -> bytes:
        """
        Decrypt DEK with KEK
        
        Args:
            encrypted_dek: Encrypted DEK from database
            nonce: Nonce used for encryption
            kek: Key Encryption Key
            
        Returns:
            Decrypted DEK (32 bytes)
        """
        decrypted_hex = self.encryptor.decrypt(encrypted_dek, nonce, kek)
        return bytes.fromhex(decrypted_hex)
    
    # ========================================================================
    # Session Management
    # ========================================================================
    
    async def clear_session(self, session_id: str):
        """
        Clear all keys for a session (on logout)
        
        Args:
            session_id: Clerk session ID
        """
        # Delete KEK
        kek_key = f"kek:{session_id}"
        deleted_kek = self.redis.delete(kek_key)
        
        # Delete all DEKs for this session (pattern match)
        pattern = f"dek:{session_id}:*"
        deleted_deks = 0
        
        for key in self.redis.scan_iter(pattern):
            self.redis.delete(key)
            deleted_deks += 1
        
        print(f"✅ Session cleared: {deleted_kek} KEK, {deleted_deks} DEKs deleted")
    
    async def clear_project_deks(self, project_id: str):
        """
        Clear all cached DEKs for a project (useful when project deleted)
        
        Args:
            project_id: Project UUID
        """
        pattern = f"dek:*:{project_id}"
        deleted = 0
        
        for key in self.redis.scan_iter(pattern):
            self.redis.delete(key)
            deleted += 1
        
        print(f"✅ Cleared {deleted} cached DEKs for project {project_id[:8]}...")
    
    # ========================================================================
    # Utilities
    # ========================================================================
    
    def generate_dek(self) -> bytes:
        """Generate random 32-byte DEK for new projects"""
        return nacl_random(32)
    
    def health_check(self) -> bool:
        """Check if Redis connection is healthy"""
        try:
            return self.redis.ping()
        except Exception as e:
            print(f"❌ Redis health check failed: {e}")
            return False


# Singleton instance (imported by endpoints)
_key_service_instance: Optional[KeyService] = None


def get_key_service() -> KeyService:
    """
    Get singleton KeyService instance
    
    Usage in FastAPI:
        key_service = get_key_service()
        await key_service.store_kek(session_id, kek)
    """
    global _key_service_instance
    
    if _key_service_instance is None:
        _key_service_instance = KeyService()
    
    return _key_service_instance

