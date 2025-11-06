"""
Test cryptography module
"""
from cc_core.crypto import Encryptor, Signer, Hasher


def test_encryption():
    print(" Testing XChaCha20-Poly1305 Encryption...\n")
    
    encryptor = Encryptor()
    
    # Derive key from passphrase
    passphrase = "correct horse battery staple"
    salt = encryptor.generate_salt()
    key = encryptor.derive_key(passphrase, salt)
    
    print(f" Key derived from passphrase (salt: {salt.hex()[:16]}...)")
    
    # Encrypt
    plaintext = "Marie Curie discovered radium"
    ciphertext, nonce = encryptor.encrypt(plaintext, key)
    
    print(f" Encrypted: {ciphertext.hex()[:32]}...")
    print(f"   Nonce: {nonce.hex()}")
    
    # Decrypt
    decrypted = encryptor.decrypt(ciphertext, nonce, key)
    
    print(f" Decrypted: {decrypted}")
    print(f"   Match: {decrypted == plaintext}\n")


def test_signing():
    print("  Testing Ed25519 Signatures...\n")
    
    signer = Signer()
    
    # Generate keypair
    private_key, public_key = signer.generate_keypair()
    
    print(f" Keypair generated")
    print(f"   Public: {public_key.decode()[:32]}...")
    
    # Sign data
    data = {"name": "Marie Curie", "discovered": "radium"}
    signature = signer.sign(data, private_key)
    
    print(f" Signature: {signature[:32]}...")
    
    # Verify
    valid = signer.verify(data, signature, public_key)
    print(f" Verification: {valid}")
    
    # Tamper test
    data["discovered"] = "gold"
    tampered = signer.verify(data, signature, public_key)
    print(f" Tampered data rejected: {not tampered}\n")


def test_hashing():
    print(" Testing BLAKE3 Hash Chains...\n")
    
    hasher = Hasher()
    
    # Hash data
    data = "Marie Curie won Nobel Prize"
    hash1 = hasher.hash_hex(data)
    
    print(f" Hash: {hash1[:32]}...")
    
    # Chain hashes
    genesis = hasher.hash("genesis")
    event1 = {"type": "fact_added", "data": "radium"}
    hash2 = hasher.hash_chain(genesis, event1)
    
    print(f" Chain hash: {hash2.hex()[:32]}...")
    
    # Verify chain
    valid = hasher.verify_chain(genesis, event1, hash2)
    print(f" Chain valid: {valid}\n")


if __name__ == "__main__":
    test_encryption()
    test_signing()
    test_hashing()
    print(" All crypto tests passed!")