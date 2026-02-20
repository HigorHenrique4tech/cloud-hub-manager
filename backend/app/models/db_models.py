import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Text, Float, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


# ── Multi-tenant ────────────────────────────────────────────────────────────


class Organization(Base):
    __tablename__ = "organizations"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name       = Column(String(255), nullable=False)
    slug       = Column(String(100), unique=True, nullable=False, index=True)
    plan_tier  = Column(String(50), nullable=False, default="free")  # free | pro | enterprise
    is_active  = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    members    = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")
    workspaces = relationship("Workspace", back_populates="organization", cascade="all, delete-orphan")


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_member"),
        Index("ix_orgmember_org_role", "organization_id", "role"),
    )

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role            = Column(String(50), nullable=False, default="viewer")  # owner | admin | operator | viewer | billing
    is_active       = Column(Boolean, default=True, nullable=False)
    invited_by      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    joined_at       = Column(DateTime, default=datetime.utcnow, nullable=False)

    organization = relationship("Organization", back_populates="members")
    user         = relationship("User", foreign_keys=[user_id])


class PendingInvitation(Base):
    __tablename__ = "pending_invitations"
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_pending_invite_org_email"),
        Index("ix_pending_invite_token", "token"),
        Index("ix_pending_invite_email", "email"),
    )

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    email           = Column(String(255), nullable=False)
    role            = Column(String(50), nullable=False, default="viewer")
    token           = Column(String(255), unique=True, nullable=False)
    invited_by      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at      = Column(DateTime, nullable=False)
    accepted_at     = Column(DateTime, nullable=True)

    organization = relationship("Organization")
    inviter      = relationship("User", foreign_keys=[invited_by])


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_workspace_org_slug"),
    )

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name            = Column(String(255), nullable=False)
    slug            = Column(String(100), nullable=False)
    description     = Column(Text, nullable=True)
    is_active       = Column(Boolean, default=True, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    organization   = relationship("Organization", back_populates="workspaces")
    cloud_accounts = relationship("CloudAccount", back_populates="workspace", cascade="all, delete-orphan")
    ws_members     = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_ws_member"),
    )

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id  = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id       = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role_override = Column(String(50), nullable=True)  # NULL = inherit org role
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace", back_populates="ws_members")
    user      = relationship("User")


class CloudAccount(Base):
    __tablename__ = "cloud_accounts"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id   = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    provider       = Column(String(50), nullable=False)   # aws | azure
    label          = Column(String(255), nullable=False, default="default")
    account_id     = Column(String(255), nullable=True)   # AWS account ID or Azure subscription ID (display)
    encrypted_data = Column(Text, nullable=False)         # Fernet-encrypted JSON
    is_active      = Column(Boolean, default=True, nullable=False)
    created_by     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace", back_populates="cloud_accounts")

    __table_args__ = (
        Index("ix_cloudaccount_ws_provider", "workspace_id", "provider"),
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(255), nullable=False, index=True)  # SHA-256
    expires_at = Column(DateTime, nullable=False)
    revoked    = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    user_agent = Column(String(500), nullable=True)
    ip_address = Column(String(50), nullable=True)

    user = relationship("User")


# ── Identity ────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email              = Column(String(255), unique=True, nullable=False, index=True)
    name               = Column(String(255), nullable=False)
    hashed_password    = Column(String(255), nullable=False)
    is_active          = Column(Boolean, default=True, nullable=False)
    is_verified        = Column(Boolean, default=False, nullable=False)
    verification_token = Column(String(255), nullable=True, index=True)
    default_org_id     = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    oauth_provider     = Column(String(50), nullable=True)    # "google" | "github" | None
    oauth_id           = Column(String(255), nullable=True)   # Provider's user ID
    avatar_url         = Column(String(500), nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at         = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    org_memberships  = relationship("OrganizationMember", foreign_keys="OrganizationMember.user_id", back_populates="user")


class CostAlert(Base):
    __tablename__ = "cost_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    cloud_account_id = Column(UUID(as_uuid=True), ForeignKey("cloud_accounts.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    provider = Column(String(50), nullable=False)       # 'aws' | 'azure' | 'all'
    service = Column(String(255), nullable=True)        # specific service or None = all
    threshold_type = Column(String(50), nullable=False) # 'fixed' | 'percentage'
    threshold_value = Column(Float, nullable=False)
    period = Column(String(20), nullable=False)         # 'daily' | 'monthly'
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    events = relationship("AlertEvent", back_populates="alert", cascade="all, delete-orphan")


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_id = Column(UUID(as_uuid=True), ForeignKey("cost_alerts.id", ondelete="CASCADE"), nullable=False)
    triggered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    current_value = Column(Float, nullable=False)
    threshold_value = Column(Float, nullable=False)
    message = Column(String(500), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)

    alert = relationship("CostAlert", back_populates="events")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    workspace_id    = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True)
    user_name       = Column(String(255), nullable=False, default="")
    user_email      = Column(String(255), nullable=False, default="")
    action          = Column(String(100), nullable=False, index=True)
    resource_type   = Column(String(100), nullable=False)
    resource_id     = Column(String(255), nullable=True)
    resource_name   = Column(String(255), nullable=True)
    provider        = Column(String(50),  nullable=False, default="system")
    status          = Column(String(20),  nullable=False, default="success")
    detail          = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


# ── Payments ───────────────────────────────────────────────────────────────


class Payment(Base):
    __tablename__ = "payments"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id    = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id            = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    abacate_billing_id = Column(String(255), nullable=True, index=True)
    plan_tier          = Column(String(50), nullable=False)
    amount             = Column(Integer, nullable=False)          # centavos
    status             = Column(String(50), nullable=False, default="PENDING")  # PENDING | PAID | EXPIRED | CANCELLED | REFUNDED
    payment_url        = Column(String(500), nullable=True)
    payment_method     = Column(String(50), nullable=True)        # PIX | CARD
    created_at         = Column(DateTime, default=datetime.utcnow, nullable=False)
    paid_at            = Column(DateTime, nullable=True)

    organization = relationship("Organization")
    user         = relationship("User")


# ── FinOps ─────────────────────────────────────────────────────────────────


class FinOpsRecommendation(Base):
    __tablename__ = "finops_recommendations"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id            = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    cloud_account_id        = Column(UUID(as_uuid=True), ForeignKey("cloud_accounts.id", ondelete="SET NULL"), nullable=True)
    provider                = Column(String(20), nullable=False)   # aws | azure
    resource_id             = Column(String(255), nullable=False)
    resource_name           = Column(String(255), nullable=False)
    resource_type           = Column(String(100), nullable=False)  # ec2 | ebs | elastic_ip | rds | snapshot | lambda | vm | managed_disk | public_ip | sql | app_service
    region                  = Column(String(100), nullable=True)
    recommendation_type     = Column(String(50), nullable=False)   # right_size | stop | delete | schedule | reserve
    severity                = Column(String(20), nullable=False, default="medium")  # high | medium | low
    estimated_saving_monthly = Column(Float, nullable=False, default=0.0)
    current_monthly_cost    = Column(Float, nullable=False, default=0.0)
    reasoning               = Column(Text, nullable=False)
    current_spec            = Column(JSONB, nullable=True)    # {"instance_type": "m5.xlarge"}
    recommended_spec        = Column(JSONB, nullable=True)    # {"instance_type": "m5.large"}
    status                  = Column(String(20), nullable=False, default="pending", index=True)  # pending | applied | dismissed | failed
    detected_at             = Column(DateTime, default=datetime.utcnow, nullable=False)
    applied_at              = Column(DateTime, nullable=True)
    applied_by              = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class FinOpsBudget(Base):
    __tablename__ = "finops_budgets"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id    = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name            = Column(String(255), nullable=False)
    provider        = Column(String(20), nullable=False, default="all")  # aws | azure | all
    amount          = Column(Float, nullable=False)
    period          = Column(String(20), nullable=False, default="monthly")  # monthly | quarterly | annual
    start_date      = Column(DateTime, nullable=False, default=datetime.utcnow)
    alert_threshold = Column(Float, nullable=False, default=0.8)  # 0.8 = alert at 80%
    is_active       = Column(Boolean, default=True, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)


class FinOpsAction(Base):
    __tablename__ = "finops_actions"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id      = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    recommendation_id = Column(UUID(as_uuid=True), ForeignKey("finops_recommendations.id", ondelete="SET NULL"), nullable=True)
    action_type       = Column(String(50), nullable=False)   # right_size | stop | delete | release_ip | rollback
    provider          = Column(String(20), nullable=False)
    resource_id       = Column(String(255), nullable=False)
    resource_name     = Column(String(255), nullable=False)
    resource_type     = Column(String(100), nullable=False)
    estimated_saving  = Column(Float, nullable=False, default=0.0)
    status            = Column(String(30), nullable=False, default="executed", index=True)  # executed | failed | rolled_back
    executed_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    executed_by       = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rollback_data     = Column(JSONB, nullable=True)   # data to reverse the action
    error_message     = Column(Text, nullable=True)

    recommendation = relationship("FinOpsRecommendation", foreign_keys=[recommendation_id])


class FinOpsAnomaly(Base):
    __tablename__ = "finops_anomalies"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id   = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    provider       = Column(String(20), nullable=False)
    service_name   = Column(String(255), nullable=False)
    detected_date  = Column(DateTime, nullable=False)
    baseline_cost  = Column(Float, nullable=False)
    actual_cost    = Column(Float, nullable=False)
    deviation_pct  = Column(Float, nullable=False)
    status         = Column(String(20), nullable=False, default="open")  # open | acknowledged | resolved
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
