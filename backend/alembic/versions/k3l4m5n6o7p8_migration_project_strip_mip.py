"""add strip_mip_labels to migration_projects

Revision ID: k3l4m5n6o7p8
Revises: j2k3l4m5n6o7
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'k3l4m5n6o7p8'
down_revision = 'j2k3l4m5n6o7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'migration_projects',
        sa.Column('strip_mip_labels', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade():
    op.drop_column('migration_projects', 'strip_mip_labels')
