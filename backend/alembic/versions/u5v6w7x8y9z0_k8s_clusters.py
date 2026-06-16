"""k8s clusters registry

Revision ID: u5v6w7x8y9z0
Revises: t4u5v6w7x8y9
Create Date: 2026-06-15

Registro agentless de clusters Kubernetes (AKS/EKS/GKE descobertos ou
kubeconfig importado manualmente). O kubeconfig é armazenado cifrado com
Fernet (chave per-org), espelhando cloud_accounts.encrypted_data.
Workloads NÃO são snapshotados — são lidos ao vivo do API server.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'u5v6w7x8y9z0'
down_revision = 't4u5v6w7x8y9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'k8s_clusters',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', UUID(as_uuid=True),
                  sa.ForeignKey('workspaces.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('source', sa.String(20), nullable=False, server_default='manual'),  # aks|eks|gke|manual
        sa.Column('cloud_account_id', UUID(as_uuid=True),
                  sa.ForeignKey('cloud_accounts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('provider_cluster_id', sa.String(512), nullable=True),
        sa.Column('region', sa.String(64), nullable=True),
        sa.Column('distribution', sa.String(40), nullable=True),
        sa.Column('k8s_version', sa.String(32), nullable=True),
        sa.Column('endpoint', sa.Text(), nullable=True),
        sa.Column('encrypted_kubeconfig', sa.Text(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='unknown'),  # connected|unreachable|unknown
        sa.Column('node_count', sa.Integer(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_by', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('workspace_id', 'name', name='uq_k8s_cluster_ws_name'),
    )
    op.create_index('ix_k8s_clusters_ws', 'k8s_clusters', ['workspace_id'])


def downgrade():
    op.drop_index('ix_k8s_clusters_ws', table_name='k8s_clusters')
    op.drop_table('k8s_clusters')
