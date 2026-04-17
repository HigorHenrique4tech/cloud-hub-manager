"""cloud_account allocation_tags field

Revision ID: b8c9d0e1f2g3
Revises: a7b8c9d0e1f2
Create Date: 2026-04-17 10:30:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'b8c9d0e1f2g3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cloud_accounts', sa.Column('allocation_tags', JSONB, nullable=True))


def downgrade():
    op.drop_column('cloud_accounts', 'allocation_tags')
