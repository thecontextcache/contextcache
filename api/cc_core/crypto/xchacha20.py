"""
XChaCha20-Poly1305 content encryption utilities
"""
from typing import Tuple

import nacl.secret
import nacl.utils
from nacl.exceptions import CryptoError


class EncryptionError(Exception):
    """Raised when encryption fails."""
    pass


class DecryptionError(Exception):
    """Raised when decryption fails."""
    pass


def encrypt_content(plaintext: bytes, key: bytes) -> Tuple[bytes, bytes]:
    """
    Encrypt content using XChaCha20-Poly1305.
    
    Args:
        plaintext: Data to encrypt
        key: 256-bit encryption key (32 bytes)
        
    Returns:
        Tuple of (ciphertext, nonce)
        - ciphertext includes authentication tag
        - nonce is 192 bits (24 bytes)
        
    Raises:
        EncryptionError: If encryption fails
    """
    if len(key) != 32:
        raise EncryptionError(f"Key must be 32 bytes, got {len(key)}")
    
    try:
        box = nacl.secret.SecretBox(key)
        # SecretBox.encrypt generates random nonce and prepends it
        encrypted = box.encrypt(plaintext)
        
        # Extract nonce (first 24 bytes) and ciphertext (rest)
        nonce = encrypted[:24]
        ciphertext = encrypted[24:]
        
        return ciphertext, nonce
    except Exception as e:
        raise EncryptionError(f"Encryption failed: {e}") from e


def decrypt_content(ciphertext: bytes, nonce: bytes, key: bytes) -> bytes:
    """
    Decrypt content using XChaCha20-Poly1305.
    
    Args:
        ciphertext: Encrypted data (includes auth tag)
        nonce: 192-bit nonce (24 bytes)
        key: 256-bit encryption key (32 bytes)
        
    Returns:
        Decrypted plaintext
        
    Raises:
        DecryptionError: If decryption or authentication fails
    """
    if len(key) != 32:
        raise DecryptionError(f"Key must be 32 bytes, got {len(key)}")
    
    if len(nonce) != 24:
        raise DecryptionError(f"Nonce must be 24 bytes, got {len(nonce)}")
    
    try:
        box = nacl.secret.SecretBox(key)
        # SecretBox expects nonce prepended to ciphertext
        encrypted = nonce + ciphertext
        plaintext = box.decrypt(encrypted)
        return plaintext
    except CryptoError as e:
        raise DecryptionError("Decryption failed: invalid key or corrupted data") from e
    except Exception as e:
        raise DecryptionError(f"Decryption failed: {e}") from e


def generate_key() -> bytes:
    """
    Generate a random 256-bit encryption key.
    
    Returns:
        32 random bytes suitable for XChaCha20-Poly1305
    """
    return nacl.utils.random(32)