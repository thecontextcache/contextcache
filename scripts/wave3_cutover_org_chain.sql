-- Wave 3A: cut over org FK chain from *_bigint shadow columns to canonical column names.
-- Run against contextcache_dev after Wave 2 (all fk_*_bigint validated = true).

BEGIN;

-- 0) Drop org child FKs first so organizations PK can be replaced.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_org_id_fkey;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_org_id_bigint;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_org_id_fkey;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS fk_memberships_org_id_bigint;
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_org_id_fkey;
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS fk_api_keys_org_id_bigint;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_org_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS fk_audit_logs_org_id_bigint;
ALTER TABLE raw_captures DROP CONSTRAINT IF EXISTS raw_captures_org_id_fkey;
ALTER TABLE raw_captures DROP CONSTRAINT IF EXISTS fk_raw_captures_org_id_bigint;
ALTER TABLE recall_logs DROP CONSTRAINT IF EXISTS recall_logs_org_id_fkey;
ALTER TABLE recall_logs DROP CONSTRAINT IF EXISTS fk_recall_logs_org_id_bigint;
ALTER TABLE recall_timings DROP CONSTRAINT IF EXISTS recall_timings_org_id_fkey;
ALTER TABLE recall_timings DROP CONSTRAINT IF EXISTS fk_recall_timings_org_id_bigint;
ALTER TABLE org_subscriptions DROP CONSTRAINT IF EXISTS org_subscriptions_org_id_fkey;
ALTER TABLE org_subscriptions DROP CONSTRAINT IF EXISTS fk_org_subscriptions_org_id_bigint;
ALTER TABLE api_key_access_requests DROP CONSTRAINT IF EXISTS api_key_access_requests_org_id_fkey;
ALTER TABLE api_key_access_requests DROP CONSTRAINT IF EXISTS fk_akar_org_id_bigint;

-- 1) Parent organizations: promote id_bigint -> id
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_pkey;
ALTER TABLE organizations ALTER COLUMN id_bigint SET NOT NULL;
ALTER TABLE organizations ALTER COLUMN id_bigint SET DEFAULT nextval('organizations_id_seq'::regclass);
ALTER TABLE organizations RENAME COLUMN id TO id_int4;
ALTER TABLE organizations RENAME COLUMN id_bigint TO id;
ALTER TABLE organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
DROP INDEX IF EXISTS uq_organizations_id_bigint;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_id ON organizations(id);

-- 2) projects
ALTER TABLE projects RENAME COLUMN org_id TO org_id_int4;
ALTER TABLE projects RENAME COLUMN org_id_bigint TO org_id;
ALTER TABLE projects ADD CONSTRAINT projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS ix_projects_org_id_bigint;
CREATE INDEX IF NOT EXISTS ix_projects_org_id ON projects(org_id);

-- 3) memberships
ALTER TABLE memberships RENAME COLUMN org_id TO org_id_int4;
ALTER TABLE memberships RENAME COLUMN org_id_bigint TO org_id;
ALTER TABLE memberships ADD CONSTRAINT memberships_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS ix_memberships_org_id_bigint;
CREATE INDEX IF NOT EXISTS ix_memberships_org_id ON memberships(org_id);

-- 4) api_keys
ALTER TABLE api_keys RENAME COLUMN org_id TO org_id_int4;
ALTER TABLE api_keys RENAME COLUMN org_id_bigint TO org_id;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS ix_api_keys_org_id_bigint;
CREATE INDEX IF NOT EXISTS ix_api_keys_org_id ON api_keys(org_id);

-- 5) audit_logs
ALTER TABLE audit_logs RENAME COLUMN org_id TO org_id_int4;
ALTER TABLE audit_logs RENAME COLUMN org_id_bigint TO org_id;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS ix_audit_logs_org_id_bigint;
CREATE INDEX IF NOT EXISTS ix_audit_logs_org_id ON audit_logs(org_id);

-- 6) raw_captures
ALTER TABLE raw_captures RENAME COLUMN org_id TO org_id_int4;
ALTER TABLE raw_captures RENAME COLUMN org_id_bigint TO org_id;
ALTER TABLE raw_captures ADD CONSTRAINT raw_captures_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS ix_raw_captures_org_id_bigint;
CREATE INDEX IF NOT EXISTS ix_raw_captures_org_id ON raw_captures(org_id);

-- 7) recall_logs
ALTER TABLE recall_logs RENAME COLUMN org_id TO org_id_int4;
ALTER TABLE recall_logs RENAME COLUMN org_id_bigint TO org_id;
ALTER TABLE recall_logs ADD CONSTRAINT recall_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS ix_recall_logs_org_id_bigint;
CREATE INDEX IF NOT EXISTS ix_recall_logs_org_id ON recall_logs(org_id);

-- 8) recall_timings
ALTER TABLE recall_timings RENAME COLUMN org_id TO org_id_int4;
ALTER TABLE recall_timings RENAME COLUMN org_id_bigint TO org_id;
ALTER TABLE recall_timings ADD CONSTRAINT recall_timings_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS ix_recall_timings_org_id_bigint;
CREATE INDEX IF NOT EXISTS ix_recall_timings_org_id ON recall_timings(org_id);

-- 9) org_subscriptions
ALTER TABLE org_subscriptions DROP CONSTRAINT IF EXISTS uq_org_subscriptions_org_id;
ALTER TABLE org_subscriptions RENAME COLUMN org_id TO org_id_int4;
ALTER TABLE org_subscriptions RENAME COLUMN org_id_bigint TO org_id;
ALTER TABLE org_subscriptions ADD CONSTRAINT org_subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE org_subscriptions ADD CONSTRAINT uq_org_subscriptions_org_id UNIQUE (org_id);
DROP INDEX IF EXISTS ix_org_subscriptions_org_id_bigint;
CREATE INDEX IF NOT EXISTS ix_org_subscriptions_org_id ON org_subscriptions(org_id);

-- 10) api_key_access_requests
ALTER TABLE api_key_access_requests DROP CONSTRAINT IF EXISTS uq_api_key_access_requests_pending_per_requester;
DROP INDEX IF EXISTS uq_api_key_access_requests_pending_per_requester;
ALTER TABLE api_key_access_requests RENAME COLUMN org_id TO org_id_int4;
ALTER TABLE api_key_access_requests RENAME COLUMN org_id_bigint TO org_id;
ALTER TABLE api_key_access_requests ADD CONSTRAINT api_key_access_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_key_access_requests_pending_per_requester
  ON api_key_access_requests (org_id, requester_user_id)
  WHERE status = 'pending';
DROP INDEX IF EXISTS ix_akar_org_id_bigint;
CREATE INDEX IF NOT EXISTS ix_api_key_access_requests_org_id ON api_key_access_requests(org_id);

COMMIT;
