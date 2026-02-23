"""add raw_captures and inbox_items tables (Refinery pipeline)

Revision ID: 20260223_0013
Revises: 20260220_0012
Create Date: 2026-02-23 12:00:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260223_0013"
down_revision = "20260220_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # ── raw_captures ──────────────────────────────────────────────────────────
    if "raw_captures" not in existing_tables:
        op.create_table(
            "raw_captures",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=True),
            sa.Column("source", sa.String(50), nullable=False),
            sa.Column("payload", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column(
                "captured_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_raw_captures_id", "raw_captures", ["id"])
        op.create_index("ix_raw_captures_org_id", "raw_captures", ["org_id"])
        op.create_index("ix_raw_captures_project_id", "raw_captures", ["project_id"])
        op.create_index("ix_raw_captures_source", "raw_captures", ["source"])
        op.create_index("ix_raw_captures_captured_at", "raw_captures", ["captured_at"])
        op.create_index("ix_raw_captures_processed_at", "raw_captures", ["processed_at"])

    # ── inbox_items ───────────────────────────────────────────────────────────
    if "inbox_items" not in existing_tables:
        op.create_table(
            "inbox_items",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("raw_capture_id", sa.Integer(), nullable=True),
            sa.Column("promoted_memory_id", sa.Integer(), nullable=True),
            sa.Column("suggested_type", sa.String(50), nullable=False),
            sa.Column("suggested_title", sa.String(500), nullable=True),
            sa.Column("suggested_content", sa.Text(), nullable=False),
            sa.Column(
                "confidence_score",
                sa.Float(),
                nullable=False,
                server_default=sa.text("0.8"),
            ),
            sa.Column(
                "status",
                sa.String(20),
                nullable=False,
                server_default=sa.text("'pending'"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["raw_capture_id"], ["raw_captures.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["promoted_memory_id"], ["memories.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_inbox_items_id", "inbox_items", ["id"])
        op.create_index("ix_inbox_items_project_id", "inbox_items", ["project_id"])
        op.create_index("ix_inbox_items_raw_capture_id", "inbox_items", ["raw_capture_id"])
        op.create_index("ix_inbox_items_promoted_memory_id", "inbox_items", ["promoted_memory_id"])
        op.create_index("ix_inbox_items_status", "inbox_items", ["status"])
        op.create_index("ix_inbox_items_created_at", "inbox_items", ["created_at"])
        op.create_index(
            "ix_inbox_items_project_status",
            "inbox_items",
            ["project_id", "status"],
        )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_inbox_items_project_status")
    op.execute("DROP INDEX IF EXISTS ix_inbox_items_created_at")
    op.execute("DROP INDEX IF EXISTS ix_inbox_items_status")
    op.execute("DROP INDEX IF EXISTS ix_inbox_items_promoted_memory_id")
    op.execute("DROP INDEX IF EXISTS ix_inbox_items_raw_capture_id")
    op.execute("DROP INDEX IF EXISTS ix_inbox_items_project_id")
    op.execute("DROP INDEX IF EXISTS ix_inbox_items_id")
    op.execute("DROP TABLE IF EXISTS inbox_items")

    op.execute("DROP INDEX IF EXISTS ix_raw_captures_processed_at")
    op.execute("DROP INDEX IF EXISTS ix_raw_captures_captured_at")
    op.execute("DROP INDEX IF EXISTS ix_raw_captures_source")
    op.execute("DROP INDEX IF EXISTS ix_raw_captures_project_id")
    op.execute("DROP INDEX IF EXISTS ix_raw_captures_org_id")
    op.execute("DROP INDEX IF EXISTS ix_raw_captures_id")
    op.execute("DROP TABLE IF EXISTS raw_captures")
