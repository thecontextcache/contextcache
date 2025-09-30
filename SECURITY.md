# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

### How to Report

Send an email to **thecontextcache@gmail.com** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Regular updates**: Every 7 days until resolution
- **Public disclosure**: Coordinated after fix is released

### Scope

**In Scope:**
- Authentication/authorization bypass
- Cryptographic implementation flaws
- Data leakage (user content, keys, audit logs)
- Injection vulnerabilities (SQL, command, XSS)
- Denial of service with lasting impact
- Supply chain attacks (dependency confusion, malicious packages)
- Container escape or privilege escalation
- MCP server protocol violations

**Out of Scope:**
- Social engineering attacks
- Physical access attacks
- Brute force attacks on user passphrases (user responsibility)
- Self-XSS
- Issues in third-party dependencies (report to upstream, but notify us)
- Theoretical attacks without proof of concept

### Encryption & Key Management

ContextCache uses:
- **XChaCha20-Poly1305** (content encryption)
- **Ed25519** (Memory Pack signatures)
- **Argon2id** (passphrase → project keys)
- **BLAKE3** (audit chain hashing)

If you find flaws in our implementation (not the algorithms themselves), please report them.

### Bug Bounty

We do not currently offer a paid bug bounty program. Valid reports will receive:
- Public acknowledgment (unless you prefer anonymity)
- Credit in release notes
- Our sincere gratitude

### Security Best Practices for Users

1. **Use strong passphrases**: 6+ random words or 20+ characters
2. **Export recovery kits**: Store securely offline
3. **Verify Memory Packs**: Always check Ed25519 signatures before import
4. **Keep software updated**: Enable Renovate dependency updates
5. **Review audit logs**: Check for unexpected events
6. **Limit document sources**: Use policy-gate allowlists

### Security Tooling

We use:
- **Aikido Security**: SAST, DAST, secrets scanning, IaC checks
- **Trivy**: Container and SBOM scanning
- **Renovate**: Automated dependency updates
- **Semgrep** (optional): Additional static analysis
- **GitHub Dependabot**: Alerts for known vulnerabilities

All PRs must pass security checks before merge.

### Cryptographic Commitments

- We will **never**:
  - Store user passphrases
  - Implement backdoors or key escrow
  - Weaken crypto for "lawful access"
  - Log decrypted user content

- Project keys are **unrecoverable** if:
  - Passphrase is lost
  - Recovery kit is not exported
  - This is by design (zero-knowledge)

### Incident Response

In case of a confirmed security incident:
1. Immediate fix development
2. Patch release within 72 hours (critical issues)
3. Public advisory with CVE (if applicable)
4. Retroactive audit log analysis tools provided
5. Post-mortem published within 30 days

### Contact

- **Email**: thecontextcache@gmail.com
- **PGP Key**: [Link to public key when available]

---

Last updated: 2025-01-29