"""background tasks table

Revision ID: y5z6a1b2c3d4
Revises: x4y5z6a1b2c3
Create Date: 2026-03-16

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = 'y5z6a1b2c3d4'
down_revision = 'x4y5z6a1b2c3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'background_tasks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('type', sa.String(80), nullable=False),
        sa.Column('label', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='queued'),
        sa.Column('result', JSONB, nullable=True),
        sa.Column('error', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_background_tasks_workspace_id', 'background_tasks', ['workspace_id'])
    op.create_index('ix_background_tasks_status', 'background_tasks', ['status'])
    op.create_index('ix_background_tasks_created_at', 'background_tasks', ['created_at'])


def downgrade():
    op.drop_index('ix_background_tasks_created_at', 'background_tasks')
    op.drop_index('ix_background_tasks_status', 'background_tasks')
    op.drop_index('ix_background_tasks_workspace_id', 'background_tasks')
    op.drop_table('background_tasks')
