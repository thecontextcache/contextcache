"""auth alpha tables

Revision ID: 20260219_0002
Revises: 20260212_0001
Create Date: 2026-02-19 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260219_0002"
down_revision = "20260212_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_disabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("invite_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invite_token_hash", sa.String(length=64), nullable=True),
        sa.UniqueConstraint("email", name="uq_auth_users_email"),
    )

    op.create_table(
        "auth_magic_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("request_ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("purpose", sa.String(length=32), nullable=False, server_default=sa.text("'login'")),
        sa.Column("send_status", sa.String(length=32), nullable=False, server_default=sa.text("'logged'")),
        sa.UniqueConstraint("token_hash", name="uq_auth_magic_links_token_hash"),
    )

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("device_label", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["auth_users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("session_token_hash", name="uq_auth_sessions_token_hash"),
    )

    op.create_table(
        "auth_invites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("invited_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["auth_users.id"]),
    )

    op.create_table(
        "usage_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ip_prefix", sa.String(length=64), nullable=True),
        sa.Column("user_agent_hash", sa.String(length=64), nullable=True),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["auth_users.id"]),
    )

    op.create_index("idx_auth_magic_links_email", "auth_magic_links", ["email"])
    op.create_index("idx_auth_magic_links_token_hash", "auth_magic_links", ["token_hash"])
    op.create_index("idx_auth_magic_links_expires_at", "auth_magic_links", ["expires_at"])
    op.create_index("idx_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("idx_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_index("idx_auth_invites_email", "auth_invites", ["email"])
    op.create_index("idx_auth_invites_expires_at", "auth_invites", ["expires_at"])
    op.create_index("idx_usage_events_event_type", "usage_events", ["event_type"])
    op.create_index("idx_usage_events_created_at", "usage_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_usage_events_created_at", table_name="usage_events")
    op.drop_index("idx_usage_events_event_type", table_name="usage_events")
    op.drop_index("idx_auth_invites_expires_at", table_name="auth_invites")
    op.drop_index("idx_auth_invites_email", table_name="auth_invites")
    op.drop_index("idx_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_index("idx_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_index("idx_auth_magic_links_expires_at", table_name="auth_magic_links")
    op.drop_index("idx_auth_magic_links_token_hash", table_name="auth_magic_links")
    op.drop_index("idx_auth_magic_links_email", table_name="auth_magic_links")

    op.drop_table("usage_events")
    op.drop_table("auth_invites")
    op.drop_table("auth_sessions")
    op.drop_table("auth_magic_links")
    op.drop_table("auth_users")
