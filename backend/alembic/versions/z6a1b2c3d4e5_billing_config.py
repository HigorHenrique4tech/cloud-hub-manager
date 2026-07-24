"""billing_config table

Revision ID: z6a1b2c3d4e5
Revises: y5z6a1b2c3d4
Create Date: 2026-03-18 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "z6a1b2c3d4e5"
down_revision = "y5z6a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "billing_config",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("auto_generate_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("default_amount", sa.Float(), nullable=True),
        sa.Column("default_due_day", sa.Integer(), nullable=False, server_default=sa.text("10")),
        sa.Column("default_period_type", sa.String(10), nullable=False, server_default=sa.text("'monthly'")),
        sa.Column("reminder_days_before", sa.Integer(), nullable=False, server_default=sa.text("3")),
        sa.Column("reminder_days_after", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("auto_overdue_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("auto_overdue_days", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("notes_template", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("billing_config")
