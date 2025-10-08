"""
Property-based tests for cryptography
Tests invariants that should ALWAYS hold true
"""
import pytest
from hypothesis import given, strategies as st, settings
from cc_core.crypto import Encryptor, Signer, Hasher


class TestEncryptionProperties:
    """Test encryption invariants"""
    
    @given(
        plaintext=st.text(min_size=1, max_size=1000),
        passphrase=st.text(min_size=20, max_size=100)
    )
    @settings(max_examples=10, deadline=5000)  # 5 second deadline, only 10 examples
    def test_encryption_roundtrip(self, plaintext, passphrase):
        """Property: encrypt then decrypt should return original"""
        encryptor = Encryptor()
        
        salt = encryptor.generate_salt()
        key = encryptor.derive_key(passphrase, salt)
        
        ciphertext, nonce = encryptor.encrypt(plaintext, key)
        decrypted = encryptor.decrypt(ciphertext, nonce, key)
        
        assert decrypted == plaintext
    
    @given(
        plaintext=st.text(min_size=1, max_size=1000)
    )
    @settings(max_examples=10)
    def test_different_keys_produce_different_ciphertexts(self, plaintext):
        """Property: same plaintext with different keys = different ciphertexts"""
        encryptor = Encryptor()
        
        key1 = encryptor.generate_key()
        key2 = encryptor.generate_key()
        
        ciphertext1, _ = encryptor.encrypt(plaintext, key1)
        ciphertext2, _ = encryptor.encrypt(plaintext, key2)
        
        assert ciphertext1 != ciphertext2


class TestSigningProperties:
    """Test signature invariants"""
    
    @given(
        data=st.dictionaries(
            keys=st.text(min_size=1, max_size=20),
            values=st.text(min_size=1, max_size=100),
            min_size=1,
            max_size=10
        )
    )
    @settings(max_examples=10)
    def test_signature_roundtrip(self, data):
        """Property: sign then verify should return True"""
        signer = Signer()
        
        private_key, public_key = signer.generate_keypair()
        signature = signer.sign(data, private_key)
        
        assert signer.verify(data, signature, public_key)
    
    @given(
        data=st.dictionaries(
            keys=st.text(min_size=1, max_size=20),
            values=st.text(min_size=1, max_size=100),
            min_size=1,
            max_size=10
        )
    )
    @settings(max_examples=10)
    def test_tampered_data_fails_verification(self, data):
        """Property: tampered data should fail verification"""
        if len(data) < 2:
            return  # Need at least 2 keys to tamper
        
        signer = Signer()
        
        private_key, public_key = signer.generate_keypair()
        signature = signer.sign(data, private_key)
        
        # Tamper with data
        tampered = data.copy()
        first_key = list(tampered.keys())[0]
        tampered[first_key] = "TAMPERED"
        
        assert not signer.verify(tampered, signature, public_key)


class TestHashingProperties:
    """Test hashing invariants"""
    
    @given(
        data1=st.text(min_size=1, max_size=1000),
        data2=st.text(min_size=1, max_size=1000)
    )
    @settings(max_examples=10)
    def test_deterministic_hashing(self, data1, data2):
        """Property: same input = same hash"""
        hasher = Hasher()
        
        hash1a = hasher.hash_hex(data1)
        hash1b = hasher.hash_hex(data1)
        
        assert hash1a == hash1b
        
        if data1 != data2:
            hash2 = hasher.hash_hex(data2)
            assert hash1a != hash2
    
    @given(
        prev_hash=st.binary(min_size=32, max_size=32),
        data=st.text(min_size=1, max_size=1000)
    )
    @settings(max_examples=10)
    def test_hash_chain_verification(self, prev_hash, data):
        """Property: hash chain verification should work"""
        hasher = Hasher()
        
        current_hash = hasher.hash_chain(prev_hash, data)
        
        assert hasher.verify_chain(prev_hash, data, current_hash)