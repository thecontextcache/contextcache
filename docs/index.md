# ContextCache Docs

This is the docs home page for ContextCache.

- Start with [Overview](00-overview.md)
- API details: [API Contract](04-api-contract.md)
- Build and run: [Dev Workflow](05-dev-workflow.md)
- Phase planning: [Roadmap](08-roadmap.md)

## Multi-tenant & RBAC

Phase B introduces org-scoped team memory:

- Organizations own projects
- API keys are per-org and stored hashed
- Membership roles enforce route permissions
- Audit logs capture write actions
