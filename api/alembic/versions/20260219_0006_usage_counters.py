"""usage_counters table for daily per-user limit enforcement

Revision ID: 20260219_0006
Revises: 20260219_0005
Create Date: 2026-02-19 12:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260219_0006"
down_revision = "20260219_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usage_counters",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("memories_created", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("recall_queries", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("projects_created", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["user_id"], ["auth_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "day", name="uq_usage_counters_user_day"),
    )
    op.create_index("ix_usage_counters_id", "usage_counters", ["id"])
    op.create_index("ix_usage_counters_user_id", "usage_counters", ["user_id"])
    op.create_index("ix_usage_counters_day", "usage_counters", ["day"])


def downgrade() -> None:
    op.drop_index("ix_usage_counters_day", table_name="usage_counters")
    op.drop_index("ix_usage_counters_user_id", table_name="usage_counters")
    op.drop_index("ix_usage_counters_id", table_name="usage_counters")
    op.drop_table("usage_counters")
