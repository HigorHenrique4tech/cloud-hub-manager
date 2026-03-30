"""Migration365 professional tables — ledger, checkpoints, mailbox phase fields

Revision ID: l1m2n3o4p5q6
Revises: k0l1m2n3o4p5
Create Date: 2026-03-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy import inspect as sa_inspect

revision = 'l1m2n3o4p5q6'
down_revision = 'k0l1m2n3o4p5'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing = inspector.get_table_names()

    # ── migration_message_ledger ──────────────────────────────────────────────
    if 'migration_message_ledger' not in existing:
        op.create_table(
            'migration_message_ledger',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('mailbox_id', UUID(as_uuid=True),
                      sa.ForeignKey('migration_mailboxes.id', ondelete='CASCADE'),
                      nullable=False),
            sa.Column('source_uid', sa.String(500), nullable=False),
            sa.Column('source_folder', sa.String(500), nullable=False),
            sa.Column('message_id_header', sa.String(500), nullable=True),
            sa.Column('content_hash', sa.String(64), nullable=True),
            sa.Column('dest_message_id', sa.String(500), nullable=True),
            sa.Column('size_bytes', sa.BigInteger(), nullable=True),
            sa.Column('status', sa.String(20), nullable=False, server_default='copied'),
            # pending | copied | verified | skipped | failed
            sa.Column('error', sa.Text(), nullable=True),
            sa.Column('copied_at', sa.DateTime(), nullable=True),
            sa.Column('verified_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_ledger_mailbox_status',
                        'migration_message_ledger', ['mailbox_id', 'status'])
        op.create_index('ix_ledger_msg_id',
                        'migration_message_ledger', ['message_id_header'])
        # Unicidade: mesmo folder + uid por mailbox nunca duplica
        op.create_unique_constraint(
            'uq_ledger_uid',
            'migration_message_ledger',
            ['mailbox_id', 'source_folder', 'source_uid'],
        )

    # ── migration_folder_checkpoints ─────────────────────────────────────────
    if 'migration_folder_checkpoints' not in existing:
        op.create_table(
            'migration_folder_checkpoints',
            sa.Column('id', UUID(as_uuid=True), primary_key=True),
            sa.Column('mailbox_id', UUID(as_uuid=True),
                      sa.ForeignKey('migration_mailboxes.id', ondelete='CASCADE'),
                      nullable=False),
            sa.Column('folder_path', sa.String(500), nullable=False),
            sa.Column('last_uid', sa.String(500), nullable=True),
            sa.Column('total_in_folder', sa.Integer(), nullable=True),
            sa.Column('copied_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('phase', sa.String(20), nullable=False, server_default='initial'),
            # initial | delta | verify
            sa.Column('completed', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_checkpoints_mailbox',
                        'migration_folder_checkpoints', ['mailbox_id'])
        op.create_unique_constraint(
            'uq_checkpoint_folder',
            'migration_folder_checkpoints',
            ['mailbox_id', 'folder_path'],
        )

    # ── Novos campos em migration_mailboxes ───────────────────────────────────
    existing_cols = {c['name'] for c in inspector.get_columns('migration_mailboxes')}

    if 'phase' not in existing_cols:
        op.add_column('migration_mailboxes',
                      sa.Column('phase', sa.String(20), nullable=True))
        # initial | delta | verify | done

    if 'verified_at' not in existing_cols:
        op.add_column('migration_mailboxes',
                      sa.Column('verified_at', sa.DateTime(), nullable=True))

    if 'verify_result' not in existing_cols:
        op.add_column('migration_mailboxes',
                      sa.Column('verify_result', JSONB, nullable=True))

    # ── Novos campos em migration_projects ────────────────────────────────────
    existing_proj_cols = {c['name'] for c in inspector.get_columns('migration_projects')}

    if 'verified_count' not in existing_proj_cols:
        op.add_column('migration_projects',
                      sa.Column('verified_count', sa.Integer(),
                                nullable=False, server_default='0'))


def downgrade():
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing = inspector.get_table_names()

    for table in ['migration_folder_checkpoints', 'migration_message_ledger']:
        if table in existing:
            op.drop_table(table)

    # Remove colunas adicionadas
    if 'migration_mailboxes' in existing:
        existing_cols = {c['name'] for c in inspector.get_columns('migration_mailboxes')}
        for col in ['phase', 'verified_at', 'verify_result']:
            if col in existing_cols:
                op.drop_column('migration_mailboxes', col)

    if 'migration_projects' in existing:
        existing_proj_cols = {c['name'] for c in inspector.get_columns('migration_projects')}
        if 'verified_count' in existing_proj_cols:
            op.drop_column('migration_projects', 'verified_count')
