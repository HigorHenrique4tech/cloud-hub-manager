"""Add payment_url and payment_id to billing_records

Revision ID: b2c3d4e5f7g8
Revises: a1b2c3d4e5f7
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "b2c3d4e5f7g8"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("billing_records", sa.Column("payment_id", sa.String(255), nullable=True))
    op.add_column("billing_records", sa.Column("payment_url", sa.String(512), nullable=True))


def downgrade():
    op.drop_column("billing_records", "payment_url")
    op.drop_column("billing_records", "payment_id")
