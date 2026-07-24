"""add_finops_scan_schedule

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-02-25 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "g7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "finops_scan_schedules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("schedule_type", sa.String(20), nullable=False),
        sa.Column("schedule_time", sa.String(5), nullable=False),
        sa.Column("timezone", sa.String(50), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False, server_default="all"),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
        sa.Column("last_run_status", sa.String(10), nullable=True),
        sa.Column("last_run_error", sa.String(500), nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_unique_constraint(
        "uq_finops_scan_ws",
        "finops_scan_schedules",
        ["workspace_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_finops_scan_ws", "finops_scan_schedules", type_="unique")
    op.drop_table("finops_scan_schedules")
