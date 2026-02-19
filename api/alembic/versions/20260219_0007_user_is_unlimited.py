"""Add is_unlimited flag to auth_users for per-user limit bypass

Revision ID: 20260219_0007
Revises: 20260219_0006
Create Date: 2026-02-19 14:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260219_0007"
down_revision = "20260219_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "auth_users",
        sa.Column(
            "is_unlimited",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("auth_users", "is_unlimited")
