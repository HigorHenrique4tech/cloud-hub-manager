"""finops cost history

Revision ID: t4u5v6w7x8y9
Revises: s3t4u5v6w7x8, f6a7b8c9d0e1
Create Date: 2026-05-07

Adds a per-month cost snapshot table so executive reports can show
historic monthly spend instead of the current MTD value.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 't4u5v6w7x8y9'
down_revision = ('s3t4u5v6w7x8', 'f6a7b8c9d0e1')
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'finops_cost_history',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('provider', sa.String(20), nullable=False),
        sa.Column('year_month', sa.String(7), nullable=False),
        sa.Column('spend', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(3), nullable=False, server_default='USD'),
        sa.Column('source', sa.String(20), nullable=False, server_default='api'),
        sa.Column('is_partial', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('collected_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('workspace_id', 'provider', 'year_month',
                            name='uq_cost_history_ws_provider_period'),
    )
    op.create_index('ix_cost_history_ws_period', 'finops_cost_history',
                    ['workspace_id', 'year_month'])


def downgrade():
    op.drop_index('ix_cost_history_ws_period', table_name='finops_cost_history')
    op.drop_table('finops_cost_history')
