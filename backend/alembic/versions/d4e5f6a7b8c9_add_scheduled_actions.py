"""add_scheduled_actions

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-02-20 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scheduled_actions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("resource_id", sa.String(500), nullable=False),
        sa.Column("resource_name", sa.String(255), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column("schedule_type", sa.String(20), nullable=False, server_default="weekdays"),
        sa.Column("schedule_time", sa.String(5), nullable=False),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="America/Sao_Paulo"),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
        sa.Column("last_run_status", sa.String(10), nullable=True),
        sa.Column("last_run_error", sa.String(500), nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_scheduled_actions_ws_enabled",
        "scheduled_actions",
        ["workspace_id", "is_enabled"],
    )


def downgrade() -> None:
    op.drop_index("ix_scheduled_actions_ws_enabled", table_name="scheduled_actions")
    op.drop_table("scheduled_actions")
