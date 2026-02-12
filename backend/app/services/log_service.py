"""
Audit log helper.
Call log_activity() inside any endpoint after a successful operation.
Failures are silently caught so they never break the main request.
"""
import logging
from app.models.db_models import ActivityLog

logger = logging.getLogger(__name__)


def log_activity(
    db,
    user,               # User ORM object or None
    action: str,        # 'ec2.start', 'credential.add', 'auth.login', etc.
    resource_type: str, # 'EC2', 'AzureVM', 'AppService', 'Credential', 'Alert', 'User'
    resource_id: str = None,
    resource_name: str = None,
    provider: str = "system",   # 'aws' | 'azure' | 'system'
    status: str = "success",    # 'success' | 'error'
    detail: str = None,
    organization_id=None,
    workspace_id=None,
) -> None:
    """Persist an activity log entry. Never raises — log failures are non-fatal."""
    try:
        entry = ActivityLog(
            user_id         = user.id    if user else None,
            user_name       = user.name  if user else "System",
            user_email      = user.email if user else "",
            action          = action,
            resource_type   = resource_type,
            resource_id     = str(resource_id)   if resource_id   is not None else None,
            resource_name   = str(resource_name) if resource_name is not None else None,
            provider        = provider,
            status          = status,
            detail          = detail,
            organization_id = organization_id,
            workspace_id    = workspace_id,
        )
        db.add(entry)
        db.commit()
    except Exception as exc:
        logger.warning(f"log_activity failed (non-fatal): {exc}")
        try:
            db.rollback()
        except Exception:
            pass
