"""initial_schema

Revision ID: 9776e03cc232
Revises:
Create Date: 2026-02-18 15:11:09.620746

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '9776e03cc232'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables for the initial CloudAtlas schema."""

    # ── Organizations ────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("plan_tier", sa.String(50), nullable=False, server_default="free"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── Users ────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("verification_token", sa.String(255), nullable=True, index=True),
        sa.Column("default_org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── Organization Members ─────────────────────────────────────────────
    op.create_table(
        "organization_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(50), nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("invited_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("joined_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_member"),
    )
    op.create_index("ix_orgmember_org_role", "organization_members", ["organization_id", "role"])

    # ── Pending Invitations ──────────────────────────────────────────────
    op.create_table(
        "pending_invitations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="viewer"),
        sa.Column("token", sa.String(255), unique=True, nullable=False),
        sa.Column("invited_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("organization_id", "email", name="uq_pending_invite_org_email"),
    )
    op.create_index("ix_pending_invite_token", "pending_invitations", ["token"])
    op.create_index("ix_pending_invite_email", "pending_invitations", ["email"])

    # ── Workspaces ───────────────────────────────────────────────────────
    op.create_table(
        "workspaces",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "slug", name="uq_workspace_org_slug"),
    )

    # ── Workspace Members ────────────────────────────────────────────────
    op.create_table(
        "workspace_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role_override", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_ws_member"),
    )

    # ── Cloud Accounts ───────────────────────────────────────────────────
    op.create_table(
        "cloud_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("label", sa.String(255), nullable=False, server_default="default"),
        sa.Column("account_id", sa.String(255), nullable=True),
        sa.Column("encrypted_data", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_cloudaccount_ws_provider", "cloud_accounts", ["workspace_id", "provider"])

    # ── Refresh Tokens ───────────────────────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(255), nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
    )

    # ── Cost Alerts ──────────────────────────────────────────────────────
    op.create_table(
        "cost_alerts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cloud_account_id", UUID(as_uuid=True), sa.ForeignKey("cloud_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("service", sa.String(255), nullable=True),
        sa.Column("threshold_type", sa.String(50), nullable=False),
        sa.Column("threshold_value", sa.Float(), nullable=False),
        sa.Column("period", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── Alert Events ─────────────────────────────────────────────────────
    op.create_table(
        "alert_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("alert_id", UUID(as_uuid=True), sa.ForeignKey("cost_alerts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("triggered_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("current_value", sa.Float(), nullable=False),
        sa.Column("threshold_value", sa.Float(), nullable=False),
        sa.Column("message", sa.String(500), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
    )

    # ── Activity Logs ────────────────────────────────────────────────────
    op.create_table(
        "activity_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("user_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("user_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("action", sa.String(100), nullable=False, index=True),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(255), nullable=True),
        sa.Column("resource_name", sa.String(255), nullable=True),
        sa.Column("provider", sa.String(50), nullable=False, server_default="system"),
        sa.Column("status", sa.String(20), nullable=False, server_default="success"),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now(), index=True),
    )

    # ── Payments ─────────────────────────────────────────────────────────
    op.create_table(
        "payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("abacate_billing_id", sa.String(255), nullable=True, index=True),
        sa.Column("plan_tier", sa.String(50), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="PENDING"),
        sa.Column("payment_url", sa.String(500), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Drop all tables in reverse dependency order."""
    op.drop_table("payments")
    op.drop_table("activity_logs")
    op.drop_table("alert_events")
    op.drop_table("cost_alerts")
    op.drop_table("refresh_tokens")
    op.drop_table("cloud_accounts")
    op.drop_table("workspace_members")
    op.drop_table("workspaces")
    op.drop_table("pending_invitations")
    op.drop_table("organization_members")
    op.drop_table("users")
    op.drop_table("organizations")
