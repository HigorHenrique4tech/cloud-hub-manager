"""member_profile_fields: add phone, department, notes to organization_members

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-03-09

"""
from alembic import op
import sqlalchemy as sa

revision = 't0u1v2w3x4y5'
down_revision = 's9t0u1v2w3x4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organization_members', sa.Column('phone',      sa.String(50),  nullable=True))
    op.add_column('organization_members', sa.Column('department', sa.String(100), nullable=True))
    op.add_column('organization_members', sa.Column('notes',      sa.String(500), nullable=True))


def downgrade():
    op.drop_column('organization_members', 'notes')
    op.drop_column('organization_members', 'department')
    op.drop_column('organization_members', 'phone')
