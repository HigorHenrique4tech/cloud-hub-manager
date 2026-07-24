"""Add currency display settings to organizations

Revision ID: e5f7g8h9i0j1
Revises: d4e5f7g8h9i0
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "e5f7g8h9i0j1"
down_revision = "d4e5f7g8h9i0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("currency_display", sa.String(10), nullable=False, server_default="USD"))
    op.add_column("organizations", sa.Column("exchange_rate_brl", sa.Float(), nullable=True))
    op.add_column("organizations", sa.Column("exchange_rate_auto", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("organizations", sa.Column("exchange_rate_updated_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "exchange_rate_updated_at")
    op.drop_column("organizations", "exchange_rate_auto")
    op.drop_column("organizations", "exchange_rate_brl")
    op.drop_column("organizations", "currency_display")
