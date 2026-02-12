import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    credentials = relationship("CloudCredential", back_populates="user", cascade="all, delete-orphan")


class CloudCredential(Base):
    __tablename__ = "cloud_credentials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(50), nullable=False)  # 'aws' or 'azure'
    label = Column(String(255), nullable=False, default="default")
    encrypted_data = Column(Text, nullable=False)  # Fernet-encrypted JSON
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="credentials")


class CostAlert(Base):
    __tablename__ = "cost_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    provider = Column(String(50), nullable=False)       # 'aws' | 'azure' | 'all'
    service = Column(String(255), nullable=True)        # specific service or None = all
    threshold_type = Column(String(50), nullable=False) # 'fixed' | 'percentage'
    threshold_value = Column(Float, nullable=False)
    period = Column(String(20), nullable=False)         # 'daily' | 'monthly'
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
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

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id       = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_name     = Column(String(255), nullable=False, default="")   # denormalizado — preservado mesmo se user deletado
    user_email    = Column(String(255), nullable=False, default="")
    action        = Column(String(100), nullable=False, index=True)   # 'ec2.start', 'credential.add', etc.
    resource_type = Column(String(100), nullable=False)               # 'EC2', 'AzureVM', 'Credential', etc.
    resource_id   = Column(String(255), nullable=True)
    resource_name = Column(String(255), nullable=True)
    provider      = Column(String(50),  nullable=False, default="system")  # 'aws' | 'azure' | 'system'
    status        = Column(String(20),  nullable=False, default="success")  # 'success' | 'error'
    detail        = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
