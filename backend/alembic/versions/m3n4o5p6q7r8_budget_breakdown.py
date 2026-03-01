"""budget breakdown per provider

Revision ID: m3n4o5p6q7r8
Revises: l2g3h4i5j6k7
Create Date: 2026-03-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'm3n4o5p6q7r8'
down_revision = 'l2g3h4i5j6k7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('finops_budgets', sa.Column('spend_breakdown', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('finops_budgets', 'spend_breakdown')
