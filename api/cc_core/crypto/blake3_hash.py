"""
BLAKE3 hashing utilities for audit chain
"""
import json
from typing import Any

import blake3


class HashError(Exception):
    """Raised when hashing fails."""
    pass


HASH_LENGTH = 32  # 256 bits (32 bytes)
GENESIS_HASH = b'\x00' * HASH_LENGTH  # All zeros for first event


def hash_data(data: bytes) -> bytes:
    """
    Compute BLAKE3 hash of data.
    
    Args:
        data: Data to hash
        
    Returns:
        32-byte hash
    """
    hasher = blake3.blake3(data)
    return hasher.digest()


def hash_audit_event(
    prev_hash: bytes,
    event_type: str,
    event_data: dict,
    actor: str,
    timestamp: str
) -> bytes:
    """
    Compute hash of audit event for chain linking.
    
    Args:
        prev_hash: Hash of previous event (32 bytes)
        event_type: Event type string
        event_data: Event payload (JSON-serializable)
        actor: Actor identifier
        timestamp: ISO 8601 timestamp string
        
    Returns:
        32-byte BLAKE3 hash
        
    Raises:
        HashError: If hashing fails
    """
    if len(prev_hash) != HASH_LENGTH:
        raise HashError(f"prev_hash must be {HASH_LENGTH} bytes, got {len(prev_hash)}")
    
    try:
        # Canonical JSON serialization (sorted keys for determinism)
        event_json = json.dumps(event_data, sort_keys=True, separators=(',', ':'))
        
        # Concatenate all fields in deterministic order
        hasher = blake3.blake3()
        hasher.update(prev_hash)
        hasher.update(event_type.encode('utf-8'))
        hasher.update(event_json.encode('utf-8'))
        hasher.update(actor.encode('utf-8'))
        hasher.update(timestamp.encode('utf-8'))
        
        return hasher.digest()
    except Exception as e:
        raise HashError(f"Event hashing failed: {e}") from e


def verify_chain_link(
    prev_hash: bytes,
    current_hash: bytes,
    event_type: str,
    event_data: dict,
    actor: str,
    timestamp: str
) -> bool:
    """
    Verify that current_hash correctly follows from prev_hash.
    
    Args:
        prev_hash: Previous event hash
        current_hash: Current event hash (to verify)
        event_type: Event type
        event_data: Event payload
        actor: Actor identifier
        timestamp: ISO timestamp
        
    Returns:
        True if hash is valid
    """
    try:
        computed_hash = hash_audit_event(
            prev_hash, event_type, event_data, actor, timestamp
        )
        return computed_hash == current_hash
    except HashError:
        return False


def get_genesis_hash() -> bytes:
    """
    Get the genesis hash (all zeros) for the first event in a chain.
    
    Returns:
        32 bytes of zeros
    """
    return GENESIS_HASH


def hash_to_hex(hash_bytes: bytes) -> str:
    """
    Convert hash bytes to hex string for display.
    
    Args:
        hash_bytes: 32-byte hash
        
    Returns:
        64-character hex string
    """
    return hash_bytes.hex()


def hex_to_hash(hex_string: str) -> bytes:
    """
    Convert hex string to hash bytes.
    
    Args:
        hex_string: 64-character hex string
        
    Returns:
        32-byte hash
        
    Raises:
        HashError: If hex string is invalid
    """
    try:
        hash_bytes = bytes.fromhex(hex_string)
        if len(hash_bytes) != HASH_LENGTH:
            raise HashError(f"Hash must be {HASH_LENGTH} bytes")
        return hash_bytes
    except ValueError as e:
        raise HashError(f"Invalid hex string: {e}") from e