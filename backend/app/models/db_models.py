import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Text, Float, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


# ── Multi-tenant ────────────────────────────────────────────────────────────


class Organization(Base):
    __tablename__ = "organizations"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name          = Column(String(255), nullable=False)
    slug          = Column(String(100), unique=True, nullable=False, index=True)
    plan_tier     = Column(String(50), nullable=False, default="free")  # free | pro | enterprise
    org_type      = Column(String(20), nullable=False, default="standalone")  # standalone | master | partner
    parent_org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active        = Column(Boolean, default=True, nullable=False)
    notes            = Column(Text, nullable=True)            # internal admin notes (partner SLA, contacts, etc.)
    suspended_reason = Column(String(500), nullable=True)     # reason shown when org is suspended
    suspended_at     = Column(DateTime, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    members    = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")
    workspaces = relationship("Workspace", back_populates="organization", cascade="all, delete-orphan")
    parent_org = relationship("Organization", remote_side="Organization.id", foreign_keys="Organization.parent_org_id", backref="child_orgs")


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
    phone           = Column(String(50), nullable=True)
    department      = Column(String(100), nullable=True)
    notes           = Column(String(500), nullable=True)

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
    mfa_enabled        = Column(Boolean, default=False, nullable=False)
    mfa_otp_hash       = Column(String(64), nullable=True)    # SHA-256 do OTP temporário
    mfa_otp_expires_at = Column(DateTime, nullable=True)
    mfa_otp_attempts   = Column(Integer, default=0, nullable=False)
    is_admin           = Column(Boolean, default=False, nullable=False)
    is_helpdesk        = Column(Boolean, default=False, nullable=False)
    onboarding_completed = Column(Boolean, default=False, nullable=False)
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
    alert_id = Column(UUID(as_uuid=True), ForeignKey("cost_alerts.id", ondelete="CASCADE"), nullable=True)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    triggered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    current_value = Column(Float, nullable=True)
    threshold_value = Column(Float, nullable=True)
    message = Column(String(500), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    notification_type = Column(String(50), default='cost_alert', nullable=False)
    link_to = Column(String(255), nullable=True)

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
    alert_threshold   = Column(Float, nullable=False, default=0.8)  # 0.8 = alert at 80%
    is_active         = Column(Boolean, default=True, nullable=False)
    created_at        = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_spend        = Column(Float, nullable=True)
    last_evaluated_at = Column(DateTime(timezone=True), nullable=True)
    alert_sent_at     = Column(DateTime(timezone=True), nullable=True)
    spend_breakdown   = Column(Text, nullable=True)  # JSON: {"aws": X, "azure": Y, "gcp": Z}


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


# ── Resource Templates ──────────────────────────────────────────────────────


# ── Scheduled Actions ────────────────────────────────────────────────────────


class ScheduledAction(Base):
    __tablename__ = "scheduled_actions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id    = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    provider        = Column(String(20), nullable=False)       # "aws" | "azure"
    resource_id     = Column(String(500), nullable=False)      # "i-0abc" or "rg/vm_name"
    resource_name   = Column(String(255), nullable=False)
    resource_type   = Column(String(50), nullable=False)       # "ec2" | "vm" | "app_service"
    action          = Column(String(10), nullable=False)       # "start" | "stop"
    schedule_type   = Column(String(20), nullable=False, default="weekdays")  # "daily"|"weekdays"|"weekends"
    schedule_time   = Column(String(5), nullable=False)        # "08:00" HH:MM UTC
    timezone        = Column(String(50), nullable=False, default="America/Sao_Paulo")
    is_enabled      = Column(Boolean, default=True, nullable=False)
    last_run_at     = Column(DateTime, nullable=True)
    last_run_status = Column(String(10), nullable=True)        # "success" | "failed"
    last_run_error  = Column(String(500), nullable=True)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace  = relationship("Workspace")
    creator    = relationship("User", foreign_keys=[created_by])


# ── FinOps Scan Schedule ─────────────────────────────────────────────────────


class FinOpsScanSchedule(Base):
    __tablename__ = "finops_scan_schedules"
    __table_args__ = (UniqueConstraint("workspace_id", name="uq_finops_scan_ws"),)

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id    = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    is_enabled      = Column(Boolean, default=True, nullable=False)
    schedule_type   = Column(String(20), nullable=False, default="daily")  # "daily"|"weekdays"|"weekends"
    schedule_time   = Column(String(5), nullable=False)        # "HH:MM"
    timezone        = Column(String(50), nullable=False, default="America/Sao_Paulo")
    provider        = Column(String(20), nullable=False, default="all")  # "all"|"aws"|"azure"
    last_run_at     = Column(DateTime, nullable=True)
    last_run_status = Column(String(10), nullable=True)        # "success"|"failed"
    last_run_error  = Column(String(500), nullable=True)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace")
    creator   = relationship("User", foreign_keys=[created_by])


# ── Approval Flow ─────────────────────────────────────────────────────────────


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id   = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    requester_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_by    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action_type    = Column(String(100), nullable=False)   # apply_recommendation | stop_instance | delete_resource
    action_payload = Column(JSONB, nullable=False)          # all data needed to execute the action
    status         = Column(String(20), nullable=False, default="pending", index=True)  # pending | approved | rejected | cancelled
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    resolved_at    = Column(DateTime, nullable=True)

    workspace  = relationship("Workspace")
    requester  = relationship("User", foreign_keys=[requester_id])
    resolver   = relationship("User", foreign_keys=[resolved_by])


# ── Policy Engine ─────────────────────────────────────────────────────────────


class Policy(Base):
    __tablename__ = "policies"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id      = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by        = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name              = Column(String(255), nullable=False)
    description       = Column(Text, nullable=True)
    provider          = Column(String(20), nullable=False, default="all")  # aws | azure | gcp | all
    conditions        = Column(JSONB, nullable=False)   # {"metric": ..., "operator": ..., "threshold": ..., "window_hours": ...}
    action            = Column(JSONB, nullable=False)   # {"type": ..., "params": {}, "also_notify": bool}
    is_active         = Column(Boolean, default=True, nullable=False)
    last_triggered_at = Column(DateTime, nullable=True)
    trigger_count     = Column(Integer, default=0, nullable=False)
    created_at        = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace")
    creator   = relationship("User", foreign_keys=[created_by])
    logs      = relationship("PolicyLog", back_populates="policy", cascade="all, delete-orphan")


class PolicyLog(Base):
    __tablename__ = "policy_logs"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    policy_id          = Column(UUID(as_uuid=True), ForeignKey("policies.id", ondelete="CASCADE"), nullable=False, index=True)
    triggered_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    condition_snapshot = Column(JSONB, nullable=True)   # actual values that triggered the rule
    action_taken       = Column(String(100), nullable=True)
    result             = Column(String(50), nullable=True)   # success | failed | skipped
    error              = Column(Text, nullable=True)

    policy = relationship("Policy", back_populates="logs")


# ── Executive Reports ─────────────────────────────────────────────────────────


class ExecutiveReportSettings(Base):
    __tablename__ = "executive_report_settings"
    __table_args__ = (UniqueConstraint("workspace_id", name="uq_exec_report_settings_ws"),)

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id            = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    is_enabled              = Column(Boolean, default=False, nullable=False)
    recipients              = Column(JSONB, nullable=False, default=list)  # ["email1", "email2"]
    send_day                = Column(Integer, nullable=False, default=1)   # 1-28
    include_costs           = Column(Boolean, default=True, nullable=False)
    include_anomalies       = Column(Boolean, default=True, nullable=False)
    include_recommendations = Column(Boolean, default=True, nullable=False)
    include_schedules       = Column(Boolean, default=True, nullable=False)
    updated_at              = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace")


class ExecutiveReport(Base):
    __tablename__ = "executive_reports"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    period       = Column(String(7), nullable=False)   # "2025-03"
    status       = Column(String(20), nullable=False, default="generating")  # generating | ready | failed
    pdf_bytes    = Column(Text, nullable=True)          # base64-encoded PDF
    summary_data = Column(JSONB, nullable=True)         # data snapshot used to generate
    generated_at = Column(DateTime, nullable=True)
    sent_at      = Column(DateTime, nullable=True)
    recipients   = Column(JSONB, nullable=True)         # snapshot of recipients at send time
    error        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace")


# ── User Dashboard Config ────────────────────────────────────────────────────


class UserDashboardConfig(Base):
    __tablename__ = "user_dashboard_configs"
    __table_args__ = (
        UniqueConstraint("user_id", "workspace_id", name="uq_user_dashboard_ws"),
    )

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    config       = Column(JSONB, nullable=False)   # [{id, visible, order}]
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user      = relationship("User", foreign_keys=[user_id])
    workspace = relationship("Workspace", foreign_keys=[workspace_id])


# ── Resource Templates ──────────────────────────────────────────────────────


class ResourceTemplate(Base):
    __tablename__ = "resource_templates"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id  = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    provider      = Column(String(50), nullable=False)    # aws | azure
    resource_type = Column(String(100), nullable=False)   # ec2 | s3 | rds | lambda | vpc | vm | storage | vnet | sql | app_service
    name          = Column(String(255), nullable=False)
    description   = Column(Text, nullable=True)
    form_config   = Column(JSONB, nullable=False)          # serialized form state
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# ── Enterprise Leads ──────────────────────────────────────────────────────────


class EnterpriseLead(Base):
    __tablename__ = "enterprise_leads"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    org_id     = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    name       = Column(String(200), nullable=False)
    email      = Column(String(200), nullable=False)
    company    = Column(String(200), nullable=True)
    phone      = Column(String(50), nullable=True)
    message    = Column(Text, nullable=True)
    status     = Column(String(30), nullable=False, default="new")  # new | contacted | converted | lost
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    org  = relationship("Organization", foreign_keys=[org_id])


# ── Billing Records ───────────────────────────────────────────────────────────


class BillingRecord(Base):
    __tablename__ = "billing_records"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id              = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    client_name         = Column(String(255), nullable=False)           # e.g. "Advanced Informática LTDA"
    client_email        = Column(String(255), nullable=True)            # for invoice emails; fallback to org owner
    amount              = Column(Float, nullable=False)                 # in BRL or configured currency
    period_type         = Column(String(10), nullable=False, default="monthly")  # monthly | annual
    period_ref          = Column(String(20), nullable=False)            # e.g. "2026-03" or "2026"
    due_date            = Column(DateTime, nullable=True)
    paid_at             = Column(DateTime, nullable=True)
    status              = Column(String(20), nullable=False, default="pending")  # pending | paid | overdue | cancelled
    notes               = Column(Text, nullable=True)
    attachment_filename = Column(String(255), nullable=True)            # original uploaded filename
    attachment_path     = Column(String(512), nullable=True)            # path on disk
    created_by          = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    is_recurring      = Column(Boolean, nullable=False, default=False)
    recurrence_months = Column(Integer, nullable=True)  # 1 | 3 | 6 | 12

    payment_id        = Column(String(255), nullable=True)   # AbacatePay billing ID
    payment_url       = Column(String(512), nullable=True)   # AbacatePay checkout URL

    org            = relationship("Organization", foreign_keys=[org_id])
    creator        = relationship("User", foreign_keys=[created_by])
    status_history = relationship("BillingStatusHistory", back_populates="record",
                                  cascade="all, delete-orphan",
                                  order_by="BillingStatusHistory.changed_at")


class BillingStatusHistory(Base):
    __tablename__ = "billing_status_history"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    billing_id    = Column(UUID(as_uuid=True), ForeignKey("billing_records.id", ondelete="CASCADE"), nullable=False, index=True)
    old_status    = Column(String(20), nullable=True)
    new_status    = Column(String(20), nullable=False)
    changed_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes         = Column(Text, nullable=True)

    record     = relationship("BillingRecord", back_populates="status_history")
    changed_by = relationship("User", foreign_keys=[changed_by_id])


# ── Billing Config (singleton) ────────────────────────────────────────────────


class BillingConfig(Base):
    __tablename__ = "billing_config"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    auto_generate_enabled = Column(Boolean, nullable=False, default=False)
    default_amount        = Column(Float, nullable=True)
    default_due_day       = Column(Integer, nullable=False, default=10)
    default_period_type   = Column(String(10), nullable=False, default="monthly")
    reminder_days_before  = Column(Integer, nullable=False, default=3)
    reminder_days_after   = Column(Integer, nullable=False, default=1)
    auto_overdue_enabled  = Column(Boolean, nullable=False, default=True)
    auto_overdue_days     = Column(Integer, nullable=False, default=1)
    notes_template        = Column(Text, nullable=True)
    updated_at            = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by            = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


# ── Notification Channels ─────────────────────────────────────────────────────


class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name         = Column(String(200), nullable=False)
    channel_type = Column(String(20), nullable=False)            # teams | telegram
    config       = Column(JSONB, nullable=False, default=dict)   # teams: {url}, telegram: {bot_token, chat_id}
    events       = Column(JSONB, nullable=False, default=list)   # ["alert.triggered", ...]
    is_active    = Column(Boolean, default=True, nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, nullable=True)

    workspace  = relationship("Workspace")
    creator    = relationship("User", foreign_keys=[created_by])
    deliveries = relationship("NotificationDelivery", back_populates="channel", cascade="all, delete-orphan")


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id    = Column(UUID(as_uuid=True), ForeignKey("notification_channels.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type    = Column(String(100), nullable=False)
    payload       = Column(JSONB, nullable=True)
    status        = Column(String(20), nullable=False, default="pending")  # pending | delivered | failed
    error_message = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)

    channel = relationship("NotificationChannel", back_populates="deliveries")


# ── Report Schedules ──────────────────────────────────────────────────────────


class ReportSchedule(Base):
    __tablename__ = "report_schedules"
    __table_args__ = (UniqueConstraint("workspace_id", name="uq_report_schedule_workspace"),)

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id    = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name            = Column(String(200), nullable=False)
    schedule_type   = Column(String(20), nullable=False)           # weekly | monthly
    send_day        = Column(Integer, nullable=False)               # 0-6 (mon-sun) for weekly; 1-28 for monthly
    send_time       = Column(String(5), nullable=False)            # HH:MM
    timezone        = Column(String(64), nullable=False, default="America/Sao_Paulo")
    recipients      = Column(JSONB, nullable=False, default=list)  # list of email strings
    include_budgets = Column(Boolean, nullable=False, default=True)
    include_finops  = Column(Boolean, nullable=False, default=True)
    include_costs   = Column(Boolean, nullable=False, default=True)
    is_enabled      = Column(Boolean, nullable=False, default=True)
    last_run_at     = Column(DateTime(timezone=True), nullable=True)
    last_run_status = Column(String(20), nullable=True)            # success | error
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace")
    creator   = relationship("User", foreign_keys=[created_by])


# ── Support Tickets ───────────────────────────────────────────────────────────


class Ticket(Base):
    __tablename__ = "tickets"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_number   = Column(Integer, nullable=True, index=True)            # TKT-001, auto from sequence
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id    = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True)
    creator_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title           = Column(String(255), nullable=False)
    category        = Column(String(50), nullable=False, default="other")   # billing | technical | feature_request | other
    priority        = Column(String(20), nullable=False, default="normal")  # low | normal | high | urgent
    status          = Column(String(30), nullable=False, default="open", index=True)  # open | in_progress | waiting_client | resolved | closed
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    resolved_at     = Column(DateTime, nullable=True)

    organization = relationship("Organization")
    workspace    = relationship("Workspace")
    creator      = relationship("User", foreign_keys=[creator_id])
    messages     = relationship("TicketMessage", back_populates="ticket", cascade="all, delete-orphan")


class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id   = Column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content     = Column(Text, nullable=False)
    is_internal = Column(Boolean, default=False, nullable=False)  # True = admin-only note
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)

    ticket = relationship("Ticket", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])


class BackgroundTask(Base):
    __tablename__ = "background_tasks"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    type         = Column(String(80), nullable=False)          # e.g. azure_vm_create, azure_storage_create
    label        = Column(String(255), nullable=False)         # human-readable: "Criar VM prod-web-01"
    status       = Column(String(20), nullable=False, default="queued", index=True)  # queued | running | completed | failed
    result       = Column(JSONB, nullable=True)
    error        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace")
    user      = relationship("User", foreign_keys=[user_id])
