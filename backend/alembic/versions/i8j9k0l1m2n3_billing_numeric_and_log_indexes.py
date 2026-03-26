"""billing amount float to numeric + temporal indexes on log tables

Revision ID: i8j9k0l1m2n3
Revises: h7i8j9k0l1m2
Create Date: 2026-03-25
"""
from alembic import op
import sqlalchemy as sa

revision = "i8j9k0l1m2n3"
down_revision = "h7i8j9k0l1m2"
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. BillingRecord.amount: Float → Numeric(12,2) ──────────────────────
    op.alter_column(
        "billing_records",
        "amount",
        existing_type=sa.Float(),
        type_=sa.Numeric(12, 2),
        existing_nullable=False,
        postgresql_using="amount::numeric(12,2)",
    )

    # ── 2. BillingConfig defaults: Float → Numeric(12,2) ────────────────────
    op.alter_column(
        "billing_config",
        "default_amount",
        existing_type=sa.Float(),
        type_=sa.Numeric(12, 2),
        existing_nullable=True,
        postgresql_using="default_amount::numeric(12,2)",
    )

    # ── 3. Temporal indexes on log/history tables for efficient cleanup ──────
    op.create_index("ix_schedule_runs_triggered_at", "schedule_runs", ["triggered_at"])
    op.create_index("ix_policy_logs_triggered_at", "policy_logs", ["triggered_at"])
    op.create_index("ix_notification_deliveries_created_at", "notification_deliveries", ["created_at"])
    op.create_index("ix_alert_events_triggered_at", "alert_events", ["triggered_at"])
    op.create_index("ix_finops_actions_executed_at", "finops_actions", ["executed_at"])
    op.create_index("ix_finops_anomalies_created_at", "finops_anomalies", ["created_at"])


def downgrade():
    op.drop_index("ix_finops_anomalies_created_at", table_name="finops_anomalies")
    op.drop_index("ix_finops_actions_executed_at", table_name="finops_actions")
    op.drop_index("ix_alert_events_triggered_at", table_name="alert_events")
    op.drop_index("ix_notification_deliveries_created_at", table_name="notification_deliveries")
    op.drop_index("ix_policy_logs_triggered_at", table_name="policy_logs")
    op.drop_index("ix_schedule_runs_triggered_at", table_name="schedule_runs")

    op.alter_column(
        "billing_config",
        "default_amount",
        existing_type=sa.Numeric(12, 2),
        type_=sa.Float(),
        existing_nullable=True,
    )
    op.alter_column(
        "billing_records",
        "amount",
        existing_type=sa.Numeric(12, 2),
        type_=sa.Float(),
        existing_nullable=False,
    )
