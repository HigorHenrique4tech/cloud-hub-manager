"""user company info fields

Revision ID: h8i9j0k1l2m3
Revises: g8h9i0j1k2l3
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa

revision = "h8i9j0k1l2m3"
down_revision = "g8h9i0j1k2l3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("phone", sa.String(30), nullable=True))
    op.add_column("users", sa.Column("company_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("cnpj", sa.String(18), nullable=True))
    op.add_column("organizations", sa.Column("phone", sa.String(30), nullable=True))
    op.add_column("organizations", sa.Column("cnpj", sa.String(18), nullable=True))


def downgrade():
    op.drop_column("users", "phone")
    op.drop_column("users", "company_name")
    op.drop_column("users", "cnpj")
    op.drop_column("organizations", "phone")
    op.drop_column("organizations", "cnpj")
