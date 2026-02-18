"""add_oauth_fields_to_users

Revision ID: a1b2c3d4e5f6
Revises: 9776e03cc232
Create Date: 2026-02-18 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9776e03cc232'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add OAuth fields to users table."""
    op.add_column("users", sa.Column("oauth_provider", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("oauth_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(500), nullable=True))


def downgrade() -> None:
    """Remove OAuth fields from users table."""
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "oauth_id")
    op.drop_column("users", "oauth_provider")
