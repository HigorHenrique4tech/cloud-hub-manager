"""knowledge base tables

Revision ID: i1j2k3l4m5n6
Revises: h8i9j0k1l2m3
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'i1j2k3l4m5n6'
down_revision = 'h8i9j0k1l2m3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'kb_categories',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('slug', sa.String(120), nullable=False, unique=True, index=True),
        sa.Column('icon', sa.String(40), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )

    op.create_table(
        'kb_articles',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('category_id', UUID(as_uuid=True),
                  sa.ForeignKey('kb_categories.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False, unique=True, index=True),
        sa.Column('summary', sa.String(400), nullable=True),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_kb_articles_category_order', 'kb_articles', ['category_id', 'order'])

    op.execute("""
        CREATE INDEX ix_kb_articles_fts
        ON kb_articles
        USING GIN (to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, '')))
    """)

    op.create_table(
        'kb_article_videos',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('article_id', UUID(as_uuid=True),
                  sa.ForeignKey('kb_articles.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('title', sa.String(200), nullable=True),
        sa.Column('s3_key', sa.String(500), nullable=False),
        sa.Column('content_type', sa.String(80), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('thumbnail_s3_key', sa.String(500), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )


def downgrade():
    op.drop_table('kb_article_videos')
    op.execute('DROP INDEX IF EXISTS ix_kb_articles_fts')
    op.drop_index('ix_kb_articles_category_order', table_name='kb_articles')
    op.drop_table('kb_articles')
    op.drop_table('kb_categories')
