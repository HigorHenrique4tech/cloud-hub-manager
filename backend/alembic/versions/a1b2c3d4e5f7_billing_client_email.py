"""add client_email to billing_records

Revision ID: a1b2c3d4e5f7
Revises: z6a1b2c3d4e5
Create Date: 2026-03-18 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f7"
down_revision = "z6a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("billing_records", sa.Column("client_email", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("billing_records", "client_email")
