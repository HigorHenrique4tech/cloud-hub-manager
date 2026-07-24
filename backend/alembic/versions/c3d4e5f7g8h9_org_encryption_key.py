"""Add encrypted_org_key to organizations for per-org credential encryption

Revision ID: c3d4e5f7g8h9
Revises: b2c3d4e5f7g8
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "c3d4e5f7g8h9"
down_revision = "b2c3d4e5f7g8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("encrypted_org_key", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "encrypted_org_key")
