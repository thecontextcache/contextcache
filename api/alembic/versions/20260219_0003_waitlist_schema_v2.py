"""waitlist, tags, memory metadata, usage_periods, FTS index

Revision ID: 20260219_0003
Revises: 20260219_0002
Create Date: 2026-02-19 02:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "20260219_0003"
down_revision = "20260219_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Extend memories table
    # ------------------------------------------------------------------
    op.add_column("memories", sa.Column(
        "created_by_user_id",
        sa.Integer(),
        sa.ForeignKey("auth_users.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.add_column("memories", sa.Column(
        "source",
        sa.String(100),
        nullable=False,
        server_default=sa.text("'manual'"),
    ))
    op.add_column("memories", sa.Column(
        "title",
        sa.String(500),
        nullable=True,
    ))
    op.add_column("memories", sa.Column(
        "metadata",
        postgresql.JSONB(),
        nullable=False,
        server_default=sa.text("'{}'::jsonb"),
    ))
    op.add_column("memories", sa.Column(
        "content_hash",
        sa.String(64),
        nullable=True,
    ))
    op.add_column("memories", sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        nullable=True,
        server_default=sa.text("now()"),
    ))

    # ------------------------------------------------------------------
    # 2. Extend projects table
    # ------------------------------------------------------------------
    op.add_column("projects", sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        nullable=True,
        server_default=sa.text("now()"),
    ))

    # ------------------------------------------------------------------
    # 3. New tables
    # ------------------------------------------------------------------

    # waitlist
    op.create_table(
        "waitlist",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_admin_id", sa.Integer(), sa.ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_waitlist_email", "waitlist", ["email"], unique=True)
    op.create_index("ix_waitlist_status", "waitlist", ["status"])

    # tags
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("project_id", "name", name="uq_tags_project_name"),
    )
    op.create_index("ix_tags_project_name", "tags", ["project_id", "name"])

    # memory_tags
    op.create_table(
        "memory_tags",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("memory_id", sa.Integer(), sa.ForeignKey("memories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tag_id", sa.Integer(), sa.ForeignKey("tags.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("memory_id", "tag_id", name="uq_memory_tags"),
    )
    op.create_index("ix_memory_tags_memory", "memory_tags", ["memory_id"])
    op.create_index("ix_memory_tags_tag", "memory_tags", ["tag_id"])

    # memory_embeddings (placeholder — vector column added when pgvector ready)
    op.create_table(
        "memory_embeddings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("memory_id", sa.Integer(), sa.ForeignKey("memories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("dims", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("memory_id", name="uq_memory_embeddings_memory"),
    )
    op.create_index("ix_memory_embeddings_memory", "memory_embeddings", ["memory_id"])

    # usage_periods
    op.create_table(
        "usage_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("memories_created", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("search_queries", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("bytes_ingested", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "period_start", name="uq_usage_periods_user_period"),
    )
    op.create_index("ix_usage_periods_user", "usage_periods", ["user_id"])
    op.create_index("ix_usage_periods_period_start", "usage_periods", ["period_start"])

    # ------------------------------------------------------------------
    # 4. Indexes on memories for common query patterns
    # ------------------------------------------------------------------
    op.create_index("ix_memories_project_created", "memories", ["project_id", sa.text("created_at DESC")])
    op.create_index("ix_memories_project_type", "memories", ["project_id", "type"])
    op.create_index("ix_memories_project_source", "memories", ["project_id", "source"])
    op.create_index("ix_memories_content_hash", "memories", ["content_hash"])
    op.create_index("ix_memories_created_by", "memories", ["created_by_user_id"])

    # ------------------------------------------------------------------
    # 5. GIN index on search_tsv for FTS
    # ------------------------------------------------------------------
    op.execute("CREATE INDEX IF NOT EXISTS ix_memories_tsv ON memories USING GIN(search_tsv)")

    # ------------------------------------------------------------------
    # 6. Trigger: auto-update search_tsv on INSERT/UPDATE of content/title
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TRIGGER trig_memories_tsv
        BEFORE INSERT OR UPDATE OF content, title ON memories
        FOR EACH ROW EXECUTE FUNCTION
            tsvector_update_trigger(search_tsv, 'pg_catalog.english', content, title)
    """)

    # ------------------------------------------------------------------
    # 7. Back-fill search_tsv for existing rows
    # ------------------------------------------------------------------
    op.execute("""
        UPDATE memories
        SET search_tsv = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
        WHERE search_tsv IS NULL
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trig_memories_tsv ON memories")
    op.drop_index("ix_memories_tsv", table_name="memories")
    op.drop_index("ix_usage_periods_period_start", table_name="usage_periods")
    op.drop_index("ix_usage_periods_user", table_name="usage_periods")
    op.drop_table("usage_periods")
    op.drop_index("ix_memory_embeddings_memory", table_name="memory_embeddings")
    op.drop_table("memory_embeddings")
    op.drop_index("ix_memory_tags_tag", table_name="memory_tags")
    op.drop_index("ix_memory_tags_memory", table_name="memory_tags")
    op.drop_table("memory_tags")
    op.drop_index("ix_tags_project_name", table_name="tags")
    op.drop_table("tags")
    op.drop_index("ix_waitlist_status", table_name="waitlist")
    op.drop_index("ix_waitlist_email", table_name="waitlist")
    op.drop_table("waitlist")
    op.drop_index("ix_memories_created_by", table_name="memories")
    op.drop_index("ix_memories_content_hash", table_name="memories")
    op.drop_index("ix_memories_project_source", table_name="memories")
    op.drop_index("ix_memories_project_type", table_name="memories")
    op.drop_index("ix_memories_project_created", table_name="memories")
    op.drop_column("projects", "updated_at")
    op.drop_column("memories", "updated_at")
    op.drop_column("memories", "content_hash")
    op.drop_column("memories", "metadata")
    op.drop_column("memories", "title")
    op.drop_column("memories", "source")
    op.drop_column("memories", "created_by_user_id")
