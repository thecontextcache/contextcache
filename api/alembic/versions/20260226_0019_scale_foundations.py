"""scale foundations: bigint ids, auth linkage, and query indexes

Revision ID: 20260226_0019
Revises: 20260226_0018
Create Date: 2026-02-26 21:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260226_0019"
down_revision = "20260226_0018"
branch_labels = None
depends_on = None


def _has_column(bind, table_name: str, column_name: str) -> bool:
    insp = sa.inspect(bind)
    return any(c["name"] == column_name for c in insp.get_columns(table_name))


def _is_int4_column(bind, table_name: str, column_name: str) -> bool:
    insp = sa.inspect(bind)
    for c in insp.get_columns(table_name):
        if c["name"] == column_name:
            return c["type"].__class__.__name__.lower() in {"integer", "int4"}
    return False


def _to_bigint(bind, table_name: str, column_name: str) -> None:
    if _is_int4_column(bind, table_name, column_name):
        op.execute(f"ALTER TABLE {table_name} ALTER COLUMN {column_name} TYPE BIGINT")


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # Identity linkage: users.auth_user_id -> auth_users.id
    # ------------------------------------------------------------------
    if not _has_column(bind, "users", "auth_user_id"):
        op.add_column("users", sa.Column("auth_user_id", sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE users u
        SET auth_user_id = au.id
        FROM auth_users au
        WHERE u.auth_user_id IS NULL
          AND lower(u.email) = lower(au.email);
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_auth_user_id'
            ) THEN
                ALTER TABLE users
                ADD CONSTRAINT fk_users_auth_user_id
                FOREIGN KEY (auth_user_id) REFERENCES auth_users(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_auth_user_id
        ON users (auth_user_id)
        WHERE auth_user_id IS NOT NULL;
        """
    )

    # ------------------------------------------------------------------
    # Case-insensitive email uniqueness
    # ------------------------------------------------------------------
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users ((lower(email)));"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_users_email_lower ON auth_users ((lower(email)));"
    )

    # ------------------------------------------------------------------
    # Targeted indexes for hot auth/admin query paths
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_auth_invites_active_email_exp_created
        ON auth_invites ((lower(email)), expires_at DESC, created_at DESC)
        WHERE revoked_at IS NULL AND accepted_at IS NULL;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_audit_logs_org_created_id_desc
        ON audit_logs (org_id, created_at DESC, id DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_api_keys_org_revoked_created_id
        ON api_keys (org_id, revoked_at, created_at DESC, id DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_usage_events_org_created
        ON usage_events (org_id, created_at DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_usage_events_user_created
        ON usage_events (user_id, created_at DESC);
        """
    )

    # ------------------------------------------------------------------
    # Move high-growth standalone ids from INT4 -> BIGINT
    # ------------------------------------------------------------------
    for table_name, column_name in [
        ("api_keys", "id"),
        ("audit_logs", "id"),
        ("recall_logs", "id"),
        ("recall_timings", "id"),
        ("auth_magic_links", "id"),
        ("auth_sessions", "id"),
        ("auth_invites", "id"),
        ("usage_events", "id"),
        ("usage_counters", "id"),
        ("waitlist", "id"),
        ("user_subscriptions", "id"),
        ("org_subscriptions", "id"),
        ("api_key_access_requests", "id"),
    ]:
        _to_bigint(bind, table_name, column_name)


def downgrade() -> None:
    # Keep BIGINT upgrades in place (safe downgrade path for large data).
    op.execute("DROP INDEX IF EXISTS ix_usage_events_user_created;")
    op.execute("DROP INDEX IF EXISTS ix_usage_events_org_created;")
    op.execute("DROP INDEX IF EXISTS ix_api_keys_org_revoked_created_id;")
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_org_created_id_desc;")
    op.execute("DROP INDEX IF EXISTS ix_auth_invites_active_email_exp_created;")
    op.execute("DROP INDEX IF EXISTS uq_auth_users_email_lower;")
    op.execute("DROP INDEX IF EXISTS uq_users_email_lower;")
    op.execute("DROP INDEX IF EXISTS uq_users_auth_user_id;")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_auth_user_id;")
    if _has_column(op.get_bind(), "users", "auth_user_id"):
        op.drop_column("users", "auth_user_id")
