# Contributing to ContextCache

Thank you for considering contributing to ContextCache! We welcome contributions from researchers, developers, and users who share our vision of privacy-first, explainable AI memory.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Messages](#commit-messages)
- [License Agreement](#license-agreement)

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to iamdevnd@gmail.com.

## How Can I Contribute?

### Reporting Bugs

**Before submitting:**
- Check [existing issues](https://github.com/iamdevnd/contextcache/issues)
- Use the bug report template
- Include reproduction steps, expected vs actual behavior, environment details

**Security bugs**: See [SECURITY.md](SECURITY.md) for private disclosure process.

### Suggesting Enhancements

- Use the feature request template
- Explain the use case and expected behavior
- Consider proposing an implementation approach

### Contributing Code

We accept contributions in these areas:
- **Analyzer plug-ins**: New ranking algorithms (see `api/cc_core/analyzers/`)
- **MCP tools**: Extensions to existing servers
- **Frontend components**: UI improvements
- **Documentation**: Guides, examples, translations
- **Tests**: Coverage improvements, edge cases
- **Bug fixes**: Any priority level

### Contributing Documentation

- Mintlify docs live in `docs/`
- Follow existing structure and tone
- Include code examples where applicable
- Test locally before submitting

## Development Setup

### Prerequisites

- **Python**: 3.12+ (we use 3.13)
- **Node.js**: 20+ LTS
- **pnpm**: 8+
- **Docker Desktop**: Latest (for Mac Apple Silicon)
- **Git**: 2.40+

### Local Environment
```bash
# Clone your fork
git clone https://github.com/iamdevnd/contextcache.git
cd contextcache

# Create environment file
cp .env.example .env.local
# Edit .env.local with your local values

# Start development stack
docker-compose -f infra/docker-compose.dev.yml up -d

# Backend setup
cd api
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -e ".[dev]"
pytest

# Frontend setup
cd ../frontend
pnpm install
pnpm dev
pnpm test

# Access services
# Frontend: http://localhost:3000
# API: http://localhost:8000
# API Docs: http://localhost:8000/docs

Branch Strategy

main: Production (protected)
dev: Integration branch (target for PRs)
feature/your-feature: Your work
fix/issue-number: Bug fixes

Workflow:

Fork the repository
Create branch from dev: git checkout -b feature/my-feature dev
Make changes with tests
Push to your fork
Open PR against dev

Pull Request Process
Before Submitting

 All tests pass locally (pytest, pnpm test, pnpm test:e2e)
 Code follows style guide (run linters)
 New features have tests (≥85% coverage for crypto/storage)
 Documentation updated (if applicable)
 No secrets or credentials committed
 Commit messages follow convention

PR Template
markdown## Description
Brief summary of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guide
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings

Review Process

Automated checks must pass (CI, security scans)
At least one maintainer approval required
All conversations resolved
Squash merge into dev

Coding Standards
Python (Backend)

Style: PEP 8, enforced by ruff
Type hints: Required for all functions
Docstrings: Google style for public APIs
Imports: Use absolute imports, sorted with isort

pythonfrom typing import List, Optional
from pydantic import BaseModel

def calculate_score(facts: List[Fact], context: str) -> float:
    """Calculate relevance score for facts given context.
    
    Args:
        facts: List of candidate facts
        context: User query context
        
    Returns:
        Normalized score between 0.0 and 1.0
    """
    pass
TypeScript (Frontend)

Style: Airbnb + Prettier
Types: Strict mode, no any
Components: Functional with hooks
File naming: kebab-case for files, PascalCase for components

typescriptinterface FactCardProps {
  fact: Fact;
  onExplain: (factId: string) => void;
}

export function FactCard({ fact, onExplain }: FactCardProps) {
  // Implementation
}
General

No TODO comments: Create issues instead
Error handling: Always handle errors explicitly
Logging: Use structured logging (not print() or console.log())
Comments: Explain "why", not "what"

Testing Requirements
Backend Tests
bash# Run all tests
pytest

# With coverage
pytest --cov=cc_core --cov-report=html

# Property tests
pytest -m hypothesis

# Contract tests
pytest -m schemathesis
Coverage targets:

Crypto modules: ≥95%
Storage adapters: ≥90%
Services: ≥85%
MCP servers: ≥80%

Frontend Tests
bash# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# With UI
pnpm test:e2e:ui
Test Organization

tests/unit/: Fast, isolated tests
tests/integration/: Database + Redis tests
tests/e2e/: Full user flows (Playwright)
tests/property/: Hypothesis-based tests
tests/contract/: Schemathesis API tests

Commit Messages
Follow Conventional Commits:
type(scope): subject

body (optional)

footer (optional)
Types:

feat: New feature
fix: Bug fix
docs: Documentation only
style: Formatting, no code change
refactor: Code restructuring
test: Adding/updating tests
chore: Maintenance tasks

Examples:
feat(analyzer): add novelty Bayes ranking algorithm

Implements Bayesian surprise for ranking novel facts.
Closes #123

fix(crypto): correct nonce handling in XChaCha20

The nonce was being reused across encryptions, causing
deterministic output. Now generates random nonce per call.

Fixes #456
License Agreement
By contributing, you agree that:

Your contributions are licensed under both Apache 2.0 and PolyForm Noncommercial 1.0.0 (dual-license)
You have the right to license your contributions
You waive moral rights that would prevent dual licensing
Your name/handle may appear in CONTRIBUTORS.md

See LICENSING.md for details.
Getting Help

Questions: GitHub Discussions
Bugs: GitHub Issues
Chat: (Discord - https://discord.gg/tpx8JgPF)
Email: thecontextcache@gmail.com


Recognition
Contributors will be:

Listed in CONTRIBUTORS.md
Mentioned in release notes
Credited in relevant documentation

Thank you for helping build ContextCache!