"""partner_center_org_fields

Revision ID: r1s2t3u4v5w6
Revises: q6r7s8t9u0v1
Create Date: 2026-04-13 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'r1s2t3u4v5w6'
down_revision = 's9t0u1v2w3x4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('partner_center_id', sa.String(100), nullable=True))
    op.add_column('organizations', sa.Column('partner_center_tenant', sa.String(100), nullable=True))
    op.create_index('ix_org_partner_center_id', 'organizations', ['partner_center_id'])


def downgrade():
    op.drop_index('ix_org_partner_center_id', 'organizations')
    op.drop_column('organizations', 'partner_center_tenant')
    op.drop_column('organizations', 'partner_center_id')
