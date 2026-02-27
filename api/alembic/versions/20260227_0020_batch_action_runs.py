"""add batch_action_runs table for idempotent brain batch mutations

Revision ID: 20260227_0020_batch_action_runs
Revises: 20260226_0019
Create Date: 2026-02-27 23:15:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260227_0020_batch_action_runs"
down_revision = "20260226_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "batch_action_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action_id", sa.String(length=64), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("action_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'completed'")),
        sa.Column(
            "response",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", "idempotency_key", name="uq_batch_action_runs_org_idempotency"),
        sa.UniqueConstraint("org_id", "action_id", name="uq_batch_action_runs_org_action"),
    )
    op.create_index("ix_batch_action_runs_org_created", "batch_action_runs", ["org_id", "created_at"])
    op.create_index("ix_batch_action_runs_created_at", "batch_action_runs", ["created_at"])
    op.create_index("ix_batch_action_runs_id", "batch_action_runs", ["id"])


def downgrade() -> None:
    op.drop_index("ix_batch_action_runs_id", table_name="batch_action_runs")
    op.drop_index("ix_batch_action_runs_created_at", table_name="batch_action_runs")
    op.drop_index("ix_batch_action_runs_org_created", table_name="batch_action_runs")
    op.drop_table("batch_action_runs")
