"""Add composite indexes on activity_logs and billing_records

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2026-03-26
"""
from alembic import op

revision = "j9k0l1m2n3o4"
down_revision = "i8j9k0l1m2n3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ActivityLog composite indexes for paginated feeds
    op.create_index("ix_activity_ws_created", "activity_logs", ["workspace_id", "created_at"])
    op.create_index("ix_activity_user_created", "activity_logs", ["user_id", "created_at"])

    # BillingRecord composite indexes for filtered queries and duplicate checks
    op.create_index("ix_billing_status_created", "billing_records", ["status", "created_at"])
    op.create_index("ix_billing_client_period", "billing_records", ["client_name", "period_ref"])


def downgrade() -> None:
    op.drop_index("ix_billing_client_period", table_name="billing_records")
    op.drop_index("ix_billing_status_created", table_name="billing_records")
    op.drop_index("ix_activity_user_created", table_name="activity_logs")
    op.drop_index("ix_activity_ws_created", table_name="activity_logs")
