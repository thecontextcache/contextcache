"""query profile auto apply controls

Revision ID: 20260405_0024
Revises: 20260331_0023
Create Date: 2026-04-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260405_0024"
down_revision = "20260331_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "query_profiles",
        sa.Column("auto_apply_disabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("query_profiles", "auto_apply_disabled")
