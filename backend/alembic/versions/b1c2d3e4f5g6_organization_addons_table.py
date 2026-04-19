"""Create organization_addons table for tracking add-on subscriptions

Revision ID: b1c2d3e4f5g6
Revises: a0b1c2d3e4f5
Create Date: 2026-04-19 10:15:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'b1c2d3e4f5g6'
down_revision = 'a0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'organization_addons',
        sa.Column('id', UUID(as_uuid=True), nullable=False, primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), nullable=False),
        sa.Column('addon_type', sa.String(50), nullable=False),  # 'workspace' or 'user'
        sa.Column('quantity', sa.Integer, nullable=False, server_default='0'),
        sa.Column('monthly_price_cents', sa.Integer, nullable=False),  # in centavos
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('created_by', UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime, nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )

    op.create_index('ix_organization_addons_org', 'organization_addons', ['organization_id'])
    op.create_index('ix_organization_addons_type', 'organization_addons', ['addon_type'])


def downgrade():
    op.drop_index('ix_organization_addons_type')
    op.drop_index('ix_organization_addons_org')
    op.drop_table('organization_addons')
