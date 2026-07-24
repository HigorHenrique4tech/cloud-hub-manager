"""billing recurrence and history

Revision ID: v2w3x4y5z6a1
Revises: u1v2w3x4y5z6
Create Date: 2026-03-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'v2w3x4y5z6a1'
down_revision = 'u1v2w3x4y5z6'
branch_labels = None
depends_on = None


def upgrade():
    # Add recurrence columns to billing_records
    op.add_column('billing_records', sa.Column('is_recurring', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('billing_records', sa.Column('recurrence_months', sa.Integer(), nullable=True))

    # Create billing_status_history table
    op.create_table(
        'billing_status_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('billing_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('billing_records.id', ondelete='CASCADE'), nullable=False),
        sa.Column('old_status', sa.String(20), nullable=True),
        sa.Column('new_status', sa.String(20), nullable=False),
        sa.Column('changed_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('changed_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('notes', sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_table('billing_status_history')
    op.drop_column('billing_records', 'recurrence_months')
    op.drop_column('billing_records', 'is_recurring')
