# FK-Safe BIGINT Migration

Status: Planned (execute wave-by-wave).

Purpose:
- Upgrade remaining `INT` PK/FK chains to `BIGINT` without service interruption.
- Keep strict tenant integrity and reversible checkpoints.

Scope:
- Applies to high-growth relational chains (parent PK + child FKs).
- Excludes already-upgraded standalone IDs from migration `20260226_0019`.

## Safety Rules

1. Never run a full-chain type swap in one deploy.
2. Always add parallel bigint columns first.
3. Backfill in bounded batches with row-count parity checks.
4. Add new FKs as `NOT VALID`, then `VALIDATE CONSTRAINT`.
5. Keep one release window where old and new columns co-exist.
6. Cut over app reads/writes before dropping old columns.

## Wave Plan

### Wave 0: Inventory + Baseline

Goal:
- Build an exact FK dependency graph and table-size baseline.

Run:
```bash
cd /Users/nd/Documents/contextcache
./scripts/check_bigint_preflight.sh
```

Gate to proceed:
- FK graph saved.
- Duplicate/consistency checks are clean.
- Full DB backup completed.

Rollback:
- None required (read-only phase).

### Wave 1: Add Parallel BIGINT Columns

Goal:
- Add `<col>_bigint` to each remaining chain (PKs and all referencing FKs).

Pattern:
1. Add parent `<id_bigint BIGINT>`.
2. Add child `<parent_id_bigint BIGINT>`.
3. Add indexes on new child bigint FKs.
4. Add dual-write trigger (old <-> new) for new writes.

Gate to proceed:
- Inserts/updates keep old/new values in sync.
- No API regression in smoke tests.

Rollback:
- Drop triggers and new bigint columns.

### Wave 2: Batched Backfill

Goal:
- Copy old int values into new bigint columns safely.

Pattern:
- Backfill by key-range batches (for example 50k-200k rows/batch).
- Commit each batch.
- Record progress cursor.

Gate to proceed:
- `count(*) where old::bigint != new` is zero for each table.

Rollback:
- Re-run batch from last cursor or disable dual-write and revert app writes.

### Wave 3: Add/Validate Constraints on BIGINT

Goal:
- Enforce FK integrity on new bigint columns before cutover.

Pattern:
1. Add FK constraints as `NOT VALID`.
2. `VALIDATE CONSTRAINT` during low traffic window.
3. Add unique/PK candidates for new parent bigint IDs.

Gate to proceed:
- All new constraints validated.
- Query plans stable with new indexes.

Rollback:
- Drop new constraints; continue using old int columns.

### Wave 4: Application Cutover

Goal:
- Switch application and queries to bigint columns.

Pattern:
1. Deploy app version reading/writing bigint columns.
2. Keep old columns for one release.
3. Monitor error rate, lock waits, slow queries.

Gate to proceed:
- 24h clean operation (or your defined window).

Rollback:
- Deploy previous app; keep dual-write on.

### Wave 5: Finalize Schema

Goal:
- Remove old int columns and legacy constraints.

Pattern:
1. Rename bigint columns to canonical names.
2. Recreate FK names and indexes with canonical naming.
3. Drop old int columns and old triggers.

Gate to complete:
- All integrity and latency checks pass.

Rollback:
- Restore from backup snapshot if post-finalization defects appear.

## Per-Wave Checklists

### Pre-Deploy Checklist
- DB backup completed and restore test is recent.
- Migration reviewed in staging with production-like data volume.
- Lock timeout configured for DDL commands.
- Incident owner assigned.

### Post-Deploy Checklist
- API `/health` is `ok`.
- Worker + beat are stable.
- Core flows work:
  - login
  - org/project list
  - create memory
  - recall
  - invite
- DB checks show parity and valid constraints.

## Recommended Order for Remaining Chains

1. `users.id` chain:
- `memberships.user_id`
- `projects.created_by_user_id`
- `memories.created_by_user_id`
- `audit_logs.actor_user_id`
- `recall_logs.actor_user_id`
- `recall_timings.actor_user_id`
- `api_key_access_requests.requester_user_id`
- `api_key_access_requests.reviewed_by_user_id`

2. `organizations.id` chain:
- `memberships.org_id`
- `projects.org_id`
- `api_keys.org_id`
- `audit_logs.org_id`
- `recall_logs.org_id`
- `recall_timings.org_id`
- `raw_captures.org_id`
- `api_key_access_requests.org_id`

3. `projects.id` chain:
- `memories.project_id`
- `tags.project_id`
- `inbox_items.project_id`
- `raw_captures.project_id`
- `recall_logs.project_id`
- `recall_timings.project_id`

## SQL Probes

Use:
- `/Users/nd/Documents/contextcache/scripts/db_fk_inventory.sql`
- `/Users/nd/Documents/contextcache/scripts/check_bigint_preflight.sh`

These provide:
- FK graph and table-size ranking
- remaining int PK/FK candidates
- duplicate email safety checks

