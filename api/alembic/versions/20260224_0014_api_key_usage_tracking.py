"""api_key usage tracking: last_used_at + use_count

Revision ID: 20260224_0014
Revises: f36b427e433f
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "20260224_0014"
down_revision = "f36b427e433f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_keys",
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "api_keys",
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("api_keys", "use_count")
    op.drop_column("api_keys", "last_used_at")
