"""email change flow fields on users (pending_email, email_change_token, email_change_expires_at)

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa

revision = 's3t4u5v6w7x8'
down_revision = 'r2s3t4u5v6w7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('pending_email', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('email_change_token', sa.String(64), nullable=True))
    op.add_column('users', sa.Column('email_change_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_users_email_change_token', 'users', ['email_change_token'], unique=False)


def downgrade():
    op.drop_index('ix_users_email_change_token', table_name='users')
    op.drop_column('users', 'email_change_expires_at')
    op.drop_column('users', 'email_change_token')
    op.drop_column('users', 'pending_email')
