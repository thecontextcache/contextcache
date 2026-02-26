BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_auth_user_id;
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_auth_user_id_bigint;

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_user_id_fkey;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS fk_memberships_user_id_bigint;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_created_by_user_id_fkey;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_created_by_user_id_bigint;

ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_created_by_user_id_fkey;
ALTER TABLE memories DROP CONSTRAINT IF EXISTS fk_memories_created_by_user_id_bigint;

ALTER TABLE recall_logs DROP CONSTRAINT IF EXISTS recall_logs_actor_user_id_fkey;
ALTER TABLE recall_logs DROP CONSTRAINT IF EXISTS fk_recall_logs_actor_user_id_bigint;

ALTER TABLE recall_timings DROP CONSTRAINT IF EXISTS recall_timings_actor_user_id_fkey;
ALTER TABLE recall_timings DROP CONSTRAINT IF EXISTS fk_recall_timings_actor_user_id_bigint;

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS fk_audit_logs_actor_user_id_bigint;

ALTER TABLE api_key_access_requests DROP CONSTRAINT IF EXISTS api_key_access_requests_requester_user_id_fkey;
ALTER TABLE api_key_access_requests DROP CONSTRAINT IF EXISTS fk_akar_requester_user_id_bigint;
ALTER TABLE api_key_access_requests DROP CONSTRAINT IF EXISTS api_key_access_requests_reviewed_by_user_id_fkey;
ALTER TABLE api_key_access_requests DROP CONSTRAINT IF EXISTS fk_akar_reviewed_by_user_id_bigint;

ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_user_id_fkey;
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS fk_auth_sessions_user_id_bigint;

ALTER TABLE auth_login_events DROP CONSTRAINT IF EXISTS auth_login_events_user_id_fkey;
ALTER TABLE auth_login_events DROP CONSTRAINT IF EXISTS fk_auth_login_events_user_id_bigint;

ALTER TABLE auth_invites DROP CONSTRAINT IF EXISTS auth_invites_invited_by_user_id_fkey;
ALTER TABLE auth_invites DROP CONSTRAINT IF EXISTS fk_auth_invites_invited_by_user_id_bigint;

ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_user_id_fkey;
ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS fk_usage_events_user_id_bigint;

ALTER TABLE usage_counters DROP CONSTRAINT IF EXISTS usage_counters_user_id_fkey;
ALTER TABLE usage_counters DROP CONSTRAINT IF EXISTS fk_usage_counters_user_id_bigint;

ALTER TABLE usage_periods DROP CONSTRAINT IF EXISTS usage_periods_user_id_fkey;
ALTER TABLE usage_periods DROP CONSTRAINT IF EXISTS fk_usage_periods_user_id_bigint;

ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_auth_user_id_fkey;
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS fk_user_subscriptions_auth_user_id_bigint;

ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_reviewed_by_admin_id_fkey;
ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS fk_waitlist_reviewed_by_admin_id_bigint;

ALTER TABLE auth_users DROP CONSTRAINT IF EXISTS auth_users_pkey;
ALTER TABLE auth_users ALTER COLUMN id_bigint SET NOT NULL;
ALTER TABLE auth_users ALTER COLUMN id_bigint SET DEFAULT nextval('auth_users_id_seq'::regclass);
ALTER TABLE auth_users RENAME COLUMN id TO id_int4;
ALTER TABLE auth_users RENAME COLUMN id_bigint TO id;
ALTER TABLE auth_users ADD CONSTRAINT auth_users_pkey PRIMARY KEY (id);
DROP INDEX IF EXISTS uq_auth_users_id_bigint;
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_users_id ON auth_users(id);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE users ALTER COLUMN id_bigint SET NOT NULL;
ALTER TABLE users ALTER COLUMN id_bigint SET DEFAULT nextval('users_id_seq'::regclass);
ALTER TABLE users RENAME COLUMN id TO id_int4;
ALTER TABLE users RENAME COLUMN id_bigint TO id;
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
DROP INDEX IF EXISTS uq_users_id_bigint;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_id ON users(id);

DROP INDEX IF EXISTS uq_users_auth_user_id;
DROP INDEX IF EXISTS ix_users_auth_user_id_bigint;
ALTER TABLE users RENAME COLUMN auth_user_id TO auth_user_id_int4;
ALTER TABLE users RENAME COLUMN auth_user_id_bigint TO auth_user_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_auth_user_id ON users(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_users_auth_user_id ON users(auth_user_id);

ALTER TABLE memberships RENAME COLUMN user_id TO user_id_int4;
ALTER TABLE memberships RENAME COLUMN user_id_bigint TO user_id;
ALTER TABLE memberships ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE projects RENAME COLUMN created_by_user_id TO created_by_user_id_int4;
ALTER TABLE projects RENAME COLUMN created_by_user_id_bigint TO created_by_user_id;
ALTER TABLE projects ADD CONSTRAINT projects_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE memories RENAME COLUMN created_by_user_id TO created_by_user_id_int4;
ALTER TABLE memories RENAME COLUMN created_by_user_id_bigint TO created_by_user_id;
ALTER TABLE memories ADD CONSTRAINT memories_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE recall_logs RENAME COLUMN actor_user_id TO actor_user_id_int4;
ALTER TABLE recall_logs RENAME COLUMN actor_user_id_bigint TO actor_user_id;
ALTER TABLE recall_logs ADD CONSTRAINT recall_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE recall_timings RENAME COLUMN actor_user_id TO actor_user_id_int4;
ALTER TABLE recall_timings RENAME COLUMN actor_user_id_bigint TO actor_user_id;
ALTER TABLE recall_timings ADD CONSTRAINT recall_timings_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE audit_logs RENAME COLUMN actor_user_id TO actor_user_id_int4;
ALTER TABLE audit_logs RENAME COLUMN actor_user_id_bigint TO actor_user_id;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);

ALTER TABLE api_key_access_requests RENAME COLUMN requester_user_id TO requester_user_id_int4;
ALTER TABLE api_key_access_requests RENAME COLUMN requester_user_id_bigint TO requester_user_id;
ALTER TABLE api_key_access_requests RENAME COLUMN reviewed_by_user_id TO reviewed_by_user_id_int4;
ALTER TABLE api_key_access_requests RENAME COLUMN reviewed_by_user_id_bigint TO reviewed_by_user_id;
ALTER TABLE api_key_access_requests ADD CONSTRAINT api_key_access_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE api_key_access_requests ADD CONSTRAINT api_key_access_requests_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE auth_sessions RENAME COLUMN user_id TO user_id_int4;
ALTER TABLE auth_sessions RENAME COLUMN user_id_bigint TO user_id;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE auth_login_events RENAME COLUMN user_id TO user_id_int4;
ALTER TABLE auth_login_events RENAME COLUMN user_id_bigint TO user_id;
ALTER TABLE auth_login_events ADD CONSTRAINT auth_login_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE auth_invites RENAME COLUMN invited_by_user_id TO invited_by_user_id_int4;
ALTER TABLE auth_invites RENAME COLUMN invited_by_user_id_bigint TO invited_by_user_id;
ALTER TABLE auth_invites ADD CONSTRAINT auth_invites_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES auth_users(id);

ALTER TABLE usage_events RENAME COLUMN user_id TO user_id_int4;
ALTER TABLE usage_events RENAME COLUMN user_id_bigint TO user_id;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id);

ALTER TABLE usage_counters DROP CONSTRAINT IF EXISTS uq_usage_counters_user_day;
ALTER TABLE usage_counters RENAME COLUMN user_id TO user_id_int4;
ALTER TABLE usage_counters RENAME COLUMN user_id_bigint TO user_id;
ALTER TABLE usage_counters ADD CONSTRAINT usage_counters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE usage_counters ADD CONSTRAINT uq_usage_counters_user_day UNIQUE (user_id, day);

ALTER TABLE usage_periods DROP CONSTRAINT IF EXISTS uq_usage_periods_user_period;
ALTER TABLE usage_periods RENAME COLUMN user_id TO user_id_int4;
ALTER TABLE usage_periods RENAME COLUMN user_id_bigint TO user_id;
ALTER TABLE usage_periods ADD CONSTRAINT usage_periods_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE usage_periods ADD CONSTRAINT uq_usage_periods_user_period UNIQUE (user_id, period_start);

ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS uq_user_subscriptions_auth_user_id;
ALTER TABLE user_subscriptions RENAME COLUMN auth_user_id TO auth_user_id_int4;
ALTER TABLE user_subscriptions RENAME COLUMN auth_user_id_bigint TO auth_user_id;
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE user_subscriptions ADD CONSTRAINT uq_user_subscriptions_auth_user_id UNIQUE (auth_user_id);

ALTER TABLE waitlist RENAME COLUMN reviewed_by_admin_id TO reviewed_by_admin_id_int4;
ALTER TABLE waitlist RENAME COLUMN reviewed_by_admin_id_bigint TO reviewed_by_admin_id;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_reviewed_by_admin_id_fkey FOREIGN KEY (reviewed_by_admin_id) REFERENCES auth_users(id) ON DELETE SET NULL;

COMMIT;
