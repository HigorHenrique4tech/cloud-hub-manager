"""add org hierarchy (parent_org_id, org_type)

Revision ID: h8c9d0e1f2g3
Revises: g7b8c9d0e1f2
Create Date: 2026-02-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "h8c9d0e1f2g3"
down_revision = "g7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "organizations",
        sa.Column(
            "org_type",
            sa.String(20),
            nullable=False,
            server_default="standalone",
        ),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "parent_org_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_organizations_parent_org_id",
        "organizations",
        ["parent_org_id"],
    )


def downgrade():
    op.drop_index("ix_organizations_parent_org_id", table_name="organizations")
    op.drop_column("organizations", "parent_org_id")
    op.drop_column("organizations", "org_type")
