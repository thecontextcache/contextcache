---
title: Threat Model
description: "Security analysis and attacker capabilities"
---

# Threat Model

This document analyzes potential threats to ContextCache and our security posture against various attacker profiles.

## Assumptions

### Trust Boundaries

**We trust:**
- The user's local device (while unlocked)
- TLS/HTTPS infrastructure
- Cryptographic primitives (XChaCha20, Ed25519, Argon2id, BLAKE3)
- Operating system kernel
- Docker runtime (in development)

**We do NOT trust:**
- Network infrastructure (ISPs, proxies)
- Cloud providers (Neon, Upstash, GCP)
- Third-party dependencies (mitigated via scanning)
- Browser extensions (potential keyloggers)
- Other users (multi-tenancy isolation)

### User Responsibilities

Users are responsible for:
- Choosing strong passphrases (20+ characters)
- Securing their devices (full-disk encryption, screen lock)
- Protecting recovery kits (offline storage)
- Verifying Memory Pack signatures before import
- Keeping software updated

**ContextCache cannot protect against:**
- Compromised user devices
- Weak passphrases
- Lost recovery kits (by design)
- Social engineering attacks

## Attacker Profiles

### A1: Passive Network Observer

**Capabilities:**
- Monitor network traffic (ISP, coffee shop Wi-Fi)
- Record encrypted packets
- No ability to modify traffic

**Mitigations:**
-  TLS 1.3 for all API communication
-  End-to-end encryption (data encrypted before leaving client)
-  Perfect forward secrecy (ephemeral keys)
-  Certificate pinning (optional, for high-security deployments)

**Residual Risk:** Low
- Attacker sees encrypted traffic volume and timing
- Cannot decrypt content without breaking TLS or E2E encryption

---

### A2: Active Network Attacker (MITM)

**Capabilities:**
- Intercept and modify traffic
- Inject malicious responses
- Downgrade attacks (force HTTP)

**Mitigations:**
-  HSTS headers (force HTTPS)
-  Certificate validation
-  Content integrity via Poly1305 MAC
-  Ed25519 signatures on Memory Packs (prevent tampering)
-  CORS restrictions

**Residual Risk:** Low to Medium
- Well-configured TLS defeats most MITM attacks
- Risk if user ignores certificate warnings

---

### A3: Cloud Provider (Database/Redis)

**Capabilities:**
- Full access to database and cache
- Read encrypted data at rest
- Access to metadata (timestamps, IDs, salts)
- Cannot access user passphrases or derived keys

**Mitigations:**
-  XChaCha20-Poly1305 encryption at rest
-  Zero-knowledge design (keys never leave client)
-  Salts stored separately from ciphertext
-  No plaintext indexing of sensitive fields

**Residual Risk:** Low
- Attacker sees encrypted blobs and metadata
- Cannot decrypt without user passphrase
- Could attempt offline brute-force (mitigated by Argon2id)

**Potential Attack:**
Attacker → Steal encrypted DB → Brute-force weak passphrase
↓
Argon2id makes this expensive
(64 MiB RAM × 3 iterations per attempt)

---

### A4: Malicious Insider (Backend Compromise)

**Capabilities:**
- Access to running API server
- Read environment variables and secrets
- Modify code or inject backdoors
- Access to all encrypted data

**Mitigations:**
-  Zero-knowledge architecture (keys never sent to backend)
-  Audit logs for all admin actions
-  Code review and branch protection
-  Immutable Docker images (signed)
-  Secret rotation procedures
-  Least-privilege IAM roles

**Residual Risk:** Medium
- Cannot decrypt user content without passphrase
- Could serve malicious frontend code (see A6)
- Could corrupt audit chains (detectable by users)

**Detection:**
- Audit log anomalies
- Unexpected cloud resource changes
- Failed signature verifications by users

---

### A5: Malicious User (Multi-Tenancy Attack)

**Capabilities:**
- Create legitimate account
- Attempt to access other users' data
- SQL injection, NoSQL injection
- Rate limit exhaustion (DoS)

**Mitigations:**
-  Row-level security (project_id isolation)
-  Parameterized queries (no SQL injection)
-  Input validation (Pydantic models)
-  Rate limiting (token buckets per project and IP)
-  Proof-of-Work challenges on surge
-  Resource quotas per project

**Residual Risk:** Low
- Standard web app security practices
- Even if attacker accesses another project's data, it's encrypted

**Isolation Example:**
```sql
-- All queries enforce project ownership
SELECT * FROM facts 
WHERE project_id = :user_project_id  -- Enforced at ORM level
AND id = :fact_id;

A6: Supply Chain Attack
Capabilities:

Compromise npm/PyPI package
Inject malicious code into dependencies
Steal keys or passphrases via backdoor

Mitigations:

 Dependency scanning (Aikido, Trivy, Renovate)
 SBOM generation and auditing
 Pinned versions (lock files)
 Automated security updates
 Code review for dependency changes
 Subresource Integrity (SRI) for CDN assets (planned)

Residual Risk: Medium to High

Difficult to fully prevent
Detection relies on community and automated tools
Critical dependencies manually audited

Example Attack:
Malicious update to cryptography library → Exfiltrate keys via DNS
                                               ↓
                                    Detected by egress firewall rules

A7: Quantum Adversary (Future)
Capabilities:

Large-scale quantum computer (Shor's algorithm)
Break RSA, ECC, and Ed25519
Harvest encrypted data now, decrypt later

Mitigations:

 Post-quantum cryptography (planned for v2.0)
 XChaCha20 is quantum-resistant (symmetric)
 Ed25519 signatures vulnerable (asymmetric)
 Forward secrecy limits exposure window

Residual Risk: High (future threat)

Memory Pack signatures could be forged
Content encryption (XChaCha20) remains secure
Timeline: 10-20 years until practical quantum computers

Roadmap:

v2.0: Migrate to CRYSTALS-Dilithium (signatures)
v2.0: Hybrid encryption (XChaCha20 + Kyber)


Attack Scenarios
Scenario 1: Database Breach
Attack:

Attacker gains access to Neon Postgres (phishing, credential leak)
Dumps all tables including encrypted facts table
Attempts offline brute-force on weak passphrases

Impact:

High confidentiality risk if passphrase is weak (<12 characters)
Low risk if passphrase follows best practices (20+ characters, 6+ words)

Mitigation Effectiveness:
Passphrase Strength    | Argon2id Cost     | Brute-Force Time
-----------------------|-------------------|------------------
8 chars (lowercase)    | ~0.5s per attempt | ~4 days
12 chars (mixed)       | ~0.5s per attempt | ~5,000 years
20 chars (random)      | ~0.5s per attempt | > age of universe
6 random words         | ~0.5s per attempt | > age of universe
User Action:

Rotate project passphrase immediately
Export fresh recovery kit
Review audit logs for suspicious activity


Scenario 2: Malicious Memory Pack
Attack:

Attacker creates fake Memory Pack with plausible-looking data
Forges Ed25519 signature (requires private key)
Tricks user into importing tampered pack

Impact:

Low risk: Signature verification will fail
Medium risk: If user ignores verification warnings

Mitigation Effectiveness:

 Ed25519 signatures are computationally infeasible to forge
 Frontend enforces signature check before import
 User education required (don't bypass warnings)

User Action:

Always verify signature before import
Check pack metadata (source, timestamp)
Import only from trusted sources


Scenario 3: Frontend Code Injection
Attack:

Attacker compromises Cloudflare Pages or CDN
Serves malicious JavaScript that exfiltrates passphrases
User enters passphrase, attacker captures it

Impact:

Critical: Full compromise of user data

Mitigation Effectiveness:

 Subresource Integrity (SRI) planned but not yet implemented
 Content Security Policy (CSP) headers restrict script sources
 Users can self-host frontend (Docker)
 Browser extensions could bypass (user responsibility)

Detection:

Unexpected network requests (passphrase to attacker server)
Browser dev tools inspection
Community code audits

User Action:

Use self-hosted frontend for high-security scenarios
Review browser network tab for suspicious requests
Verify commit hash matches official release


Scenario 4: Rate Limit Bypass
Attack:

Attacker creates many projects or uses distributed IPs
Floods API with ingest/extract requests
Exhausts backend resources (DoS)

Impact:

Medium: Temporary service degradation
Low: Individual user data not compromised

Mitigation Effectiveness:

 Per-project token buckets (30 ingest/min)
 Per-IP coarse limits (300 req/min)
 Proof-of-Work challenge on surge
 Cloud Run auto-scaling (up to max instances)
 Circuit breakers (temporary block abusive tokens)

Detection:

Redis metrics (bucket exhaustion rate)
Cloud Run CPU/memory alerts
Sudden spike in 429 responses

Operator Action:

Temporarily lower rate limits
Block abusive IPs at Cloud Armor layer
Scale up Cloud Run instances


Security Boundaries
What ContextCache Protects
AssetConfidentialityIntegrityAvailabilityUser Content E2E Encrypted Poly1305 MAC Rate LimitedMemory Packs Signed (Ed25519) Verified User-ownedAudit Logs Public by design BLAKE3 Chain Append-onlyMetadata Timestamps visible Validated Rate LimitedAPI Keys Secret Manager Rotatable Monitored
Legend:

 Strongly protected
 Partially protected
 Intentionally public

What Users Must Protect
AssetUser ResponsibilityPassphraseNever share, store securelyRecovery KitOffline backup (print, USB)Device SecurityFull-disk encryption, lock screenNetwork SecurityAvoid untrusted Wi-Fi, use VPNBrowser HygieneNo malicious extensions, updated

Known Limitations
<Warning>
These limitations are inherent to our design choices and cannot be fully mitigated without breaking core features.
</Warning>

No Passphrase Recovery

By design: Zero-knowledge means we cannot reset passphrases
Mitigation: Recovery kit export (user responsibility)


Metadata Leakage

Issue: Timestamps, project IDs, document counts visible in DB
Mitigation: Helps performance (decay algorithms), low-risk metadata


Timing Side-Channels

Issue: Query response times reveal graph size/complexity
Mitigation: Constant-time crypto, but query logic varies by dataset


Browser Security

Issue: Malicious extensions can capture passphrases
Mitigation: User education, consider self-hosted frontend


Quantum Vulnerability (Ed25519)

Issue: Memory Pack signatures breakable by future quantum computers
Mitigation: Post-quantum migration planned (v2.0)




Security Roadmap
v0.1 (Current)

 XChaCha20-Poly1305 encryption
 Ed25519 signatures
 Argon2id KDF
 BLAKE3 audit chains
 TLS everywhere

v0.2 (Q2 2025)

 Subresource Integrity (SRI)
 Hardware security key support (WebAuthn)
 Encrypted backups to user's cloud

v1.0 (Q4 2025)

 SOC 2 Type II audit
 Penetration testing report
 Bug bounty program

v2.0 (Q2 2026)

 Post-quantum cryptography (Kyber, Dilithium)
 Zero-knowledge proofs for queries
 Hardware enclave support (SGX, SEV)


Security Testing
We continuously test ContextCache's security posture:
Automated:

Aikido Security (SAST/DAST/Secrets/IaC) on every PR
Trivy (container + SBOM scanning) on every PR
Renovate (dependency updates) weekly
Semgrep (additional SAST rules) on every PR

Manual:

Code review (2 approvers for crypto changes)
Penetration testing (planned Q3 2025)
Security audits (planned Q4 2025)

Community:

Responsible disclosure program (SECURITY.md)
Public code audits (GitHub Discussions)


Questions?
For security-specific questions:

Email: thecontextcache@gmail.com
GitHub Discussions: Security category
Vulnerability Reports: Follow SECURITY.md