"""notification_channels: replace webhooks with teams/telegram channels

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-03-08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = 's9t0u1v2w3x4'
down_revision = 'r8s9t0u1v2w3'
branch_labels = None
depends_on = None


def upgrade():
    # Drop old webhook tables (deliveries first due to FK)
    op.drop_table('webhook_deliveries')
    op.drop_table('webhook_endpoints')

    # Create notification_channels
    op.create_table(
        'notification_channels',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('channel_type', sa.String(20), nullable=False),  # teams | telegram
        sa.Column('config', JSONB, nullable=False, server_default='{}'),
        sa.Column('events', JSONB, nullable=False, server_default='[]'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, nullable=True),
    )

    # Create notification_deliveries
    op.create_table(
        'notification_deliveries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('channel_id', UUID(as_uuid=True), sa.ForeignKey('notification_channels.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('event_type', sa.String(100), nullable=False),
        sa.Column('payload', JSONB, nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default="'pending'"),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
    )


def downgrade():
    op.drop_table('notification_deliveries')
    op.drop_table('notification_channels')

    op.create_table(
        'webhook_endpoints',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('events', JSONB, nullable=False, server_default='[]'),
        sa.Column('secret', sa.String(100), nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
    )

    op.create_table(
        'webhook_deliveries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('webhook_id', UUID(as_uuid=True), sa.ForeignKey('webhook_endpoints.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('event_type', sa.String(100), nullable=False),
        sa.Column('payload', JSONB, nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default="'pending'"),
        sa.Column('http_status', sa.Integer, nullable=True),
        sa.Column('response_body', sa.Text, nullable=True),
        sa.Column('attempt_count', sa.Integer, nullable=False, server_default='1'),
        sa.Column('delivered_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
    )
