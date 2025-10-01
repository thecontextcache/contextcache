"""
Cryptography utilities for ContextCache

- XChaCha20-Poly1305: Content encryption
- Ed25519: Memory Pack signatures
- Argon2id: Passphrase → key derivation
- BLAKE3: Audit chain hashing
"""
from cc_core.crypto.argon2 import (
    derive_key,
    generate_salt,
    verify_passphrase,
    get_parameters as get_argon2_parameters,
)
from cc_core.crypto.blake3_hash import (
    hash_data,
    hash_audit_event,
    verify_chain_link,
    get_genesis_hash,
    hash_to_hex,
    hex_to_hash,
)
from cc_core.crypto.ed25519 import (
    generate_signing_keypair,
    sign_data,
    verify_signature,
    encode_public_key,
    decode_public_key,
    encode_signature,
    decode_signature,
)
from cc_core.crypto.xchacha20 import (
    encrypt_content,
    decrypt_content,
    generate_key,
)

__all__ = [
    # XChaCha20-Poly1305
    "encrypt_content",
    "decrypt_content",
    "generate_key",
    # Ed25519
    "generate_signing_keypair",
    "sign_data",
    "verify_signature",
    "encode_public_key",
    "decode_public_key",
    "encode_signature",
    "decode_signature",
    # Argon2id
    "derive_key",
    "generate_salt",
    "verify_passphrase",
    "get_argon2_parameters",
    # BLAKE3
    "hash_data",
    "hash_audit_event",
    "verify_chain_link",
    "get_genesis_hash",
    "hash_to_hex",
    "hex_to_hash",
]