"""add object_type to migration_mailboxes

Revision ID: j2k3l4m5n6o7
Revises: i1j2k3l4m5n6
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = 'j2k3l4m5n6o7'
down_revision = 'i1j2k3l4m5n6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'migration_mailboxes',
        sa.Column('object_type', sa.String(20), nullable=False, server_default='email'),
    )


def downgrade():
    op.drop_column('migration_mailboxes', 'object_type')
