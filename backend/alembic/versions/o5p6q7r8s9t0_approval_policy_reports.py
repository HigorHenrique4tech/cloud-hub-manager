"""add approval_requests, policies, policy_logs, executive_report_settings, executive_reports

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'o5p6q7r8s9t0'
down_revision = 'n4o5p6q7r8s9'
branch_labels = None
depends_on = None


def upgrade():
    # ── approval_requests ────────────────────────────────────────────────────
    op.create_table(
        'approval_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('requester_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('resolved_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action_type', sa.String(100), nullable=False),
        sa.Column('action_payload', postgresql.JSONB(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_approval_requests_workspace_id', 'approval_requests', ['workspace_id'])
    op.create_index('ix_approval_requests_status', 'approval_requests', ['status'])
    op.create_index('ix_approval_requests_created_at', 'approval_requests', ['created_at'])

    # ── policies ─────────────────────────────────────────────────────────────
    op.create_table(
        'policies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('provider', sa.String(20), nullable=False, server_default='all'),
        sa.Column('conditions', postgresql.JSONB(), nullable=False),
        sa.Column('action', postgresql.JSONB(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_triggered_at', sa.DateTime(), nullable=True),
        sa.Column('trigger_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_policies_workspace_id', 'policies', ['workspace_id'])

    # ── policy_logs ───────────────────────────────────────────────────────────
    op.create_table(
        'policy_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('policy_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('policies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('triggered_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('condition_snapshot', postgresql.JSONB(), nullable=True),
        sa.Column('action_taken', sa.String(100), nullable=True),
        sa.Column('result', sa.String(50), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
    )
    op.create_index('ix_policy_logs_policy_id', 'policy_logs', ['policy_id'])

    # ── executive_report_settings ─────────────────────────────────────────────
    op.create_table(
        'executive_report_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('recipients', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('send_day', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('include_costs', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('include_anomalies', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('include_recommendations', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('include_schedules', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('workspace_id', name='uq_exec_report_settings_ws'),
    )
    op.create_index('ix_exec_report_settings_workspace_id', 'executive_report_settings', ['workspace_id'])

    # ── executive_reports ─────────────────────────────────────────────────────
    op.create_table(
        'executive_reports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period', sa.String(7), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='generating'),
        sa.Column('pdf_bytes', sa.Text(), nullable=True),
        sa.Column('summary_data', postgresql.JSONB(), nullable=True),
        sa.Column('generated_at', sa.DateTime(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('recipients', postgresql.JSONB(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_executive_reports_workspace_id', 'executive_reports', ['workspace_id'])


def downgrade():
    op.drop_table('executive_reports')
    op.drop_table('executive_report_settings')
    op.drop_table('policy_logs')
    op.drop_table('policies')
    op.drop_table('approval_requests')
