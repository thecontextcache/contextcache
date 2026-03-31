"""add query profiles and retrieval feedback tables

Revision ID: 20260331_0023_query_profiles_and_retrieval_feedback
Revises: 20260330_0022_context_compilations
Create Date: 2026-03-31 10:15:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260331_0023_query_profiles_and_retrieval_feedback"
down_revision = "20260330_0022_context_compilations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "query_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("normalized_query", sa.String(length=500), nullable=False),
        sa.Column("sample_query", sa.Text(), nullable=False),
        sa.Column("preferred_target_format", sa.String(length=32), nullable=True),
        sa.Column("last_target_format", sa.String(length=32), nullable=True),
        sa.Column("last_strategy", sa.String(length=32), nullable=True),
        sa.Column("last_served_by", sa.String(length=16), nullable=True),
        sa.Column("total_queries", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("helpful_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("wrong_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("stale_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("removed_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("pinned_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_compilation_id", sa.Integer(), nullable=True),
        sa.Column("last_queried_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_feedback_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["last_compilation_id"], ["context_compilations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "normalized_query", name="uq_query_profiles_project_normalized_query"),
    )
    op.create_index("ix_query_profiles_org_project_updated", "query_profiles", ["org_id", "project_id", "updated_at"])
    op.create_index(op.f("ix_query_profiles_actor_user_id"), "query_profiles", ["actor_user_id"], unique=False)
    op.create_index(op.f("ix_query_profiles_last_compilation_id"), "query_profiles", ["last_compilation_id"], unique=False)
    op.create_index(op.f("ix_query_profiles_last_feedback_at"), "query_profiles", ["last_feedback_at"], unique=False)
    op.create_index(op.f("ix_query_profiles_last_queried_at"), "query_profiles", ["last_queried_at"], unique=False)
    op.create_index(op.f("ix_query_profiles_created_at"), "query_profiles", ["created_at"], unique=False)
    op.create_index(op.f("ix_query_profiles_updated_at"), "query_profiles", ["updated_at"], unique=False)
    op.create_index(op.f("ix_query_profiles_org_id"), "query_profiles", ["org_id"], unique=False)
    op.create_index(op.f("ix_query_profiles_project_id"), "query_profiles", ["project_id"], unique=False)

    op.create_table(
        "retrieval_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("compilation_id", sa.Integer(), nullable=False),
        sa.Column("query_profile_id", sa.Integer(), nullable=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False, server_default=sa.text("'memory'")),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(length=32), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["compilation_id"], ["context_compilations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["query_profile_id"], ["query_profiles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_retrieval_feedback_compilation_created", "retrieval_feedback", ["compilation_id", "created_at"])
    op.create_index("ix_retrieval_feedback_query_profile_created", "retrieval_feedback", ["query_profile_id", "created_at"])
    op.create_index("ix_retrieval_feedback_org_project_created", "retrieval_feedback", ["org_id", "project_id", "created_at"])
    op.create_index(op.f("ix_retrieval_feedback_actor_user_id"), "retrieval_feedback", ["actor_user_id"], unique=False)
    op.create_index(op.f("ix_retrieval_feedback_compilation_id"), "retrieval_feedback", ["compilation_id"], unique=False)
    op.create_index(op.f("ix_retrieval_feedback_created_at"), "retrieval_feedback", ["created_at"], unique=False)
    op.create_index(op.f("ix_retrieval_feedback_label"), "retrieval_feedback", ["label"], unique=False)
    op.create_index(op.f("ix_retrieval_feedback_org_id"), "retrieval_feedback", ["org_id"], unique=False)
    op.create_index(op.f("ix_retrieval_feedback_project_id"), "retrieval_feedback", ["project_id"], unique=False)
    op.create_index(op.f("ix_retrieval_feedback_query_profile_id"), "retrieval_feedback", ["query_profile_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_retrieval_feedback_query_profile_id"), table_name="retrieval_feedback")
    op.drop_index(op.f("ix_retrieval_feedback_project_id"), table_name="retrieval_feedback")
    op.drop_index(op.f("ix_retrieval_feedback_org_id"), table_name="retrieval_feedback")
    op.drop_index(op.f("ix_retrieval_feedback_label"), table_name="retrieval_feedback")
    op.drop_index(op.f("ix_retrieval_feedback_created_at"), table_name="retrieval_feedback")
    op.drop_index(op.f("ix_retrieval_feedback_compilation_id"), table_name="retrieval_feedback")
    op.drop_index(op.f("ix_retrieval_feedback_actor_user_id"), table_name="retrieval_feedback")
    op.drop_index("ix_retrieval_feedback_org_project_created", table_name="retrieval_feedback")
    op.drop_index("ix_retrieval_feedback_query_profile_created", table_name="retrieval_feedback")
    op.drop_index("ix_retrieval_feedback_compilation_created", table_name="retrieval_feedback")
    op.drop_table("retrieval_feedback")

    op.drop_index(op.f("ix_query_profiles_project_id"), table_name="query_profiles")
    op.drop_index(op.f("ix_query_profiles_org_id"), table_name="query_profiles")
    op.drop_index(op.f("ix_query_profiles_updated_at"), table_name="query_profiles")
    op.drop_index(op.f("ix_query_profiles_created_at"), table_name="query_profiles")
    op.drop_index(op.f("ix_query_profiles_last_queried_at"), table_name="query_profiles")
    op.drop_index(op.f("ix_query_profiles_last_feedback_at"), table_name="query_profiles")
    op.drop_index(op.f("ix_query_profiles_last_compilation_id"), table_name="query_profiles")
    op.drop_index(op.f("ix_query_profiles_actor_user_id"), table_name="query_profiles")
    op.drop_index("ix_query_profiles_org_project_updated", table_name="query_profiles")
    op.drop_table("query_profiles")
