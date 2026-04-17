"""GCP BigQuery billing export fields on cloud_accounts

Revision ID: c9d0e1f2g3h4
Revises: b8c9d0e1f2g3
Create Date: 2026-04-17 11:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'c9d0e1f2g3h4'
down_revision = 'b8c9d0e1f2g3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cloud_accounts', sa.Column('bigquery_project', sa.String(255), nullable=True))
    op.add_column('cloud_accounts', sa.Column('bigquery_dataset', sa.String(255), nullable=True))
    op.add_column('cloud_accounts', sa.Column('bigquery_table', sa.String(255), nullable=True))
    op.add_column('cloud_accounts', sa.Column('billing_export_enabled', sa.Boolean, server_default='false', nullable=False))


def downgrade():
    op.drop_column('cloud_accounts', 'billing_export_enabled')
    op.drop_column('cloud_accounts', 'bigquery_table')
    op.drop_column('cloud_accounts', 'bigquery_dataset')
    op.drop_column('cloud_accounts', 'bigquery_project')
