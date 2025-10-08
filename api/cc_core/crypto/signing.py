"""
Digital signatures using Ed25519
For Memory Pack verification
"""
from typing import Tuple
from nacl.signing import SigningKey, VerifyKey
from nacl.encoding import Base64Encoder
from nacl.exceptions import BadSignatureError
import json


class Signer:
    """
    Ed25519 digital signatures for Memory Packs
    """
    
    def generate_keypair(self) -> Tuple[bytes, bytes]:
        """
        Generate Ed25519 signing keypair
        
        Returns:
            (private_key, public_key) tuple
        """
        signing_key = SigningKey.generate()
        verify_key = signing_key.verify_key
        
        return (
            signing_key.encode(encoder=Base64Encoder),
            verify_key.encode(encoder=Base64Encoder)
        )
    
    def sign(self, data: dict, private_key: bytes) -> str:
        """
        Sign data with Ed25519 private key
        
        Args:
            data: Dictionary to sign
            private_key: Base64-encoded private key
            
        Returns:
            Base64-encoded signature
        """
        # Canonical JSON (sorted keys, no whitespace)
        canonical = json.dumps(data, sort_keys=True, separators=(',', ':'))
        
        signing_key = SigningKey(private_key, encoder=Base64Encoder)
        signed = signing_key.sign(canonical.encode('utf-8'))
        
        # Return just the signature (not the message)
        return signed.signature.hex()
    
    def verify(self, data: dict, signature: str, public_key: bytes) -> bool:
        """
        Verify Ed25519 signature
        
        Args:
            data: Dictionary to verify
            signature: Hex-encoded signature
            public_key: Base64-encoded public key
            
        Returns:
            True if valid, False otherwise
        """
        try:
            # Canonical JSON
            canonical = json.dumps(data, sort_keys=True, separators=(',', ':'))
            
            verify_key = VerifyKey(public_key, encoder=Base64Encoder)
            
            # Verify (raises BadSignatureError if invalid)
            verify_key.verify(
                canonical.encode('utf-8'),
                bytes.fromhex(signature)
            )
            
            return True
            
        except BadSignatureError:
            return False
        except Exception as e:
            print(f"Signature verification error: {e}")
            return False