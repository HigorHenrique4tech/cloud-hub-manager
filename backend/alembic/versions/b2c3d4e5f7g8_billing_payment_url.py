"""Add payment fields to billing_records (AbacatePay PIX)

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
    op.add_column("billing_records", sa.Column("pix_br_code", sa.Text(), nullable=True))
    op.add_column("billing_records", sa.Column("pix_qr_base64", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("billing_records", "pix_qr_base64")
    op.drop_column("billing_records", "pix_br_code")
    op.drop_column("billing_records", "payment_id")
