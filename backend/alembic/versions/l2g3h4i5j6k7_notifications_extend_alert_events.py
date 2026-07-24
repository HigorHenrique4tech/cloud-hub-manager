"""Extend alert_events to support system notifications (anomaly, budget, schedule, scan).

Revision ID: l2g3h4i5j6k7
Revises: k1f2g3h4i5j6
Create Date: 2026-03-01

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'l2g3h4i5j6k7'
down_revision = 'k1f2g3h4i5j6'
branch_labels = None
depends_on = None


def upgrade():
    # Make alert_id nullable (notifications without a parent CostAlert)
    op.alter_column('alert_events', 'alert_id', nullable=True)

    # Make current_value / threshold_value nullable (system notifications have no threshold)
    op.alter_column('alert_events', 'current_value', nullable=True)
    op.alter_column('alert_events', 'threshold_value', nullable=True)

    # Add workspace_id so we can filter without joining cost_alerts
    op.add_column('alert_events',
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
                  nullable=True, index=True))

    # Backfill workspace_id from the parent CostAlert
    op.execute("""
        UPDATE alert_events ae
        SET    workspace_id = ca.workspace_id
        FROM   cost_alerts ca
        WHERE  ae.alert_id = ca.id
          AND  ae.workspace_id IS NULL
    """)

    # Add notification_type to distinguish sources
    op.add_column('alert_events',
        sa.Column('notification_type', sa.String(50),
                  nullable=False, server_default='cost_alert'))

    # Add link_to for frontend navigation on click
    op.add_column('alert_events',
        sa.Column('link_to', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('alert_events', 'link_to')
    op.drop_column('alert_events', 'notification_type')
    op.drop_column('alert_events', 'workspace_id')
    op.alter_column('alert_events', 'threshold_value', nullable=False)
    op.alter_column('alert_events', 'current_value', nullable=False)
    op.alter_column('alert_events', 'alert_id', nullable=False)
