"""expand alembic version column for longer revision identifiers

Revision ID: 20260301_0020a_vercol
Revises: 20260227_0020_batch_action_runs
Create Date: 2026-03-01 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260301_0020a_vercol"
down_revision = "20260227_0020_batch_action_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "alembic_version",
        "version_num",
        existing_type=sa.String(length=32),
        type_=sa.String(length=128),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "alembic_version",
        "version_num",
        existing_type=sa.String(length=128),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
