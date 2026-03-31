"""migration_projects: add scheduled_at column

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'm2n3o4p5q6r7'
down_revision = 'l1m2n3o4p5q6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'migration_projects',
        sa.Column('scheduled_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_column('migration_projects', 'scheduled_at')
