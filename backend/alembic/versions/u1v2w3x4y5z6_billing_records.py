"""billing_records: add billing_records table for admin payment tracking

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-03-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'u1v2w3x4y5z6'
down_revision = 't0u1v2w3x4y5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'billing_records',
        sa.Column('id',                  UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id',              UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('client_name',         sa.String(255),  nullable=False),
        sa.Column('amount',              sa.Float(),      nullable=False),
        sa.Column('period_type',         sa.String(10),   nullable=False, server_default='monthly'),
        sa.Column('period_ref',          sa.String(20),   nullable=False),
        sa.Column('due_date',            sa.DateTime(),   nullable=True),
        sa.Column('paid_at',             sa.DateTime(),   nullable=True),
        sa.Column('status',              sa.String(20),   nullable=False, server_default='pending'),
        sa.Column('notes',               sa.Text(),       nullable=True),
        sa.Column('attachment_filename', sa.String(255),  nullable=True),
        sa.Column('attachment_path',     sa.String(512),  nullable=True),
        sa.Column('created_by',          UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at',          sa.DateTime(),   nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at',          sa.DateTime(),   nullable=False, server_default=sa.text('now()')),
    )


def downgrade():
    op.drop_table('billing_records')
