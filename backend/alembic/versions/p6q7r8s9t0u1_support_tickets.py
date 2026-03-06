"""add tickets and ticket_messages

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'p6q7r8s9t0u1'
down_revision = 'o5p6q7r8s9t0'
branch_labels = None
depends_on = None


def upgrade():
    # ── tickets ───────────────────────────────────────────────────────────────
    op.create_table(
        'tickets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('creator_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('category', sa.String(50), nullable=False, server_default='other'),
        sa.Column('priority', sa.String(20), nullable=False, server_default='normal'),
        sa.Column('status', sa.String(30), nullable=False, server_default='open'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_tickets_organization_id', 'tickets', ['organization_id'])
    op.create_index('ix_tickets_status', 'tickets', ['status'])
    op.create_index('ix_tickets_created_at', 'tickets', ['created_at'])

    # ── ticket_messages ───────────────────────────────────────────────────────
    op.create_table(
        'ticket_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('ticket_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sender_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_internal', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_ticket_messages_ticket_id', 'ticket_messages', ['ticket_id'])


def downgrade():
    op.drop_table('ticket_messages')
    op.drop_table('tickets')
