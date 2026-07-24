"""Add spend tracking to finops_budgets and report_schedules table.

Revision ID: k1f2g3h4i5j6
Revises: j0e1f2g3h4i5
Create Date: 2026-02-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'k1f2g3h4i5j6'
down_revision = 'j0e1f2g3h4i5'
branch_labels = None
depends_on = None


def upgrade():
    # Add spend-tracking columns to existing finops_budgets table
    op.add_column('finops_budgets',
        sa.Column('last_spend', sa.Float(), nullable=True))
    op.add_column('finops_budgets',
        sa.Column('last_evaluated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('finops_budgets',
        sa.Column('alert_sent_at', sa.DateTime(timezone=True), nullable=True))

    # Create report_schedules table
    op.create_table(
        'report_schedules',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('schedule_type', sa.String(20), nullable=False),
        sa.Column('send_day', sa.Integer(), nullable=False),
        sa.Column('send_time', sa.String(5), nullable=False),
        sa.Column('timezone', sa.String(64), nullable=False,
                  server_default='America/Sao_Paulo'),
        sa.Column('recipients', postgresql.JSONB(), nullable=False,
                  server_default='[]'),
        sa.Column('include_budgets', sa.Boolean(), nullable=False,
                  server_default='true'),
        sa.Column('include_finops', sa.Boolean(), nullable=False,
                  server_default='true'),
        sa.Column('include_costs', sa.Boolean(), nullable=False,
                  server_default='true'),
        sa.Column('is_enabled', sa.Boolean(), nullable=False,
                  server_default='true'),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_run_status', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.UniqueConstraint('workspace_id', name='uq_report_schedule_workspace'),
    )
    op.create_index('ix_report_schedules_workspace_id',
                    'report_schedules', ['workspace_id'])


def downgrade():
    op.drop_index('ix_report_schedules_workspace_id', table_name='report_schedules')
    op.drop_table('report_schedules')
    op.drop_column('finops_budgets', 'alert_sent_at')
    op.drop_column('finops_budgets', 'last_evaluated_at')
    op.drop_column('finops_budgets', 'last_spend')
