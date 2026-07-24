"""add preserve_sp_permissions to migration_projects

Revision ID: l4m5n6o7p8q9
Revises: k3l4m5n6o7p8
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'l4m5n6o7p8q9'
down_revision = 'k3l4m5n6o7p8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'migration_projects',
        sa.Column('preserve_sp_permissions', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade():
    op.drop_column('migration_projects', 'preserve_sp_permissions')
