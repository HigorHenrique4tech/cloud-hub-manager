"""add_finops_tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "finops_recommendations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("cloud_account_id", UUID(as_uuid=True), sa.ForeignKey("cloud_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("resource_id", sa.String(255), nullable=False),
        sa.Column("resource_name", sa.String(255), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column("recommendation_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("estimated_saving_monthly", sa.Float, nullable=False, server_default="0"),
        sa.Column("current_monthly_cost", sa.Float, nullable=False, server_default="0"),
        sa.Column("reasoning", sa.Text, nullable=False),
        sa.Column("current_spec", JSONB, nullable=True),
        sa.Column("recommended_spec", JSONB, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending", index=True),
        sa.Column("detected_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("applied_at", sa.DateTime, nullable=True),
        sa.Column("applied_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    op.create_table(
        "finops_budgets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False, server_default="all"),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("period", sa.String(20), nullable=False, server_default="monthly"),
        sa.Column("start_date", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("alert_threshold", sa.Float, nullable=False, server_default="0.8"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "finops_actions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("recommendation_id", UUID(as_uuid=True), sa.ForeignKey("finops_recommendations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("resource_id", sa.String(255), nullable=False),
        sa.Column("resource_name", sa.String(255), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("estimated_saving", sa.Float, nullable=False, server_default="0"),
        sa.Column("status", sa.String(30), nullable=False, server_default="executed", index=True),
        sa.Column("executed_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("executed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rollback_data", JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
    )

    op.create_table(
        "finops_anomalies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("service_name", sa.String(255), nullable=False),
        sa.Column("detected_date", sa.DateTime, nullable=False),
        sa.Column("baseline_cost", sa.Float, nullable=False),
        sa.Column("actual_cost", sa.Float, nullable=False),
        sa.Column("deviation_pct", sa.Float, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("finops_anomalies")
    op.drop_table("finops_actions")
    op.drop_table("finops_budgets")
    op.drop_table("finops_recommendations")
