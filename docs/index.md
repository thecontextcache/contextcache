# ContextCache Docs

ContextCache is an invite-only alpha for compiling project memory into useful context for humans and AI systems.

## Start here

- [Overview](00-overview.md)
- [Data Model](03-data-model.md)
- [API Contract](04-api-contract.md)
- [Product Vision](21-product-vision.md)
- [Memory Compiler Architecture](22-memory-compiler-architecture.md)
- [Migration From Recall To Compiler](23-migration-from-recall-to-compiler.md)
- [MIR/1 Spec](24-mir-spec.md)
- [Dev Workflow](05-dev-workflow.md)
- [Security](07-security.md)
- [FK-Safe BIGINT Migration](16-fk-safe-bigint-migration.md)
- [Operations Runbook](17-operations-runbook.md)
- [Legal](legal.md)

## Current product shape

- Magic-link login + session cookie for web UI
- Admin invite controls for alpha access
- API key auth retained for programmatic access
- Org-scoped projects/memories with RBAC and audit logs
- Proprietary recall engine (private package) with stable public API contracts
- Operational cache and retrieval controls exposed via admin endpoints

## Strategic direction

- Historical baseline: [MVP Scope](01-mvp-scope.md)
- Current stable API truth: [API Contract](04-api-contract.md)
- New product center: [Product Vision](21-product-vision.md)
- New system direction: [Memory Compiler Architecture](22-memory-compiler-architecture.md)
- Safe transition plan: [Migration From Recall To Compiler](23-migration-from-recall-to-compiler.md)
- Canonical compiler schema: [MIR/1 Spec](24-mir-spec.md)
