"""auth_login_events table for last-10 login IP tracking

Revision ID: 20260219_0005
Revises: 20260219_0003
Create Date: 2026-02-19 10:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import INET

revision = "20260219_0005"
down_revision = "20260219_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_login_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("ip", INET(), nullable=False),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["auth_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_auth_login_events_user_id",
        "auth_login_events",
        ["user_id"],
    )
    op.create_index(
        "ix_auth_login_events_user_created",
        "auth_login_events",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_auth_login_events_created_at",
        "auth_login_events",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_auth_login_events_created_at", table_name="auth_login_events")
    op.drop_index("ix_auth_login_events_user_created", table_name="auth_login_events")
    op.drop_index("ix_auth_login_events_user_id", table_name="auth_login_events")
    op.drop_table("auth_login_events")
