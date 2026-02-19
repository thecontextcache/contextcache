"""add pgvector memory column and embedding metadata fields

Revision ID: 20260219_0009
Revises: 20260219_0008
Create Date: 2026-02-19 20:30:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260219_0009"
down_revision = "20260219_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    mem_cols = {col["name"] for col in inspector.get_columns("memories")}
    if "embedding_vector" not in mem_cols:
        op.execute("ALTER TABLE memories ADD COLUMN embedding_vector vector(1536)")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_memories_embedding_vector_ivfflat
        ON memories USING ivfflat (embedding_vector vector_cosine_ops)
        WITH (lists = 100)
        """
    )

    emb_cols = {col["name"] for col in inspector.get_columns("memory_embeddings")}
    if "model_name" not in emb_cols:
        op.add_column("memory_embeddings", sa.Column("model_name", sa.String(length=120), nullable=True))
    if "model_version" not in emb_cols:
        op.add_column("memory_embeddings", sa.Column("model_version", sa.String(length=80), nullable=True))
    if "confidence" not in emb_cols:
        op.add_column("memory_embeddings", sa.Column("confidence", sa.Float(), nullable=True))
    if "metadata" not in emb_cols:
        op.add_column(
            "memory_embeddings",
            sa.Column("metadata", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    emb_cols = {col["name"] for col in inspector.get_columns("memory_embeddings")}
    if "metadata" in emb_cols:
        op.drop_column("memory_embeddings", "metadata")
    if "confidence" in emb_cols:
        op.drop_column("memory_embeddings", "confidence")
    if "model_version" in emb_cols:
        op.drop_column("memory_embeddings", "model_version")
    if "model_name" in emb_cols:
        op.drop_column("memory_embeddings", "model_name")

    op.execute("DROP INDEX IF EXISTS ix_memories_embedding_vector_ivfflat")
    mem_cols = {col["name"] for col in inspector.get_columns("memories")}
    if "embedding_vector" in mem_cols:
        op.execute("ALTER TABLE memories DROP COLUMN embedding_vector")
