"""Restructure plans: Pro → Basic/Standard, Enterprise → E1/E2/E3

Revision ID: a0b1c2d3e4f5
Revises: z6a1b2c3d4e5
Create Date: 2026-04-19 10:00:00.000000

New plan tiers:
- basic (R$ 397/mês): 3 users, 5 workspaces
- standard (R$ 797/mês): 10 users, 25 workspaces
- enterprise_e1 (R$ 2.997/mês): 20 users, 50 workspaces
- enterprise_e2 (R$ 4.997/mês): 40 users, 100 workspaces
- enterprise_e3 (R$ 7.997/mês): 80 users, 200 workspaces

Legacy migration path:
- "pro" → "standard" (closest match in capacity)
- "enterprise" → "enterprise_e1" (base tier)
"""
from alembic import op

revision = 'a0b1c2d3e4f5'
down_revision = 'z6a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    # Update existing organizations with old plan tiers to new ones
    op.execute("""
        UPDATE organizations
        SET plan_tier = 'standard'
        WHERE plan_tier = 'pro'
    """)

    op.execute("""
        UPDATE organizations
        SET plan_tier = 'enterprise_e1'
        WHERE plan_tier = 'enterprise'
    """)


def downgrade():
    # Revert plan tier updates
    op.execute("""
        UPDATE organizations
        SET plan_tier = 'pro'
        WHERE plan_tier = 'standard'
    """)

    op.execute("""
        UPDATE organizations
        SET plan_tier = 'enterprise'
        WHERE plan_tier = 'enterprise_e1'
    """)
