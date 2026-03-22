"""Add trial_ends_at to organizations for 30-day Pro trial

Revision ID: d4e5f7g8h9i0
Revises: c3d4e5f7g8h9
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "d4e5f7g8h9i0"
down_revision = "c3d4e5f7g8h9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("trial_ends_at", sa.DateTime(), nullable=True),
    )
    # Populate existing free orgs: trial_ends_at = created_at + 30 days
    op.execute(
        """
        UPDATE organizations
        SET trial_ends_at = created_at + INTERVAL '30 days'
        WHERE plan_tier = 'free' AND trial_ends_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("organizations", "trial_ends_at")
