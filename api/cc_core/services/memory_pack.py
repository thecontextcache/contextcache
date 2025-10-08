"""
Memory Pack - Signed, portable knowledge packages
"""
from typing import List, Dict, Any
from datetime import datetime
from cc_core.crypto import Signer
import json


class MemoryPackService:
    """
    Create and verify signed Memory Packs
    Portable knowledge packages with Ed25519 signatures
    """
    
    def __init__(self):
        self.signer = Signer()
        self.version = "1.0"
        self.schema_url = "https://thecontextcache.com/schema/v1"
    
    def create_pack(
        self,
        project_name: str,
        facts: List[Dict[str, Any]],
        documents: List[Dict[str, Any]],
        private_key: bytes,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Create a signed Memory Pack
        
        Args:
            project_name: Name of the project
            facts: List of facts (quads)
            documents: List of document metadata
            private_key: Ed25519 private key
            metadata: Optional additional metadata
            
        Returns:
            Signed Memory Pack (dict)
        """
        # Build pack
        pack = {
            "@context": self.schema_url,
            "@type": "MemoryPack",
            "version": self.version,
            "project_name": project_name,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "facts": facts,
            "documents": documents,
            "metadata": metadata or {}
        }
        
        # Sign the pack
        signature = self.signer.sign(pack, private_key)
        
        # Add signature and public key
        _, public_key = self.signer.generate_keypair()  # Get public from private
        # Actually extract public from private
        from nacl.signing import SigningKey
        from nacl.encoding import Base64Encoder
        sk = SigningKey(private_key, encoder=Base64Encoder)
        public_key = sk.verify_key.encode(encoder=Base64Encoder)
        
        pack["signature"] = signature
        pack["public_key"] = public_key.decode()
        
        return pack
    
    def verify_pack(self, pack: Dict[str, Any]) -> Dict[str, Any]:
        """
        Verify Memory Pack signature
        
        Args:
            pack: Memory Pack to verify
            
        Returns:
            {valid: bool, message: str, pack_data: dict}
        """
        if "signature" not in pack or "public_key" not in pack:
            return {
                "valid": False,
                "message": "Missing signature or public key"
            }
        
        signature = pack["signature"]
        public_key = pack["public_key"].encode()
        
        # Create pack without signature for verification
        pack_to_verify = {k: v for k, v in pack.items() if k not in ["signature", "public_key"]}
        
        # Verify
        valid = self.signer.verify(pack_to_verify, signature, public_key)
        
        if valid:
            return {
                "valid": True,
                "message": "Signature verified successfully",
                "pack_data": pack_to_verify,
                "fact_count": len(pack.get("facts", [])),
                "document_count": len(pack.get("documents", []))
            }
        else:
            return {
                "valid": False,
                "message": "Invalid signature - pack may be tampered"
            }
    
    def export_to_file(self, pack: Dict[str, Any], filepath: str):
        """Export Memory Pack to JSON file"""
        with open(filepath, 'w') as f:
            json.dump(pack, f, indent=2)
    
    def import_from_file(self, filepath: str) -> Dict[str, Any]:
        """Import Memory Pack from JSON file"""
        with open(filepath, 'r') as f:
            return json.load(f)