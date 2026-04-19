"""password reset token fields on users

Revision ID: d0e1f2g3h4i5
Revises: z6a1b2c3d4e5
Create Date: 2026-04-17 18:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'd0e1f2g3h4i5'
down_revision = 'z6a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('password_reset_token', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('password_reset_expires_at', sa.DateTime, nullable=True))
    # Index already exists from previous model sync — skip creation to avoid DuplicateTable error
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_password_reset_token ON users (password_reset_token)")


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_users_password_reset_token")
    op.drop_column('users', 'password_reset_expires_at')
    op.drop_column('users', 'password_reset_token')
