"""Support system overhaul: SLA, config, assignment, CSAT, macros, tags

Revision ID: g8h9i0j1k2l3
Revises: f7g8h9i0j1k2
Create Date: 2026-04-19 16:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = 'g8h9i0j1k2l3'
down_revision = 'f7g8h9i0j1k2'
branch_labels = None
depends_on = None


def upgrade():
    # 1) tickets — SLA, assignment, escalation, rating, tags
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL")
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_first_response_hours INTEGER")
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMP")
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP")
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP")
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tags JSONB")
    op.execute("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS plan_at_creation VARCHAR(50)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tickets_assigned ON tickets (assigned_to)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tickets_sla_deadline ON tickets (sla_deadline)")

    # 2) users — is_support_agent
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_support_agent BOOLEAN NOT NULL DEFAULT FALSE")

    # 3) support_configs — singleton (id=1)
    op.create_table(
        'support_configs',
        sa.Column('id', sa.Integer, primary_key=True, default=1),
        sa.Column('inbox_email', sa.String(255), nullable=True),
        sa.Column('auto_reply_enabled', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('notify_on_new_ticket', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('notify_on_sla_risk', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('notify_on_escalation', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('business_hours_start', sa.Integer, nullable=False, server_default='9'),
        sa.Column('business_hours_end', sa.Integer, nullable=False, server_default='18'),
        sa.Column('business_days', sa.String(20), nullable=False, server_default='1,2,3,4,5'),
        sa.Column('slack_webhook_url', sa.String(500), nullable=True),
        sa.Column('csat_enabled', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.execute("INSERT INTO support_configs (id) VALUES (1) ON CONFLICT DO NOTHING")

    # 4) support_macros — respostas prontas
    op.create_table(
        'support_macros',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('shortcut', sa.String(50), nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=True),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_macros_category ON support_macros (category)")

    # 5) ticket_ratings — CSAT
    op.create_table(
        'ticket_ratings',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('ticket_id', UUID(as_uuid=True), sa.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('rating', sa.Integer, nullable=False),  # 1-5
        sa.Column('comment', sa.Text, nullable=True),
        sa.Column('rated_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('rated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_ticket_ratings_rating ON ticket_ratings (rating)")


def downgrade():
    op.drop_table('ticket_ratings')
    op.execute("DROP INDEX IF EXISTS ix_support_macros_category")
    op.drop_table('support_macros')
    op.drop_table('support_configs')
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_support_agent")
    op.execute("DROP INDEX IF EXISTS ix_tickets_sla_deadline")
    op.execute("DROP INDEX IF EXISTS ix_tickets_assigned")
    for col in ['plan_at_creation', 'tags', 'escalated_at', 'sla_breached',
                'first_response_at', 'sla_deadline', 'sla_first_response_hours', 'assigned_to']:
        op.execute(f"ALTER TABLE tickets DROP COLUMN IF EXISTS {col}")
