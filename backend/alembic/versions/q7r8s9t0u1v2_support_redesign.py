"""support redesign: add ticket_number, workspace_id to tickets; add is_helpdesk to users

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'q7r8s9t0u1v2'
down_revision = 'p6q7r8s9t0u1'
branch_labels = None
depends_on = None


def upgrade():
    # ── users: helpdesk flag ──────────────────────────────────────────────────
    op.add_column('users',
        sa.Column('is_helpdesk', sa.Boolean(), nullable=False, server_default='false')
    )

    # ── tickets: workspace_id ─────────────────────────────────────────────────
    op.add_column('tickets',
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='SET NULL'), nullable=True)
    )
    op.create_index('ix_tickets_workspace_id', 'tickets', ['workspace_id'])

    # ── tickets: ticket_number via sequence ───────────────────────────────────
    op.execute("CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1")
    op.add_column('tickets',
        sa.Column('ticket_number', sa.Integer(), nullable=True)
    )
    op.execute("UPDATE tickets SET ticket_number = nextval('ticket_number_seq') WHERE ticket_number IS NULL")
    op.create_index('ix_tickets_ticket_number', 'tickets', ['ticket_number'])


def downgrade():
    op.drop_index('ix_tickets_ticket_number', 'tickets')
    op.drop_column('tickets', 'ticket_number')
    op.execute("DROP SEQUENCE IF EXISTS ticket_number_seq")
    op.drop_index('ix_tickets_workspace_id', 'tickets')
    op.drop_column('tickets', 'workspace_id')
    op.drop_column('users', 'is_helpdesk')
