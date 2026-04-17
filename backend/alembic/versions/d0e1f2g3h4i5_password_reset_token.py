"""password reset token fields on users

Revision ID: d0e1f2g3h4i5
Revises: c9d0e1f2g3h4
Create Date: 2026-04-17 18:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'd0e1f2g3h4i5'
down_revision = 'c9d0e1f2g3h4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('password_reset_token', sa.String(255), nullable=True, index=True))
    op.add_column('users', sa.Column('password_reset_expires_at', sa.DateTime, nullable=True))
    op.create_index('ix_users_password_reset_token', 'users', ['password_reset_token'], unique=False)


def downgrade():
    op.drop_index('ix_users_password_reset_token', table_name='users')
    op.drop_column('users', 'password_reset_expires_at')
    op.drop_column('users', 'password_reset_token')
