"""
Ed25519 signature utilities for Memory Pack signing
"""
from typing import Tuple

import nacl.encoding
import nacl.signing
from nacl.exceptions import BadSignatureError


class SigningError(Exception):
    """Raised when signing fails."""
    pass


class VerificationError(Exception):
    """Raised when signature verification fails."""
    pass


def generate_signing_keypair() -> Tuple[bytes, bytes]:
    """
    Generate a new Ed25519 signing keypair.
    
    Returns:
        Tuple of (private_key, public_key)
        - private_key: 32 bytes (seed)
        - public_key: 32 bytes
    """
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    
    return bytes(signing_key), bytes(verify_key)


def sign_data(data: bytes, private_key: bytes) -> bytes:
    """
    Sign data using Ed25519.
    
    Args:
        data: Data to sign
        private_key: 32-byte Ed25519 private key
        
    Returns:
        64-byte signature
        
    Raises:
        SigningError: If signing fails
    """
    if len(private_key) != 32:
        raise SigningError(f"Private key must be 32 bytes, got {len(private_key)}")
    
    try:
        signing_key = nacl.signing.SigningKey(private_key)
        signed = signing_key.sign(data)
        # Extract signature (first 64 bytes)
        signature = signed.signature
        return bytes(signature)
    except Exception as e:
        raise SigningError(f"Signing failed: {e}") from e


def verify_signature(data: bytes, signature: bytes, public_key: bytes) -> bool:
    """
    Verify Ed25519 signature.
    
    Args:
        data: Original data
        signature: 64-byte signature
        public_key: 32-byte Ed25519 public key
        
    Returns:
        True if signature is valid
        
    Raises:
        VerificationError: If verification fails (invalid signature or key)
    """
    if len(public_key) != 32:
        raise VerificationError(f"Public key must be 32 bytes, got {len(public_key)}")
    
    if len(signature) != 64:
        raise VerificationError(f"Signature must be 64 bytes, got {len(signature)}")
    
    try:
        verify_key = nacl.signing.VerifyKey(public_key)
        # This will raise BadSignatureError if invalid
        verify_key.verify(data, signature)
        return True
    except BadSignatureError:
        return False
    except Exception as e:
        raise VerificationError(f"Verification failed: {e}") from e


def encode_public_key(public_key: bytes) -> str:
    """
    Encode public key as base64 for storage/transmission.
    
    Args:
        public_key: 32-byte public key
        
    Returns:
        Base64-encoded string
    """
    return nacl.encoding.Base64Encoder.encode(public_key).decode('utf-8')


def decode_public_key(encoded: str) -> bytes:
    """
    Decode base64-encoded public key.
    
    Args:
        encoded: Base64 string
        
    Returns:
        32-byte public key
    """
    return nacl.encoding.Base64Encoder.decode(encoded.encode('utf-8'))


def encode_signature(signature: bytes) -> str:
    """
    Encode signature as base64.
    
    Args:
        signature: 64-byte signature
        
    Returns:
        Base64-encoded string
    """
    return nacl.encoding.Base64Encoder.encode(signature).decode('utf-8')


def decode_signature(encoded: str) -> bytes:
    """
    Decode base64-encoded signature.
    
    Args:
        encoded: Base64 string
        
    Returns:
        64-byte signature
    """
    return nacl.encoding.Base64Encoder.decode(encoded.encode('utf-8'))