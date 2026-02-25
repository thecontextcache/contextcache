"""add waitlist profile fields

Revision ID: 20260225_0015
Revises: f36b427e433f
Create Date: 2026-02-25 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260225_0015"
down_revision = "f36b427e433f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("waitlist", sa.Column("name", sa.String(length=120), nullable=True))
    op.add_column("waitlist", sa.Column("company", sa.String(length=180), nullable=True))
    op.add_column("waitlist", sa.Column("use_case", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("waitlist", "use_case")
    op.drop_column("waitlist", "company")
    op.drop_column("waitlist", "name")
