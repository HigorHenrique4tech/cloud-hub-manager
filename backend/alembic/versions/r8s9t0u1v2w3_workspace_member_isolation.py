"""workspace member isolation — backfill existing members

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-03-08

Changes:
- Backfills workspace_members so every active org member gets a row in every
  active workspace of their org. This preserves existing access when the new
  gate (requires explicit WorkspaceMember row) is deployed.
- No schema changes — the table already exists with all required columns.
"""

from alembic import op

revision = 'r8s9t0u1v2w3'
down_revision = 'q7r8s9t0u1v2'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        INSERT INTO workspace_members (id, workspace_id, user_id, role_override, created_at)
        SELECT
            gen_random_uuid(),
            w.id,
            om.user_id,
            NULL,
            now()
        FROM workspaces w
        JOIN organization_members om ON om.organization_id = w.organization_id
        WHERE om.is_active = true
          AND w.is_active = true
        ON CONFLICT (workspace_id, user_id) DO NOTHING;
    """)


def downgrade():
    # Backfill rows cannot be safely removed (indistinguishable from legitimate rows).
    pass
