"""add next_retry_at to webhook_deliveries

Revision ID: h7i8j9k0l1m2
Revises: g6h7i8j9k0l1
Create Date: 2026-03-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'h7i8j9k0l1m2'
down_revision = 'g6h7i8j9k0l1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('webhook_deliveries', sa.Column('next_retry_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('webhook_deliveries', 'next_retry_at')
