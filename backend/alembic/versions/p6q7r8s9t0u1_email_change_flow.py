"""email change flow (pending_email + tokens)

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'p6q7r8s9t0u1'
down_revision = 'o5p6q7r8s9t0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('pending_email', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('email_change_token', sa.String(64), nullable=True))
    op.add_column('users', sa.Column('email_change_expires_at', sa.DateTime, nullable=True))
    op.create_index('ix_users_email_change_token', 'users', ['email_change_token'])


def downgrade():
    op.drop_index('ix_users_email_change_token', table_name='users')
    op.drop_column('users', 'email_change_expires_at')
    op.drop_column('users', 'email_change_token')
    op.drop_column('users', 'pending_email')
