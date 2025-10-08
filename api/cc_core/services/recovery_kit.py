"""
Recovery Kit - Secure key backup with mnemonics and QR codes
"""
from typing import Tuple, Dict, Any
from datetime import datetime
import json
import qrcode
from io import BytesIO
import base64
from mnemonic import Mnemonic
from cc_core.crypto import Encryptor


class RecoveryKitService:
    """
    Generate recovery kits for project encryption keys
    Uses BIP39 mnemonics and QR codes
    """
    
    def __init__(self):
        self.mnemonic = Mnemonic("english")
        self.encryptor = Encryptor()
    
    def generate_mnemonic(self, entropy_bits: int = 256) -> str:
        """
        Generate BIP39 mnemonic phrase
        
        Args:
            entropy_bits: 128, 160, 192, 224, or 256 bits
            
        Returns:
            Mnemonic phrase (12-24 words)
        """
        return self.mnemonic.generate(strength=entropy_bits)
    
    def mnemonic_to_seed(self, mnemonic_phrase: str, passphrase: str = "") -> bytes:
        """
        Convert mnemonic to seed bytes
        
        Args:
            mnemonic_phrase: BIP39 mnemonic
            passphrase: Optional additional passphrase
            
        Returns:
            64-byte seed
        """
        return self.mnemonic.to_seed(mnemonic_phrase, passphrase)
    
    def seed_to_key(self, seed: bytes) -> bytes:
        """
        Derive 32-byte encryption key from seed
        
        Args:
            seed: 64-byte seed from mnemonic
            
        Returns:
            32-byte encryption key
        """
        # Use first 32 bytes as key
        return seed[:32]
    
    def create_recovery_kit(
        self,
        project_id: str,
        project_name: str,
        encryption_key: bytes,
        salt: bytes
    ) -> Dict[str, Any]:
        """
        Create complete recovery kit
        
        Args:
            project_id: UUID of project
            project_name: Name of project
            encryption_key: 32-byte encryption key to backup
            salt: Salt used for key derivation
            
        Returns:
            Recovery kit with mnemonic, QR code, and metadata
        """
        # Generate mnemonic from encryption key
        # Note: For real production, derive mnemonic properly
        # This is simplified - encrypt the key with a mnemonic-derived key
        
        mnemonic_phrase = self.generate_mnemonic(256)  # 24 words
        mnemonic_seed = self.mnemonic_to_seed(mnemonic_phrase)
        mnemonic_key = self.seed_to_key(mnemonic_seed)
        
        # Encrypt the actual encryption key with mnemonic-derived key
        encrypted_key, nonce = self.encryptor.encrypt(
            encryption_key.hex(),
            mnemonic_key
        )
        
        # Build recovery kit
        kit = {
            "version": "1.0",
            "type": "ContextCache_Recovery_Kit",
            "project_id": project_id,
            "project_name": project_name,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "mnemonic": mnemonic_phrase,
            "encrypted_key": encrypted_key.hex(),
            "nonce": nonce.hex(),
            "salt": salt.hex(),
            "instructions": "Store this recovery kit securely. You need the mnemonic phrase to recover your encryption key."
        }
        
        # Generate QR code
        qr_data = json.dumps({
            "project_id": project_id,
            "mnemonic": mnemonic_phrase,
            "salt": salt.hex()
        })
        
        qr_code_base64 = self.generate_qr_code(qr_data)
        kit["qr_code"] = qr_code_base64
        
        return kit
    
    def recover_key_from_mnemonic(
        self,
        mnemonic_phrase: str,
        encrypted_key: str,
        nonce: str
    ) -> bytes:
        """
        Recover encryption key from mnemonic
        
        Args:
            mnemonic_phrase: BIP39 mnemonic
            encrypted_key: Hex-encoded encrypted key
            nonce: Hex-encoded nonce
            
        Returns:
            32-byte encryption key
        """
        # Derive key from mnemonic
        mnemonic_seed = self.mnemonic_to_seed(mnemonic_phrase)
        mnemonic_key = self.seed_to_key(mnemonic_seed)
        
        # Decrypt the encryption key
        decrypted_hex = self.encryptor.decrypt(
            bytes.fromhex(encrypted_key),
            bytes.fromhex(nonce),
            mnemonic_key
        )
        
        return bytes.fromhex(decrypted_hex)
    
    def generate_qr_code(self, data: str, size: int = 300) -> str:
        """
        Generate QR code as base64 PNG
        
        Args:
            data: Data to encode
            size: Size in pixels (square)
            
        Returns:
            Base64-encoded PNG image
        """
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(data)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return f"data:image/png;base64,{img_base64}"
    
    def validate_mnemonic(self, mnemonic_phrase: str) -> bool:
        """
        Validate BIP39 mnemonic phrase
        
        Args:
            mnemonic_phrase: Phrase to validate
            
        Returns:
            True if valid
        """
        return self.mnemonic.check(mnemonic_phrase)
    
    def export_to_file(self, kit: Dict[str, Any], filepath: str):
        """Export recovery kit to JSON file"""
        with open(filepath, 'w') as f:
            json.dump(kit, f, indent=2)
    
    def import_from_file(self, filepath: str) -> Dict[str, Any]:
        """Import recovery kit from JSON file"""
        with open(filepath, 'r') as f:
            return json.load(f)