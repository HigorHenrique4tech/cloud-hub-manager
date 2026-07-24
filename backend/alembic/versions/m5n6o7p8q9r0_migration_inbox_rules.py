"""add migrate_inbox_rules to migration_projects

Revision ID: m5n6o7p8q9r0
Revises: l4m5n6o7p8q9
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'm5n6o7p8q9r0'
down_revision = 'l4m5n6o7p8q9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'migration_projects',
        sa.Column('migrate_inbox_rules', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade():
    op.drop_column('migration_projects', 'migrate_inbox_rules')
