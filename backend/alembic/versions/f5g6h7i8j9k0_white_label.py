"""white-label branding fields on organizations

Revision ID: f5g6h7i8j9k0
Revises: e5f7g8h9i0j1
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa

revision = "f5g6h7i8j9k0"
down_revision = "e5f7g8h9i0j1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("wl_platform_name", sa.String(100), nullable=True))
    op.add_column("organizations", sa.Column("wl_logo_light", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("wl_logo_dark", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("wl_logo_mime", sa.String(50), nullable=True))
    op.add_column("organizations", sa.Column("wl_favicon", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("wl_favicon_mime", sa.String(50), nullable=True))
    op.add_column("organizations", sa.Column("wl_color_primary", sa.String(7), nullable=True))
    op.add_column("organizations", sa.Column("wl_color_accent", sa.String(7), nullable=True))
    op.add_column("organizations", sa.Column("wl_powered_by", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("organizations", sa.Column("wl_email_sender_name", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "wl_email_sender_name")
    op.drop_column("organizations", "wl_powered_by")
    op.drop_column("organizations", "wl_color_accent")
    op.drop_column("organizations", "wl_color_primary")
    op.drop_column("organizations", "wl_favicon_mime")
    op.drop_column("organizations", "wl_favicon")
    op.drop_column("organizations", "wl_logo_mime")
    op.drop_column("organizations", "wl_logo_dark")
    op.drop_column("organizations", "wl_logo_light")
    op.drop_column("organizations", "wl_platform_name")
