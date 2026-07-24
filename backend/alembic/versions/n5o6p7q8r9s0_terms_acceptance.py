"""terms_acceptance table

Revision ID: n5o6p7q8r9s0
Revises: m5n6o7p8q9r0
Create Date: 2026-05-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'n5o6p7q8r9s0'
down_revision = 'm5n6o7p8q9r0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'terms_acceptances',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('version', sa.String(20), nullable=False),
        sa.Column('accepted_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
    )
    op.create_index('ix_terms_acceptances_user_version', 'terms_acceptances', ['user_id', 'version'])


def downgrade():
    op.drop_index('ix_terms_acceptances_user_version', table_name='terms_acceptances')
    op.drop_table('terms_acceptances')
