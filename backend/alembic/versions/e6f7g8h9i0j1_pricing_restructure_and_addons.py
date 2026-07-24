"""Restructure plans (Pro→Basic/Standard, Enterprise→E1/E2/E3) and add organization_addons table

Revision ID: e6f7g8h9i0j1
Revises: d0e1f2g3h4i5
Create Date: 2026-04-19 10:00:00.000000

Changes:
- Update organizations table: "pro" → "standard", "enterprise" → "enterprise_e1"
- Create organization_addons table for tracking workspace and user add-ons
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'e6f7g8h9i0j1'
down_revision = 'd0e1f2g3h4i5'
branch_labels = None
depends_on = None


def upgrade():
    # Create organization_addons table
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

    # Update existing organizations with old plan tiers to new ones
    op.execute("""
        UPDATE organizations
        SET plan_tier = 'standard'
        WHERE plan_tier = 'pro'
    """)

    op.execute("""
        UPDATE organizations
        SET plan_tier = 'enterprise_e1'
        WHERE plan_tier = 'enterprise'
    """)


def downgrade():
    # Revert plan tier updates
    op.execute("""
        UPDATE organizations
        SET plan_tier = 'pro'
        WHERE plan_tier = 'standard'
    """)

    op.execute("""
        UPDATE organizations
        SET plan_tier = 'enterprise'
        WHERE plan_tier = 'enterprise_e1'
    """)

    # Drop organization_addons table
    op.drop_index('ix_organization_addons_type')
    op.drop_index('ix_organization_addons_org')
    op.drop_table('organization_addons')
