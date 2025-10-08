"""
Test cryptography module
"""
import pytest
from cc_core.crypto import Encryptor, Signer, Hasher
import json


class TestEncryption:
    """Test encryption/decryption operations"""
    
    def test_generate_salt(self):
        """Test salt generation"""
        encryptor = Encryptor()
        salt = encryptor.generate_salt()
        
        assert isinstance(salt, bytes)
        assert len(salt) == 16
        
        # Test uniqueness
        salt2 = encryptor.generate_salt()
        assert salt != salt2
    
    def test_derive_key(self):
        """Test key derivation from passphrase"""
        encryptor = Encryptor()
        
        passphrase = "correct horse battery staple"
        salt = encryptor.generate_salt()
        key = encryptor.derive_key(passphrase, salt)
        
        assert isinstance(key, bytes)
        assert len(key) == 32  # 256 bits
        
        # Same passphrase + salt = same key
        key2 = encryptor.derive_key(passphrase, salt)
        assert key == key2
        
        # Different salt = different key
        salt3 = encryptor.generate_salt()
        key3 = encryptor.derive_key(passphrase, salt3)
        assert key != key3
    
    def test_encrypt_decrypt(self):
        """Test encryption and decryption"""
        encryptor = Encryptor()
        
        passphrase = "my_secret_password"
        salt = encryptor.generate_salt()
        key = encryptor.derive_key(passphrase, salt)
        
        plaintext = "Marie Curie discovered radium"
        ciphertext, nonce = encryptor.encrypt(plaintext, key)
        
        assert isinstance(ciphertext, bytes)
        assert isinstance(nonce, bytes)
        assert len(nonce) == 24  # XChaCha20 nonce size
        assert ciphertext != plaintext.encode()
        
        # Decrypt
        decrypted = encryptor.decrypt(ciphertext, nonce, key)
        assert decrypted == plaintext
    
    def test_encrypt_different_nonces(self):
        """Test that encryption produces different nonces"""
        encryptor = Encryptor()
        
        passphrase = "password"
        salt = encryptor.generate_salt()
        key = encryptor.derive_key(passphrase, salt)
        
        plaintext = "Same message"
        ciphertext1, nonce1 = encryptor.encrypt(plaintext, key)
        ciphertext2, nonce2 = encryptor.encrypt(plaintext, key)
        
        # Different nonces mean different ciphertexts
        assert nonce1 != nonce2
        assert ciphertext1 != ciphertext2
    
    def test_decrypt_wrong_key(self):
        """Test that decryption fails with wrong key"""
        encryptor = Encryptor()
        
        # Encrypt with one key
        salt1 = encryptor.generate_salt()
        key1 = encryptor.derive_key("password1", salt1)
        plaintext = "Secret message"
        ciphertext, nonce = encryptor.encrypt(plaintext, key1)
        
        # Try to decrypt with wrong key
        salt2 = encryptor.generate_salt()
        key2 = encryptor.derive_key("password2", salt2)
        
        with pytest.raises(Exception):
            encryptor.decrypt(ciphertext, nonce, key2)
    
    def test_encrypt_empty_string(self):
        """Test encrypting empty string"""
        encryptor = Encryptor()
        
        salt = encryptor.generate_salt()
        key = encryptor.derive_key("password", salt)
        
        plaintext = ""
        ciphertext, nonce = encryptor.encrypt(plaintext, key)
        decrypted = encryptor.decrypt(ciphertext, nonce, key)
        
        assert decrypted == plaintext
    
    def test_encrypt_unicode(self):
        """Test encrypting unicode text"""
        encryptor = Encryptor()
        
        salt = encryptor.generate_salt()
        key = encryptor.derive_key("password", salt)
        
        plaintext = "Hello 世界 🌍"
        ciphertext, nonce = encryptor.encrypt(plaintext, key)
        decrypted = encryptor.decrypt(ciphertext, nonce, key)
        
        assert decrypted == plaintext


class TestSigning:
    """Test digital signature operations"""
    
    def test_generate_keypair(self):
        """Test keypair generation"""
        signer = Signer()
        
        private_key, public_key = signer.generate_keypair()
        
        assert isinstance(private_key, bytes)
        assert isinstance(public_key, bytes)
        assert len(private_key) == 64  # Ed25519 private key (seed + public)
        assert len(public_key) == 32   # Ed25519 public key
    
    def test_sign_and_verify(self):
        """Test signing and verification"""
        signer = Signer()
        
        private_key, public_key = signer.generate_keypair()
        
        data = {"name": "Marie Curie", "discovered": "radium"}
        signature = signer.sign(data, private_key)
        
        assert isinstance(signature, bytes)
        assert len(signature) == 64  # Ed25519 signature size
        
        # Verify
        is_valid = signer.verify(data, signature, public_key)
        assert is_valid is True
    
    def test_verify_tampered_data(self):
        """Test that tampered data fails verification"""
        signer = Signer()
        
        private_key, public_key = signer.generate_keypair()
        
        data = {"name": "Marie Curie", "discovered": "radium"}
        signature = signer.sign(data, private_key)
        
        # Tamper with data
        tampered_data = {"name": "Marie Curie", "discovered": "gold"}
        is_valid = signer.verify(tampered_data, signature, public_key)
        
        assert is_valid is False
    
    def test_verify_wrong_public_key(self):
        """Test that wrong public key fails verification"""
        signer = Signer()
        
        private_key1, public_key1 = signer.generate_keypair()
        private_key2, public_key2 = signer.generate_keypair()
        
        data = {"message": "test"}
        signature = signer.sign(data, private_key1)
        
        # Try to verify with wrong public key
        is_valid = signer.verify(data, signature, public_key2)
        assert is_valid is False
    
    def test_sign_different_data_types(self):
        """Test signing various data types"""
        signer = Signer()
        private_key, public_key = signer.generate_keypair()
        
        test_cases = [
            {"string": "value"},
            {"number": 42},
            {"float": 3.14},
            {"bool": True},
            {"list": [1, 2, 3]},
            {"nested": {"a": {"b": "c"}}},
        ]
        
        for data in test_cases:
            signature = signer.sign(data, private_key)
            is_valid = signer.verify(data, signature, public_key)
            assert is_valid is True


class TestHashing:
    """Test hashing operations"""
    
    def test_hash_bytes(self):
        """Test hashing bytes"""
        hasher = Hasher()
        
        data = b"Hello, World!"
        hash_result = hasher.hash(data)
        
        assert isinstance(hash_result, bytes)
        assert len(hash_result) == 32  # BLAKE3 output (256 bits)
    
    def test_hash_hex(self):
        """Test hashing with hex output"""
        hasher = Hasher()
        
        data = "Hello, World!"
        hash_hex = hasher.hash_hex(data)
        
        assert isinstance(hash_hex, str)
        assert len(hash_hex) == 64  # 32 bytes * 2 hex chars
        
        # Verify it's valid hex
        bytes.fromhex(hash_hex)
    
    def test_hash_deterministic(self):
        """Test that hashing is deterministic"""
        hasher = Hasher()
        
        data = "test data"
        hash1 = hasher.hash_hex(data)
        hash2 = hasher.hash_hex(data)
        
        assert hash1 == hash2
    
    def test_hash_different_inputs(self):
        """Test that different inputs produce different hashes"""
        hasher = Hasher()
        
        hash1 = hasher.hash_hex("input1")
        hash2 = hasher.hash_hex("input2")
        
        assert hash1 != hash2
    
    def test_hash_chain(self):
        """Test hash chaining"""
        hasher = Hasher()
        
        genesis = hasher.hash("genesis")
        event1 = {"type": "fact_added", "data": "radium"}
        chain_hash = hasher.hash_chain(genesis, event1)
        
        assert isinstance(chain_hash, bytes)
        assert len(chain_hash) == 32
    
    def test_verify_chain(self):
        """Test chain verification"""
        hasher = Hasher()
        
        genesis = hasher.hash("genesis")
        event1 = {"type": "fact_added", "data": "radium"}
        chain_hash = hasher.hash_chain(genesis, event1)
        
        # Verify valid chain
        is_valid = hasher.verify_chain(genesis, event1, chain_hash)
        assert is_valid is True
        
        # Verify invalid chain
        wrong_event = {"type": "fact_added", "data": "gold"}
        is_valid = hasher.verify_chain(genesis, wrong_event, chain_hash)
        assert is_valid is False
    
    def test_hash_chain_multiple_events(self):
        """Test chaining multiple events"""
        hasher = Hasher()
        
        # Build chain
        hash0 = hasher.hash("genesis")
        
        event1 = {"id": 1, "data": "first"}
        hash1 = hasher.hash_chain(hash0, event1)
        
        event2 = {"id": 2, "data": "second"}
        hash2 = hasher.hash_chain(hash1, event2)
        
        event3 = {"id": 3, "data": "third"}
        hash3 = hasher.hash_chain(hash2, event3)
        
        # Verify each link
        assert hasher.verify_chain(hash0, event1, hash1)
        assert hasher.verify_chain(hash1, event2, hash2)
        assert hasher.verify_chain(hash2, event3, hash3)
    
    def test_hash_empty_string(self):
        """Test hashing empty string"""
        hasher = Hasher()
        
        hash_result = hasher.hash_hex("")
        assert isinstance(hash_result, str)
        assert len(hash_result) == 64
    
    def test_hash_unicode(self):
        """Test hashing unicode text"""
        hasher = Hasher()
        
        data = "Hello 世界 🌍"
        hash_result = hasher.hash_hex(data)
        
        assert isinstance(hash_result, str)
        assert len(hash_result) == 64


class TestCryptoIntegration:
    """Test integration of crypto components"""
    
    def test_encrypt_and_sign(self):
        """Test encrypting and signing data"""
        encryptor = Encryptor()
        signer = Signer()
        
        # Setup
        salt = encryptor.generate_salt()
        enc_key = encryptor.derive_key("password", salt)
        priv_key, pub_key = signer.generate_keypair()
        
        # Encrypt
        plaintext = "Secret message"
        ciphertext, nonce = encryptor.encrypt(plaintext, enc_key)
        
        # Sign the ciphertext
        signature_data = {
            "ciphertext": ciphertext.hex(),
            "nonce": nonce.hex()
        }
        signature = signer.sign(signature_data, priv_key)
        
        # Verify and decrypt
        is_valid = signer.verify(signature_data, signature, pub_key)
        assert is_valid is True
        
        decrypted = encryptor.decrypt(ciphertext, nonce, enc_key)
        assert decrypted == plaintext
    
    def test_hash_before_sign(self):
        """Test hashing data before signing"""
        hasher = Hasher()
        signer = Signer()
        
        priv_key, pub_key = signer.generate_keypair()
        
        # Hash large data
        large_data = "x" * 10000
        data_hash = hasher.hash_hex(large_data)
        
        # Sign the hash
        signature = signer.sign({"hash": data_hash}, priv_key)
        
        # Verify
        is_valid = signer.verify({"hash": data_hash}, signature, pub_key)
        assert is_valid is True
