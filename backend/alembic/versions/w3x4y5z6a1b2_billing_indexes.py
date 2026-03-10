"""billing indexes

Revision ID: w3x4y5z6a1b2
Revises: v2w3x4y5z6a1
Create Date: 2026-03-10

"""
from alembic import op

revision = 'w3x4y5z6a1b2'
down_revision = 'v2w3x4y5z6a1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index('ix_billing_status_due', 'billing_records', ['status', 'due_date'])
    op.create_index('ix_billing_history_billing', 'billing_status_history', ['billing_id', 'changed_at'])


def downgrade():
    op.drop_index('ix_billing_history_billing', table_name='billing_status_history')
    op.drop_index('ix_billing_status_due', table_name='billing_records')
