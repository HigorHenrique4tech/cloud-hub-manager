"""Add status column to organization_addons for approval workflow

Revision ID: f7g8h9i0j1k2
Revises: e6f7g8h9i0j1
Create Date: 2026-04-19 15:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f7g8h9i0j1k2'
down_revision = 'e6f7g8h9i0j1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organization_addons', sa.Column(
        'status', sa.String(20), nullable=False, server_default='approved'
    ))
    op.add_column('organization_addons', sa.Column('notes', sa.Text, nullable=True))
    op.add_column('organization_addons', sa.Column('admin_notes', sa.Text, nullable=True))
    op.add_column('organization_addons', sa.Column('reviewed_by', sa.String(255), nullable=True))
    op.add_column('organization_addons', sa.Column('reviewed_at', sa.DateTime, nullable=True))
    op.create_index('ix_organization_addons_status', 'organization_addons', ['status'])


def downgrade():
    op.drop_index('ix_organization_addons_status', 'organization_addons')
    op.drop_column('organization_addons', 'reviewed_at')
    op.drop_column('organization_addons', 'reviewed_by')
    op.drop_column('organization_addons', 'admin_notes')
    op.drop_column('organization_addons', 'notes')
    op.drop_column('organization_addons', 'status')
