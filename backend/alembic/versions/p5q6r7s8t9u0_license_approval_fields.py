"""migration_licenses: add status, admin_notes, reviewed_by, reviewed_at

Revision ID: p5q6r7s8t9u0
Revises: o4p5q6r7s8t9
Create Date: 2026-04-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'p5q6r7s8t9u0'
down_revision = 'o4p5q6r7s8t9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('migration_licenses',
                  sa.Column('status', sa.String(20), nullable=False, server_default='approved'))
    op.add_column('migration_licenses',
                  sa.Column('admin_notes', sa.Text(), nullable=True))
    op.add_column('migration_licenses',
                  sa.Column('reviewed_by', UUID(as_uuid=True),
                            sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.add_column('migration_licenses',
                  sa.Column('reviewed_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('migration_licenses', 'reviewed_at')
    op.drop_column('migration_licenses', 'reviewed_by')
    op.drop_column('migration_licenses', 'admin_notes')
    op.drop_column('migration_licenses', 'status')
