"""fix memories fk to users

Revision ID: f36b427e433f
Revises: 20260223_0013
Create Date: 2026-02-23 18:21:42.461636

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = 'f36b427e433f'
down_revision = '20260223_0013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('memories_created_by_user_id_fkey', 'memories', type_='foreignkey')
    op.create_foreign_key(
        'memories_created_by_user_id_fkey', 
        'memories', 
        'users',
        ['created_by_user_id'], 
        ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('memories_created_by_user_id_fkey', 'memories', type_='foreignkey')
    op.create_foreign_key(
        'memories_created_by_user_id_fkey', 
        'memories', 
        'auth_users',
        ['created_by_user_id'], 
        ['id'],
        ondelete='SET NULL'
    )
