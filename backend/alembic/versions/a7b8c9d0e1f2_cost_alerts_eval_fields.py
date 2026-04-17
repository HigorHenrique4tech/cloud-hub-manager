"""cost_alerts evaluation fields

Revision ID: a7b8c9d0e1f2
Revises: z6a1b2c3d4e5
Create Date: 2026-04-17 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a7b8c9d0e1f2'
down_revision = 's2t3u4v5w6x7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cost_alerts', sa.Column('last_evaluated_at', sa.DateTime, nullable=True))
    op.add_column('cost_alerts', sa.Column('last_triggered_at', sa.DateTime, nullable=True))


def downgrade():
    op.drop_column('cost_alerts', 'last_triggered_at')
    op.drop_column('cost_alerts', 'last_evaluated_at')
