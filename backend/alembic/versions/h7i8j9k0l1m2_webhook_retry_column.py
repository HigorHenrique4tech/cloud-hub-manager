"""create webhook tables if missing + add next_retry_at

Revision ID: h7i8j9k0l1m2
Revises: g6h7i8j9k0l1
Create Date: 2026-03-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy import inspect as sa_inspect

revision = 'h7i8j9k0l1m2'
down_revision = 'g6h7i8j9k0l1'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing = inspector.get_table_names()

    # Create webhook_endpoints if it doesn't exist (may have been skipped by stamp)
    if 'webhook_endpoints' not in existing:
        op.create_table(
            'webhook_endpoints',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('workspace_id', UUID(as_uuid=True),
                      sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
            sa.Column('created_by', UUID(as_uuid=True),
                      sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('name', sa.String(200), nullable=False),
            sa.Column('url', sa.String(500), nullable=False),
            sa.Column('events', JSONB, nullable=False, server_default='[]'),
            sa.Column('secret', sa.String(100), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_webhook_endpoints_workspace_id', 'webhook_endpoints', ['workspace_id'])

    # Create webhook_deliveries if it doesn't exist
    if 'webhook_deliveries' not in existing:
        op.create_table(
            'webhook_deliveries',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('webhook_id', UUID(as_uuid=True),
                      sa.ForeignKey('webhook_endpoints.id', ondelete='CASCADE'), nullable=False),
            sa.Column('event_type', sa.String(100), nullable=False),
            sa.Column('payload', JSONB, nullable=True),
            sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
            sa.Column('http_status', sa.Integer(), nullable=True),
            sa.Column('response_body', sa.Text(), nullable=True),
            sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('next_retry_at', sa.DateTime(), nullable=True),
            sa.Column('delivered_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_webhook_deliveries_webhook_id', 'webhook_deliveries', ['webhook_id'])
        op.create_index('ix_webhook_deliveries_created_at', 'webhook_deliveries', ['created_at'])
    else:
        # Table exists — just add the new column
        columns = [c['name'] for c in inspector.get_columns('webhook_deliveries')]
        if 'next_retry_at' not in columns:
            op.add_column('webhook_deliveries', sa.Column('next_retry_at', sa.DateTime(), nullable=True))


def downgrade():
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing = inspector.get_table_names()
    if 'webhook_deliveries' in existing:
        columns = [c['name'] for c in inspector.get_columns('webhook_deliveries')]
        if 'next_retry_at' in columns:
            op.drop_column('webhook_deliveries', 'next_retry_at')
