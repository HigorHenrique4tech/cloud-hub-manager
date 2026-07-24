"""Migration365 tables — projects, mailboxes, logs

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4
Create Date: 2026-03-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy import inspect as sa_inspect

revision = 'k0l1m2n3o4p5'
down_revision = 'j9k0l1m2n3o4'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing = inspector.get_table_names()

    if 'migration_projects' not in existing:
        op.create_table(
            'migration_projects',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('workspace_id', UUID(as_uuid=True),
                      sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
            sa.Column('created_by', UUID(as_uuid=True),
                      sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('migration_type', sa.String(50), nullable=False),
            sa.Column('status', sa.String(30), nullable=False, server_default='draft'),
            sa.Column('source_config', sa.Text(), nullable=True),   # Fernet-encrypted JSON
            sa.Column('destination_config', sa.Text(), nullable=True),
            sa.Column('mailbox_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('completed_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('failed_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_migration_projects_workspace_id', 'migration_projects', ['workspace_id'])
        op.create_index('ix_migration_projects_status', 'migration_projects', ['status'])

    if 'migration_mailboxes' not in existing:
        op.create_table(
            'migration_mailboxes',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('project_id', UUID(as_uuid=True),
                      sa.ForeignKey('migration_projects.id', ondelete='CASCADE'), nullable=False),
            sa.Column('source_email', sa.String(255), nullable=False),
            sa.Column('destination_email', sa.String(255), nullable=True),
            sa.Column('display_name', sa.String(255), nullable=True),
            sa.Column('status', sa.String(30), nullable=False, server_default='pending'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('items_total', sa.Integer(), nullable=True),
            sa.Column('items_migrated', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('size_bytes', sa.BigInteger(), nullable=True),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_migration_mailboxes_project_id', 'migration_mailboxes', ['project_id'])
        op.create_index('ix_migration_mailboxes_status', 'migration_mailboxes', ['project_id', 'status'])

    if 'migration_logs' not in existing:
        op.create_table(
            'migration_logs',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('project_id', UUID(as_uuid=True),
                      sa.ForeignKey('migration_projects.id', ondelete='CASCADE'), nullable=False),
            sa.Column('mailbox_id', UUID(as_uuid=True),
                      sa.ForeignKey('migration_mailboxes.id', ondelete='SET NULL'), nullable=True),
            sa.Column('level', sa.String(20), nullable=False, server_default='info'),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('details', JSONB, nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_migration_logs_project_id', 'migration_logs', ['project_id'])
        op.create_index('ix_migration_logs_created_at', 'migration_logs', ['created_at'])


def downgrade():
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing = inspector.get_table_names()
    for table in ['migration_logs', 'migration_mailboxes', 'migration_projects']:
        if table in existing:
            op.drop_table(table)
