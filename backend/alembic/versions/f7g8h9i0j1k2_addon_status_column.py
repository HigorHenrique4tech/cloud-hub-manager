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
    op.execute("""
        ALTER TABLE organization_addons
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved'
    """)
    op.execute("""
        ALTER TABLE organization_addons
        ADD COLUMN IF NOT EXISTS notes TEXT
    """)
    op.execute("""
        ALTER TABLE organization_addons
        ADD COLUMN IF NOT EXISTS admin_notes TEXT
    """)
    op.execute("""
        ALTER TABLE organization_addons
        ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255)
    """)
    op.execute("""
        ALTER TABLE organization_addons
        ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_organization_addons_status
        ON organization_addons (status)
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_organization_addons_status")
    op.drop_column('organization_addons', 'reviewed_at')
    op.drop_column('organization_addons', 'reviewed_by')
    op.drop_column('organization_addons', 'admin_notes')
    op.drop_column('organization_addons', 'notes')
    op.drop_column('organization_addons', 'status')
