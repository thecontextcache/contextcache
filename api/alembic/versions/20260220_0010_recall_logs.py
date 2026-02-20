"""add recall_logs table for algorithm decision traces

Revision ID: 20260220_0010
Revises: 20260219_0009
Create Date: 2026-02-20 01:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260220_0010"
down_revision = "20260219_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recall_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("strategy", sa.String(length=32), nullable=False),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("input_memory_ids", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("ranked_memory_ids", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("weights", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("score_details", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recall_logs_id", "recall_logs", ["id"])
    op.create_index("ix_recall_logs_org_id", "recall_logs", ["org_id"])
    op.create_index("ix_recall_logs_project_id", "recall_logs", ["project_id"])
    op.create_index("ix_recall_logs_actor_user_id", "recall_logs", ["actor_user_id"])
    op.create_index("ix_recall_logs_org_created", "recall_logs", ["org_id", "created_at"])
    op.create_index("ix_recall_logs_project_created", "recall_logs", ["project_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_recall_logs_project_created", table_name="recall_logs")
    op.drop_index("ix_recall_logs_org_created", table_name="recall_logs")
    op.drop_index("ix_recall_logs_actor_user_id", table_name="recall_logs")
    op.drop_index("ix_recall_logs_project_id", table_name="recall_logs")
    op.drop_index("ix_recall_logs_org_id", table_name="recall_logs")
    op.drop_index("ix_recall_logs_id", table_name="recall_logs")
    op.drop_table("recall_logs")
