"""verification_token_expires_at on users

Revision ID: o5p6q7r8s9t0
Revises: n5o6p7q8r9s0
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'o5p6q7r8s9t0'
down_revision = 'n5o6p7q8r9s0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('verification_token_expires_at', sa.DateTime, nullable=True),
    )


def downgrade():
    op.drop_column('users', 'verification_token_expires_at')
