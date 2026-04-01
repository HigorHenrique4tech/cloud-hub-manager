"""billing_records: add description column (client-facing)

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-03-31
"""
from alembic import op
import sqlalchemy as sa

revision = 'n3o4p5q6r7s8'
down_revision = 'm2n3o4p5q6r7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('billing_records', sa.Column('description', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('billing_records', 'description')
