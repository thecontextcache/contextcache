"""add plan catalog and user/org subscriptions

Revision ID: 20260226_0017
Revises: 20260225_0016
Create Date: 2026-02-26 19:15:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260226_0017"
down_revision = "20260225_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_catalog",
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("max_orgs", sa.Integer(), nullable=True),
        sa.Column("max_active_api_keys", sa.Integer(), nullable=True),
        sa.Column("hourly_request_limit", sa.Integer(), nullable=True),
        sa.Column("weekly_request_limit", sa.Integer(), nullable=True),
        sa.Column("monthly_request_limit", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("code"),
    )

    op.create_table(
        "user_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("auth_user_id", sa.Integer(), nullable=False),
        sa.Column("plan_code", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'active'")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["auth_user_id"], ["auth_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_code"], ["plan_catalog.code"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("auth_user_id", name="uq_user_subscriptions_auth_user_id"),
    )
    op.create_index(op.f("ix_user_subscriptions_auth_user_id"), "user_subscriptions", ["auth_user_id"], unique=False)
    op.create_index(op.f("ix_user_subscriptions_plan_code"), "user_subscriptions", ["plan_code"], unique=False)

    op.create_table(
        "org_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("plan_code", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'active'")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_code"], ["plan_catalog.code"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", name="uq_org_subscriptions_org_id"),
    )
    op.create_index(op.f("ix_org_subscriptions_org_id"), "org_subscriptions", ["org_id"], unique=False)
    op.create_index(op.f("ix_org_subscriptions_plan_code"), "org_subscriptions", ["plan_code"], unique=False)

    # Seed plan catalog defaults.
    op.execute(
        """
        INSERT INTO plan_catalog
            (code, name, max_orgs, max_active_api_keys, hourly_request_limit, weekly_request_limit, monthly_request_limit, is_active)
        VALUES
            ('free',  'Free',  3,  3,  0, 0, 0, true),
            ('pro',   'Pro',  10, 10, 0, 0, 0, true),
            ('team',  'Team', NULL, NULL, 0, 0, 0, true),
            ('super', 'Super', NULL, NULL, 0, 0, 0, true)
        ON CONFLICT (code) DO NOTHING;
        """
    )

    # Backfill existing users: global admins -> super, all others -> free.
    op.execute(
        """
        INSERT INTO user_subscriptions (auth_user_id, plan_code, status, started_at, created_at)
        SELECT
            au.id,
            CASE WHEN au.is_admin THEN 'super' ELSE 'free' END,
            'active',
            now(),
            now()
        FROM auth_users au
        ON CONFLICT (auth_user_id) DO NOTHING;
        """
    )

    # Backfill existing orgs as free by default.
    op.execute(
        """
        INSERT INTO org_subscriptions (org_id, plan_code, status, started_at, created_at)
        SELECT
            o.id,
            'free',
            'active',
            now(),
            now()
        FROM organizations o
        ON CONFLICT (org_id) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_org_subscriptions_plan_code"), table_name="org_subscriptions")
    op.drop_index(op.f("ix_org_subscriptions_org_id"), table_name="org_subscriptions")
    op.drop_table("org_subscriptions")

    op.drop_index(op.f("ix_user_subscriptions_plan_code"), table_name="user_subscriptions")
    op.drop_index(op.f("ix_user_subscriptions_auth_user_id"), table_name="user_subscriptions")
    op.drop_table("user_subscriptions")

    op.drop_table("plan_catalog")
