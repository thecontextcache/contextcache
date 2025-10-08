"""
BLAKE3 hashing for audit chains
Faster and more secure than SHA256
"""
import blake3
import json
from typing import Union


class Hasher:
    """
    BLAKE3 hashing for audit trails
    """
    
    def hash(self, data: Union[str, bytes, dict]) -> bytes:
        """
        Compute BLAKE3 hash
        
        Args:
            data: String, bytes, or dict to hash
            
        Returns:
            32-byte hash digest
        """
        if isinstance(data, dict):
            # Canonical JSON for dicts
            data = json.dumps(data, sort_keys=True, separators=(',', ':')).encode('utf-8')
        elif isinstance(data, str):
            data = data.encode('utf-8')
        
        return blake3.blake3(data).digest()
    
    def hash_hex(self, data: Union[str, bytes, dict]) -> str:
        """
        Compute BLAKE3 hash as hex string
        """
        return self.hash(data).hex()
    
    def hash_chain(self, prev_hash: bytes, data: Union[str, bytes, dict]) -> bytes:
        """
        Compute chained hash: BLAKE3(prev_hash || data)
        
        Args:
            prev_hash: Previous hash in chain
            data: New data to hash
            
        Returns:
            New hash digest
        """
        if isinstance(data, dict):
            data = json.dumps(data, sort_keys=True, separators=(',', ':')).encode('utf-8')
        elif isinstance(data, str):
            data = data.encode('utf-8')
        
        combined = prev_hash + data
        return blake3.blake3(combined).digest()
    
    def verify_chain(self, prev_hash: bytes, data: Union[str, bytes, dict], expected_hash: bytes) -> bool:
        """
        Verify hash chain integrity
        """
        computed = self.hash_chain(prev_hash, data)
        return computed == expected_hash