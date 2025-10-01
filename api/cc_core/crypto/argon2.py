"""
Argon2id key derivation utilities for passphrase → encryption key
"""
import os
from argon2 import PasswordHasher
from argon2.low_level import hash_secret_raw, Type


class KeyDerivationError(Exception):
    """Raised when key derivation fails."""
    pass


# Argon2id parameters (memory-hard, resistant to GPU/ASIC attacks)
ARGON2_TIME_COST = 3  # iterations
ARGON2_MEMORY_COST = 65536  # 64 MiB
ARGON2_PARALLELISM = 4  # threads
ARGON2_HASH_LENGTH = 32  # 256 bits (32 bytes)
ARGON2_SALT_LENGTH = 16  # 128 bits (16 bytes)


def generate_salt() -> bytes:
    """
    Generate a random 128-bit salt for Argon2id.
    
    Returns:
        16 random bytes
    """
    return os.urandom(ARGON2_SALT_LENGTH)


def derive_key(passphrase: str, salt: bytes) -> bytes:
    """
    Derive a 256-bit encryption key from passphrase using Argon2id.
    
    Args:
        passphrase: User-supplied passphrase (UTF-8 string)
        salt: 128-bit salt (16 bytes)
        
    Returns:
        256-bit derived key (32 bytes)
        
    Raises:
        KeyDerivationError: If key derivation fails
    """
    if len(salt) != ARGON2_SALT_LENGTH:
        raise KeyDerivationError(
            f"Salt must be {ARGON2_SALT_LENGTH} bytes, got {len(salt)}"
        )
    
    if not passphrase:
        raise KeyDerivationError("Passphrase cannot be empty")
    
    try:
        # Convert passphrase to bytes
        passphrase_bytes = passphrase.encode('utf-8')
        
        # Derive key using Argon2id
        key = hash_secret_raw(
            secret=passphrase_bytes,
            salt=salt,
            time_cost=ARGON2_TIME_COST,
            memory_cost=ARGON2_MEMORY_COST,
            parallelism=ARGON2_PARALLELISM,
            hash_len=ARGON2_HASH_LENGTH,
            type=Type.ID  # Argon2id (hybrid)
        )
        
        return key
    except Exception as e:
        raise KeyDerivationError(f"Key derivation failed: {e}") from e


def verify_passphrase(passphrase: str, salt: bytes, expected_key: bytes) -> bool:
    """
    Verify a passphrase by deriving key and comparing.
    
    Args:
        passphrase: Passphrase to verify
        salt: Salt used for original derivation
        expected_key: Previously derived key
        
    Returns:
        True if passphrase is correct
    """
    try:
        derived = derive_key(passphrase, salt)
        # Constant-time comparison to prevent timing attacks
        return derived == expected_key
    except KeyDerivationError:
        return False


def estimate_derivation_time() -> float:
    """
    Estimate key derivation time in seconds (for UX).
    
    Returns:
        Approximate time in seconds
    """
    # On modern hardware (M4 Pro, i9, etc.):
    # 64 MiB memory cost + 3 iterations ≈ 0.3-0.5 seconds
    # This is intentionally slow to resist brute-force attacks
    return 0.4  # Conservative estimate


def get_parameters() -> dict:
    """
    Get current Argon2id parameters for display/documentation.
    
    Returns:
        Dict with time_cost, memory_cost, parallelism
    """
    return {
        "time_cost": ARGON2_TIME_COST,
        "memory_cost_kb": ARGON2_MEMORY_COST,
        "memory_cost_mb": ARGON2_MEMORY_COST / 1024,
        "parallelism": ARGON2_PARALLELISM,
        "hash_length": ARGON2_HASH_LENGTH,
        "salt_length": ARGON2_SALT_LENGTH,
    }