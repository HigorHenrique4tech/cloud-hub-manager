"""schedule_runs table + custom_days/monthly_days on scheduled_actions

Revision ID: g6h7i8j9k0l1
Revises: f5g6h7i8j9k0
Create Date: 2026-03-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "g6h7i8j9k0l1"
down_revision = "f5g6h7i8j9k0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "schedule_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("schedule_id", UUID(as_uuid=True), sa.ForeignKey("scheduled_actions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("triggered_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("trigger_type", sa.String(10), nullable=False, server_default="scheduled"),
    )
    op.create_index("ix_schedule_runs_schedule_triggered", "schedule_runs", ["schedule_id", sa.text("triggered_at DESC")])

    op.add_column("scheduled_actions", sa.Column("custom_days", JSONB, nullable=True))
    op.add_column("scheduled_actions", sa.Column("monthly_days", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("scheduled_actions", "monthly_days")
    op.drop_column("scheduled_actions", "custom_days")
    op.drop_index("ix_schedule_runs_schedule_triggered", table_name="schedule_runs")
    op.drop_table("schedule_runs")
