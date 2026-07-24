"""add mfa fields to users

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('mfa_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('mfa_otp_hash', sa.String(64), nullable=True))
    op.add_column('users', sa.Column('mfa_otp_expires_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('mfa_otp_attempts', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('users', 'mfa_otp_attempts')
    op.drop_column('users', 'mfa_otp_expires_at')
    op.drop_column('users', 'mfa_otp_hash')
    op.drop_column('users', 'mfa_enabled')
