"""add memories.search_vector jsonb for embedding payloads

Revision ID: 20260219_0008
Revises: 20260219_0007
Create Date: 2026-02-19 18:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260219_0008"
down_revision = "20260219_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("memories")}
    if "search_vector" not in columns:
        op.add_column("memories", sa.Column("search_vector", JSONB, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("memories")}
    if "search_vector" in columns:
        op.drop_column("memories", "search_vector")
