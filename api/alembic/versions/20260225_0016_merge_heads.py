"""merge alembic heads 0014 + 0015

Revision ID: 20260225_0016
Revises: 20260224_0014, 20260225_0015
Create Date: 2026-02-25 13:00:00
"""

from __future__ import annotations


revision = "20260225_0016"
down_revision = ("20260224_0014", "20260225_0015")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Merge point only; no schema changes.
    pass


def downgrade() -> None:
    # Merge point only; no schema changes.
    pass
