"""add memories.hilbert_index for vector prefilter

Revision ID: 20260220_0012
Revises: 20260220_0011
Create Date: 2026-02-20 18:20:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260220_0012"
down_revision = "20260220_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    mem_cols = {col["name"] for col in inspector.get_columns("memories")}

    if "hilbert_index" not in mem_cols:
        op.add_column("memories", sa.Column("hilbert_index", sa.BigInteger(), nullable=True))

    op.execute("CREATE INDEX IF NOT EXISTS ix_memories_hilbert_index ON memories (hilbert_index)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_memories_project_hilbert_index ON memories (project_id, hilbert_index)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_memories_project_hilbert_index")
    op.execute("DROP INDEX IF EXISTS ix_memories_hilbert_index")

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    mem_cols = {col["name"] for col in inspector.get_columns("memories")}
    if "hilbert_index" in mem_cols:
        op.drop_column("memories", "hilbert_index")
