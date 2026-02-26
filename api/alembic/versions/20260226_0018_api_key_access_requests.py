"""add api key access request workflow

Revision ID: 20260226_0018
Revises: 20260226_0017
Create Date: 2026-02-26 20:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260226_0018"
down_revision = "20260226_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_key_access_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("requester_user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requester_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_api_key_access_requests_org_status_created",
        "api_key_access_requests",
        ["org_id", "status", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_api_key_access_requests_requester_status_created",
        "api_key_access_requests",
        ["requester_user_id", "status", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_api_key_access_requests_reviewed_by_user_id",
        "api_key_access_requests",
        ["reviewed_by_user_id"],
        unique=False,
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_api_key_access_requests_pending_per_requester
        ON api_key_access_requests (org_id, requester_user_id)
        WHERE status = 'pending';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_api_key_access_requests_pending_per_requester;")
    op.drop_index("ix_api_key_access_requests_reviewed_by_user_id", table_name="api_key_access_requests")
    op.drop_index("ix_api_key_access_requests_requester_status_created", table_name="api_key_access_requests")
    op.drop_index("ix_api_key_access_requests_org_status_created", table_name="api_key_access_requests")
    op.drop_table("api_key_access_requests")
