"""add is_admin and enterprise_leads

Revision ID: i9d0e1f2g3h4
Revises: h8c9d0e1f2g3
Create Date: 2026-02-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = 'i9d0e1f2g3h4'
down_revision = 'h8c9d0e1f2g3'
branch_labels = None
depends_on = None


def upgrade():
    # Add is_admin to users
    op.add_column('users',
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))

    # Create enterprise_leads table
    op.create_table(
        'enterprise_leads',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('org_id', UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('email', sa.String(200), nullable=False),
        sa.Column('company', sa.String(200), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='new'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_enterprise_leads_status', 'enterprise_leads', ['status'])
    op.create_index('ix_enterprise_leads_created_at', 'enterprise_leads', ['created_at'])


def downgrade():
    op.drop_index('ix_enterprise_leads_created_at', table_name='enterprise_leads')
    op.drop_index('ix_enterprise_leads_status', table_name='enterprise_leads')
    op.drop_table('enterprise_leads')
    op.drop_column('users', 'is_admin')
