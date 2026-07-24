"""org notes and suspension fields

Revision ID: x4y5z6a1b2c3
Revises: w3x4y5z6a1b2
Create Date: 2026-03-10

"""
from alembic import op
import sqlalchemy as sa

revision = 'x4y5z6a1b2c3'
down_revision = 'w3x4y5z6a1b2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('organizations', sa.Column('suspended_reason', sa.String(500), nullable=True))
    op.add_column('organizations', sa.Column('suspended_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('organizations', 'suspended_at')
    op.drop_column('organizations', 'suspended_reason')
    op.drop_column('organizations', 'notes')
