"""add ingest reliability fields and batch request storage

Revision ID: 20260320_0021_ingest_reliability_and_batch_request
Revises: 20260227_0020_batch_action_runs
Create Date: 2026-03-20 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260320_0021_ingest_reliability_and_batch_request"
down_revision = "20260227_0020_batch_action_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "batch_action_runs",
        sa.Column(
            "request",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    op.add_column("raw_captures", sa.Column("idempotency_key", sa.String(length=128), nullable=True))
    op.add_column(
        "raw_captures",
        sa.Column("processing_status", sa.String(length=20), nullable=False, server_default=sa.text("'queued'")),
    )
    op.add_column(
        "raw_captures",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column("raw_captures", sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("raw_captures", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column("raw_captures", sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("raw_captures", sa.Column("dead_lettered_at", sa.DateTime(timezone=True), nullable=True))

    op.create_index("ix_raw_captures_idempotency_key", "raw_captures", ["idempotency_key"])
    op.create_index(
        "ix_raw_captures_org_status_captured",
        "raw_captures",
        ["org_id", "processing_status", "captured_at"],
    )
    op.create_unique_constraint(
        "uq_raw_captures_org_idempotency",
        "raw_captures",
        ["org_id", "idempotency_key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_raw_captures_org_idempotency", "raw_captures", type_="unique")
    op.drop_index("ix_raw_captures_org_status_captured", table_name="raw_captures")
    op.drop_index("ix_raw_captures_idempotency_key", table_name="raw_captures")
    op.drop_column("raw_captures", "dead_lettered_at")
    op.drop_column("raw_captures", "last_error_at")
    op.drop_column("raw_captures", "last_error")
    op.drop_column("raw_captures", "processing_started_at")
    op.drop_column("raw_captures", "attempt_count")
    op.drop_column("raw_captures", "processing_status")
    op.drop_column("raw_captures", "idempotency_key")
    op.drop_column("batch_action_runs", "request")
