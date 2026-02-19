# Roadmap

## Current (Alpha)

Completed:
- Invite-only magic-link auth
- Session-protected `/app` and admin workflows
- Admin invite/user/session controls
- Org-scoped APIs with RBAC + audit logs
- Postgres FTS recall (`websearch_to_tsquery` + `ts_rank_cd`)
- Next.js web UI with light/dark theme and legal page

## Next priorities

1. Durable distributed rate limiter (Redis)
2. Admin UX polish (search/filter/pagination)
3. Optional hosted docs URL and custom domain docs deploy
4. Expanded org membership management UI
5. Background analytics jobs and retention controls

## Later

- richer ranking (hybrid FTS + embeddings)
- enterprise auth integrations (SSO/OIDC)
- export integrations and webhooks
