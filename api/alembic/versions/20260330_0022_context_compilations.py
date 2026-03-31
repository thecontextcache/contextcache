"""add context compilation persistence tables

Revision ID: 20260330_0022_context_compilations
Revises: 20260320_0021_ingest_reliability_and_batch_request
Create Date: 2026-03-30 14:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260330_0022_context_compilations"
down_revision = "20260320_0021_ingest_reliability_and_batch_request"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "context_compilations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("query_text", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("target_model", sa.String(length=120), nullable=True),
        sa.Column("target_tool", sa.String(length=120), nullable=True),
        sa.Column("target_format", sa.String(length=32), nullable=False),
        sa.Column("token_budget", sa.Integer(), nullable=True),
        sa.Column("compilation_text", sa.Text(), nullable=True),
        sa.Column(
            "compilation_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("served_by", sa.String(length=16), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'completed'")),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_context_compilations_org_created", "context_compilations", ["org_id", "created_at"])
    op.create_index("ix_context_compilations_project_created", "context_compilations", ["project_id", "created_at"])
    op.create_index("ix_context_compilations_actor_created", "context_compilations", ["actor_user_id", "created_at"])

    op.create_table(
        "context_compilation_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("compilation_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column("token_estimate", sa.Integer(), nullable=True),
        sa.Column("why_included", sa.Text(), nullable=True),
        sa.Column("source_kind", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["compilation_id"], ["context_compilations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_context_compilation_items_compilation_rank",
        "context_compilation_items",
        ["compilation_id", "rank"],
    )
    op.create_index(
        "ix_context_compilation_items_entity",
        "context_compilation_items",
        ["entity_type", "entity_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_context_compilation_items_entity", table_name="context_compilation_items")
    op.drop_index("ix_context_compilation_items_compilation_rank", table_name="context_compilation_items")
    op.drop_table("context_compilation_items")
    op.drop_index("ix_context_compilations_actor_created", table_name="context_compilations")
    op.drop_index("ix_context_compilations_project_created", table_name="context_compilations")
    op.drop_index("ix_context_compilations_org_created", table_name="context_compilations")
    op.drop_table("context_compilations")
