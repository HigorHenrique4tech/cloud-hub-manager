"""add onboarding_completed to users

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-03-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'n4o5p6q7r8s9'
down_revision = 'm3n4o5p6q7r8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('onboarding_completed', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade():
    op.drop_column('users', 'onboarding_completed')
