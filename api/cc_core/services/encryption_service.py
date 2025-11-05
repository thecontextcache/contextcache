"""
Encryption Service - Handles content encryption/decryption with DEK
"""
import base64
from typing import Tuple, Optional
from cc_core.crypto.encryption import Encryptor


class EncryptionService:
    """
    Service for encrypting/decrypting document content with DEK

    Used for:
    - Document chunk text encryption
    - Document metadata encryption
    - Any content that needs encryption at rest
    """

    def __init__(self):
        self.encryptor = Encryptor()

    def encrypt_content(self, plaintext: str, dek: bytes) -> Tuple[str, str]:
        """
        Encrypt content using DEK (XChaCha20-Poly1305)

        Args:
            plaintext: Content to encrypt
            dek: Data Encryption Key (32 bytes)

        Returns:
            (base64_ciphertext, hex_nonce) tuple
        """
        if len(dek) != 32:
            raise ValueError("DEK must be 32 bytes")

        ciphertext, nonce = self.encryptor.encrypt(plaintext, dek)

        # Convert to storage-friendly formats
        ciphertext_b64 = base64.b64encode(ciphertext).decode('utf-8')
        nonce_hex = nonce.hex()

        return ciphertext_b64, nonce_hex

    def decrypt_content(
        self,
        ciphertext_b64: str,
        nonce_hex: str,
        dek: bytes
    ) -> str:
        """
        Decrypt content using DEK

        Args:
            ciphertext_b64: Base64-encoded ciphertext
            nonce_hex: Hex-encoded nonce
            dek: Data Encryption Key (32 bytes)

        Returns:
            Decrypted plaintext
        """
        if len(dek) != 32:
            raise ValueError("DEK must be 32 bytes")

        # Convert from storage formats
        ciphertext = base64.b64decode(ciphertext_b64)
        nonce = bytes.fromhex(nonce_hex)

        plaintext = self.encryptor.decrypt(ciphertext, nonce, dek)

        return plaintext

    def encrypt_batch(
        self,
        plaintexts: list[str],
        dek: bytes
    ) -> list[Tuple[str, str]]:
        """
        Encrypt multiple texts efficiently

        Args:
            plaintexts: List of texts to encrypt
            dek: Data Encryption Key

        Returns:
            List of (ciphertext_b64, nonce_hex) tuples
        """
        return [self.encrypt_content(text, dek) for text in plaintexts]

    def decrypt_batch(
        self,
        encrypted_items: list[Tuple[str, str]],
        dek: bytes
    ) -> list[str]:
        """
        Decrypt multiple texts efficiently

        Args:
            encrypted_items: List of (ciphertext_b64, nonce_hex) tuples
            dek: Data Encryption Key

        Returns:
            List of decrypted plaintexts
        """
        return [
            self.decrypt_content(ciphertext, nonce, dek)
            for ciphertext, nonce in encrypted_items
        ]


# Singleton instance
_encryption_service_instance: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    """Get singleton EncryptionService instance"""
    global _encryption_service_instance

    if _encryption_service_instance is None:
        _encryption_service_instance = EncryptionService()

    return _encryption_service_instance
