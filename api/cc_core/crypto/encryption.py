"""
Encryption utilities using XChaCha20-Poly1305
Zero-knowledge encryption for user data
"""
import os
from typing import Tuple
from nacl.secret import SecretBox
from nacl.utils import random as nacl_random
from nacl.encoding import Base64Encoder
import nacl.pwhash


class Encryptor:
    """
    XChaCha20-Poly1305 encryption for content
    Uses Argon2id for key derivation from passphrases
    """
    
    def __init__(self):
        self.key_size = 32  # 256 bits
        self.nonce_size = 24  # 192 bits for XChaCha20
        
        # Argon2id parameters (moderate security/performance)
        self.argon2_ops = nacl.pwhash.argon2id.OPSLIMIT_MODERATE
        self.argon2_mem = nacl.pwhash.argon2id.MEMLIMIT_MODERATE
    
    def derive_key(self, passphrase: str, salt: bytes) -> bytes:
        """
        Derive encryption key from passphrase using Argon2id
        
        Args:
            passphrase: User's passphrase
            salt: Unique salt (16+ bytes)
            
        Returns:
            32-byte encryption key
        """
        if len(salt) < 16:
            raise ValueError("Salt must be at least 16 bytes")
        
        key = nacl.pwhash.argon2id.kdf(
            self.key_size,
            passphrase.encode('utf-8'),
            salt,
            opslimit=self.argon2_ops,
            memlimit=self.argon2_mem
        )
        
        return key
    
    def encrypt(self, plaintext: str, key: bytes) -> Tuple[bytes, bytes]:
        """
        Encrypt text using XChaCha20-Poly1305
        
        Args:
            plaintext: Text to encrypt
            key: 32-byte encryption key
            
        Returns:
            (ciphertext, nonce) tuple
        """
        box = SecretBox(key)
        
        # Encrypt (includes authentication tag automatically)
        encrypted = box.encrypt(plaintext.encode('utf-8'))
        
        # Split nonce and ciphertext+tag
        nonce = encrypted[:self.nonce_size]
        ciphertext_with_tag = encrypted[self.nonce_size:]
        
        return ciphertext_with_tag, nonce
    
    def decrypt(self, ciphertext: bytes, nonce: bytes, key: bytes) -> str:
        """
        Decrypt XChaCha20-Poly1305 ciphertext
        
        Args:
            ciphertext: Encrypted data (includes auth tag)
            nonce: 24-byte nonce
            key: 32-byte encryption key
            
        Returns:
            Decrypted plaintext
        """
        box = SecretBox(key)
        
        # Reconstruct full encrypted message
        encrypted_message = nonce + ciphertext
        
        # Decrypt (verifies auth tag automatically)
        plaintext = box.decrypt(encrypted_message)
        
        return plaintext.decode('utf-8')
    
    def generate_salt(self) -> bytes:
        """Generate cryptographically secure salt"""
        return nacl_random(16)  # 128 bits
    
    def generate_key(self) -> bytes:
        """Generate random encryption key"""
        return nacl_random(self.key_size)