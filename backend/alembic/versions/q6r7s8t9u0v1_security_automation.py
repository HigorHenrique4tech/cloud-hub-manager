"""security_automation: add security_events, security_actions, security_playbooks,
partner_center_configs, incident_responses tables

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-04-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = 'q6r7s8t9u0v1'
down_revision = 'p5q6r7s8t9u0'
branch_labels = None
depends_on = None


def upgrade():
    # ── security_events ──────────────────────────────────────────────────────
    op.create_table(
        'security_events',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('source', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('event_type', sa.String(100), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=True),
        sa.Column('entity_id', sa.String(500), nullable=True),
        sa.Column('details', JSONB, nullable=True),
        sa.Column('detected_at', sa.DateTime, nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('dismissed_by', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('dismissed_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False,
                  server_default=sa.text('now()')),
    )
    op.create_index('ix_secevents_ws_status', 'security_events',
                    ['workspace_id', 'status'])
    op.create_index('ix_secevents_ws_severity', 'security_events',
                    ['workspace_id', 'severity'])

    # ── security_actions ─────────────────────────────────────────────────────
    op.create_table(
        'security_actions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('event_id', UUID(as_uuid=True),
                  sa.ForeignKey('security_events.id', ondelete='SET NULL'),
                  nullable=True, index=True),
        sa.Column('workspace_id', UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('playbook_name', sa.String(100), nullable=True),
        sa.Column('action_type', sa.String(50), nullable=False),
        sa.Column('auto_executed', sa.Boolean, nullable=False,
                  server_default=sa.text('false')),
        sa.Column('executed_by', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('result', JSONB, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('executed_at', sa.DateTime, nullable=False,
                  server_default=sa.text('now()')),
    )
    op.create_index('ix_secactions_ws_executed', 'security_actions',
                    ['workspace_id', 'executed_at'])

    # ── security_playbooks ───────────────────────────────────────────────────
    op.create_table(
        'security_playbooks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('sources', JSONB, nullable=False),
        sa.Column('severity_min', sa.String(20), nullable=False,
                  server_default='high'),
        sa.Column('actions', JSONB, nullable=False),
        sa.Column('auto_execute', sa.Boolean, nullable=False,
                  server_default=sa.text('false')),
        sa.Column('cooldown_minutes', sa.Integer, nullable=False,
                  server_default='30'),
        sa.Column('is_active', sa.Boolean, nullable=False,
                  server_default=sa.text('true')),
        sa.Column('is_default', sa.Boolean, nullable=False,
                  server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime, nullable=False,
                  server_default=sa.text('now()')),
        sa.UniqueConstraint('workspace_id', 'name', name='uq_secplaybook_ws_name'),
    )

    # ── partner_center_configs ───────────────────────────────────────────────
    op.create_table(
        'partner_center_configs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
                  nullable=False, unique=True),
        sa.Column('partner_tenant_id', sa.String(255), nullable=False),
        sa.Column('encrypted_credentials', sa.Text, nullable=False),
        sa.Column('gdap_security_group_id', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False,
                  server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, nullable=False,
                  server_default=sa.text('now()')),
    )

    # ── incident_responses ───────────────────────────────────────────────────
    op.create_table(
        'incident_responses',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('template_type', sa.String(50), nullable=False),
        sa.Column('target_subscription_id', sa.String(255), nullable=True),
        sa.Column('target_customer_tenant_id', sa.String(255), nullable=True),
        sa.Column('target_resource_ids', JSONB, nullable=True),
        sa.Column('affected_users', JSONB, nullable=True),
        sa.Column('status', sa.String(30), nullable=False,
                  server_default='pending_approval'),
        sa.Column('triggered_by', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('approved_by', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('started_at', sa.DateTime, nullable=True),
        sa.Column('completed_at', sa.DateTime, nullable=True),
        sa.Column('steps', JSONB, nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False,
                  server_default=sa.text('now()')),
    )
    op.create_index('ix_ir_ws_status', 'incident_responses',
                    ['workspace_id', 'status'])


def downgrade():
    op.drop_table('incident_responses')
    op.drop_table('partner_center_configs')
    op.drop_table('security_playbooks')
    op.drop_table('security_actions')
    op.drop_table('security_events')
