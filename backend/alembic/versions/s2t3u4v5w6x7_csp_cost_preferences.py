"""csp_cost_preferences

Revision ID: s2t3u4v5w6x7
Revises: r1s2t3u4v5w6
Create Date: 2026-04-13 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 's2t3u4v5w6x7'
down_revision = 'r1s2t3u4v5w6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('cost_source_preference', sa.String(30), nullable=False, server_default='auto'))
    op.add_column('organizations', sa.Column('cost_markup_pct', sa.Float, nullable=False, server_default='0'))
    op.create_index('ix_org_cost_source', 'organizations', ['cost_source_preference'])


def downgrade():
    op.drop_index('ix_org_cost_source', 'organizations')
    op.drop_column('organizations', 'cost_markup_pct')
    op.drop_column('organizations', 'cost_source_preference')
