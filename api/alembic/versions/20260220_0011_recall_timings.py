"""add recall_timings table for hedge latency metrics

Revision ID: 20260220_0011
Revises: 20260220_0010
Create Date: 2026-02-20 02:10:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260220_0011"
down_revision = "20260220_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recall_timings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("served_by", sa.String(length=16), nullable=False),
        sa.Column("strategy", sa.String(length=32), nullable=False),
        sa.Column("hedge_delay_ms", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("cag_duration_ms", sa.Integer(), nullable=True),
        sa.Column("rag_duration_ms", sa.Integer(), nullable=True),
        sa.Column("total_duration_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recall_timings_id", "recall_timings", ["id"])
    op.create_index("ix_recall_timings_org_id", "recall_timings", ["org_id"])
    op.create_index("ix_recall_timings_project_id", "recall_timings", ["project_id"])
    op.create_index("ix_recall_timings_actor_user_id", "recall_timings", ["actor_user_id"])
    op.create_index("ix_recall_timings_org_created", "recall_timings", ["org_id", "created_at"])
    op.create_index("ix_recall_timings_served_by_created", "recall_timings", ["served_by", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_recall_timings_served_by_created", table_name="recall_timings")
    op.drop_index("ix_recall_timings_org_created", table_name="recall_timings")
    op.drop_index("ix_recall_timings_actor_user_id", table_name="recall_timings")
    op.drop_index("ix_recall_timings_project_id", table_name="recall_timings")
    op.drop_index("ix_recall_timings_org_id", table_name="recall_timings")
    op.drop_index("ix_recall_timings_id", table_name="recall_timings")
    op.drop_table("recall_timings")
