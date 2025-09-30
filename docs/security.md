Perfect plan! Let's execute in order:
Step 1: Create remaining doc stubs
Step 2: Create empty directory structure
Step 3: GitHub setup guide (repo creation, settings, branch protection, secrets)
Step 4: Push to private branch

Step 1: Remaining Doc Stubs
Create docs/security.md
markdown---
title: Security Model
description: "Cryptographic guarantees and key management"
---

# Security Model

ContextCache is built with privacy and security as core principles. This document details our cryptographic approach, key management, and security guarantees.

## Cryptographic Primitives

### Content Encryption: XChaCha20-Poly1305

All user content (documents, facts, metadata) is encrypted at rest using **XChaCha20-Poly1305**:

- **Algorithm**: XChaCha20 stream cipher with Poly1305 MAC
- **Key Size**: 256 bits
- **Nonce Size**: 192 bits (extended from ChaCha20's 96 bits)
- **Tag Size**: 128 bits (authentication)

**Why XChaCha20-Poly1305?**
- Fast and constant-time (side-channel resistant)
- Larger nonce space prevents reuse concerns
- IETF standard (RFC 8439)
- No padding oracle vulnerabilities
```python
# Simplified encryption example
from nacl.secret import SecretBox

# Derive key from passphrase (see KDF section)
key = derive_key_from_passphrase(user_passphrase)
box = SecretBox(key)

# Encrypt content
ciphertext = box.encrypt(plaintext)  # Nonce prepended automatically
Signatures: Ed25519
Memory Packs are signed with Ed25519 for authenticity and integrity:

Algorithm: EdDSA with Curve25519
Key Size: 256 bits (32 bytes)
Signature Size: 512 bits (64 bytes)

Why Ed25519?

Fast signature generation and verification
Small keys and signatures
Deterministic (no RNG required for signing)
Collision-resistant

python# Simplified signing example
from nacl.signing import SigningKey

signing_key = SigningKey.generate()
signed = signing_key.sign(memory_pack_json)

# Verify
verify_key = signing_key.verify_key
verify_key.verify(signed)
Key Derivation: Argon2id
User passphrases are transformed into encryption keys using Argon2id:

Algorithm: Argon2id (hybrid of Argon2i and Argon2d)
Parameters:

Time cost: 3 iterations
Memory cost: 64 MiB
Parallelism: 4 threads
Salt: 128 bits (random, stored per project)
Output: 256 bits



Why Argon2id?

Winner of Password Hashing Competition (2015)
Resistant to GPU/ASIC attacks
Configurable memory-hardness
Side-channel resistant

python# Simplified KDF example
from argon2 import PasswordHasher

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MiB
    parallelism=4
)

key = ph.hash(passphrase + salt)
Audit Chains: BLAKE3
Audit events are linked in a hash chain using BLAKE3:

Algorithm: BLAKE3 (Merkle tree construction)
Hash Size: 256 bits
Performance: ~10 GB/s on modern CPUs

Why BLAKE3?

Faster than SHA-256, SHA-3, and BLAKE2
Parallelizable (SIMD optimized)
Cryptographically secure
Tree structure enables proof of inclusion

python# Simplified audit chain example
import blake3

def append_event(prev_hash: bytes, event_data: dict) -> bytes:
    hasher = blake3.blake3()
    hasher.update(prev_hash)
    hasher.update(json.dumps(event_data).encode())
    return hasher.digest()
Key Management
Project Keys
Each project has its own encryption key derived from a user-supplied passphrase:
Key Derivation Flow:
User Passphrase → Argon2id(passphrase, salt) → Project Key (256 bits)
                                                    ↓
                                    ┌──────────────────────────┐
                                    │  XChaCha20 Content Key   │
                                    │  Ed25519 Signing Key     │
                                    └──────────────────────────┘
Storage:

Salt: Stored in plaintext in database (unique per project)
Passphrase: Never stored (zero-knowledge)
Derived Key: Exists only in memory during session

<Warning>
**Key Recovery**: If you lose your passphrase and have no recovery kit, your data is **permanently unrecoverable**. This is by design (zero-knowledge).
</Warning>
Recovery Kits
Users can optionally export a Recovery Kit containing:

Mnemonic (BIP39-style): 24 words encoding the project key
QR Code: Machine-readable version of the mnemonic
Metadata: Project name, creation date (unencrypted)

Security:

Store recovery kit offline (print, secure USB, password manager)
Never transmit over unencrypted channels
Treat as equivalent to master passphrase

Signing Keys (Memory Packs)
When exporting a Memory Pack, a new Ed25519 keypair is generated:

Private Key: Used to sign the pack, then discarded
Public Key: Embedded in the pack for verification
Signature: Covers entire pack (facts + metadata)

Verification Flow:
Memory Pack (JSON) → Extract Public Key → Verify Signature → Trust Facts
Threat Model
See Threat Model for detailed analysis.
In Scope
We protect against:

Passive network observers (TLS + E2E encryption)
Database compromise (encrypted at rest)
Malicious cloud providers (zero-knowledge)
Memory Pack tampering (Ed25519 signatures)
Replay attacks (nonces, timestamps)
Side-channel timing attacks (constant-time crypto)

Out of Scope
We do NOT protect against:

Compromised client device (malware, keyloggers)
Weak user passphrases (user responsibility)
Physical access to unlocked device
Supply chain attacks on dependencies (mitigated by Aikido/Trivy)
Quantum computers (post-quantum crypto planned for v2.0)

Data at Rest
Database Encryption
What is encrypted:

All document content
Extracted facts (subject, predicate, object, context)
User-supplied metadata (project names, tags)
Provenance data

What is NOT encrypted:

Project IDs (UUIDs)
Salt values (required for key derivation)
Audit event hashes (public by design)
Timestamps (used for decay algorithms)

Storage Schema:
sqlCREATE TABLE facts (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    encrypted_content BYTEA NOT NULL,  -- XChaCha20-Poly1305
    nonce BYTEA NOT NULL,              -- 192 bits
    tag BYTEA NOT NULL,                -- 128 bits
    created_at TIMESTAMP NOT NULL
);
Backup Encryption
When backing up to user's cloud (Google Drive, iCloud, S3):

Pre-encryption: Data encrypted with project key
Transport: TLS to cloud provider
At-rest: Encrypted by provider + our layer

Backup contains:

Encrypted database dump
Salt values
Audit chain (hashes only)
Schema version

Does NOT contain:

Passphrases
Derived keys
Recovery kits

Data in Transit
API Communication

Frontend ↔ Backend: TLS 1.3 (HTTPS)
Backend ↔ Database: TLS with certificate verification
Backend ↔ Redis: TLS (production) or localhost (dev)

Memory Pack Export/Import

Export: Signed with Ed25519, then user downloads
Import: Signature verified before ingestion
Sharing: Out-of-band (email, Dropbox, etc.) - no ContextCache servers involved

Security Best Practices
For Users
<AccordionGroup>
  <Accordion title="Use Strong Passphrases">
    - Minimum 20 characters OR 6+ random words
    - Use a password manager
    - Enable recovery kit export
  </Accordion>
  <Accordion title="Verify Memory Packs">
    - Always check Ed25519 signature before import
    - Verify pack source (who sent it?)
    - Review metadata for unexpected changes
  </Accordion>
  <Accordion title="Secure Your Environment">
    - Keep OS and browser updated
    - Use full-disk encryption (FileVault, BitLocker)
    - Lock screen when away
    - Avoid public Wi-Fi without VPN
  </Accordion>
  <Accordion title="Regular Backups">
    - Export recovery kit after project creation
    - Periodic database backups to encrypted storage
    - Test restore procedures
  </Accordion>
</AccordionGroup>
For Operators
<AccordionGroup>
  <Accordion title="Secret Management">
    - Use GCP Secret Manager (production)
    - Rotate API keys quarterly
    - Audit secret access logs
  </Accordion>
  <Accordion title="Network Security">
    - Enable VPC for Cloud Run services
    - Use Cloud Armor for DDoS protection
    - Restrict Postgres to private IPs only
  </Accordion>
  <Accordion title="Monitoring">
    - Enable Cloud Audit Logs
    - Set up alerts for suspicious activity
    - Review security scan results (Aikido, Trivy)
  </Accordion>
  <Accordion title="Incident Response">
    - Follow runbook procedures
    - Isolate compromised services
    - Notify affected users
    - Conduct post-mortem
  </Accordion>
</AccordionGroup>
Compliance & Certifications
<Info>
**Current Status**: ContextCache is in alpha. Formal certifications pending.
</Info>
Planned:

SOC 2 Type II (Q2 2026)
GDPR compliance audit (Q3 2026)
ISO 27001 (Q4 2026)

Current:

OWASP Top 10 mitigations
CWE Top 25 addressed
Automated security scanning (Aikido, Trivy, Semgrep)

Vulnerability Disclosure
See SECURITY.md for our responsible disclosure policy.
Contact: thecontextcache@gmail.com