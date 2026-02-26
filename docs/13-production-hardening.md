# Production Hardening

> **Status:** Active runbook for production reliability and security.

This document keeps operational guidance public while excluding proprietary
retrieval internals.

---

## Deployment Safety Checklist

- Use pinned image tags for all services.
- Run migrations as part of API startup.
- Keep `.env` values in a secrets manager or host-level secure store.
- Validate health endpoints after every deploy.
- Keep a rollback-ready previous image tag.

## Runtime Safety Checklist

- Enable structured logs for API and worker services.
- Alert on API 5xx spikes and worker restart loops.
- Keep database backups on a tested schedule.
- Enforce least-privilege access for infra credentials.
- Rotate API and provider secrets on a fixed cadence.

## Incident Response

1. Declare incident severity and owner.
2. Capture first-failure timestamp and affected endpoints.
3. Freeze risky deploys until root cause is identified.
4. Apply fix behind feature flags when possible.
5. Verify recovery via health checks and key user flows.
6. Publish a short post-incident summary with action items.

## Post-Deploy Verification

- Web loads and auth flow completes.
- API `/health` returns `ok`.
- Project list and memory create/recall flows succeed.
- Worker and beat are healthy when enabled.
- Admin pages load with no 5xx responses.

## Hardening Backlog

- Add canary deploy path for API containers.
- Add SLO dashboard for recall latency and error rate.
- Add automated disaster-recovery drill for backups.
- Add periodic secret-rotation audit task.
