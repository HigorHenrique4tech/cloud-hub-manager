"""
branding_service.py
White-label branding helpers for enterprise organizations.
"""
import base64
import re
import logging
from typing import Optional

from sqlalchemy.orm import Session
from app.models.db_models import Organization, Workspace

logger = logging.getLogger(__name__)

_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
_ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"}

DEFAULT_BRANDING = {
    "platform_name": "CloudAtlas",
    "logo_light_url": "/logo.png",
    "logo_dark_url": "/logoblack.png",
    "favicon_url": None,
    "color_primary": "#1E6FD9",
    "color_accent": "#0EA5E9",
    "powered_by": True,
    "email_sender_name": "CloudAtlas",
    "is_white_labeled": False,
}


def get_branding(org: Organization, db: Optional[Session] = None) -> dict:
    """Return resolved branding dict for an org.

    For partner orgs without their own branding, falls back to parent org.
    For non-enterprise orgs, returns defaults.
    """
    if org.org_type not in ("master", "partner"):
        return dict(DEFAULT_BRANDING)

    # Check if this org has any white-label fields set
    has_own = any([
        org.wl_platform_name, org.wl_logo_light, org.wl_color_primary,
        org.wl_color_accent, org.wl_favicon,
    ])

    # Partner without own branding → inherit from parent
    if org.org_type == "partner" and not has_own and org.parent_org_id and db:
        parent = db.query(Organization).filter(Organization.id == org.parent_org_id).first()
        if parent:
            return get_branding(parent, db)

    if not has_own and org.org_type == "partner":
        return dict(DEFAULT_BRANDING)

    slug = org.slug
    return {
        "platform_name": org.wl_platform_name or DEFAULT_BRANDING["platform_name"],
        "logo_light_url": f"/api/v1/orgs/{slug}/branding/logo-light" if org.wl_logo_light else DEFAULT_BRANDING["logo_light_url"],
        "logo_dark_url": f"/api/v1/orgs/{slug}/branding/logo-dark" if org.wl_logo_dark else DEFAULT_BRANDING["logo_dark_url"],
        "favicon_url": f"/api/v1/orgs/{slug}/branding/favicon" if org.wl_favicon else None,
        "color_primary": org.wl_color_primary or DEFAULT_BRANDING["color_primary"],
        "color_accent": org.wl_color_accent or DEFAULT_BRANDING["color_accent"],
        "powered_by": org.wl_powered_by if org.wl_powered_by is not None else True,
        "email_sender_name": org.wl_email_sender_name or DEFAULT_BRANDING["email_sender_name"],
        "is_white_labeled": has_own or org.org_type == "master",
    }


def get_branding_for_workspace(db: Session, workspace_id) -> dict:
    """Resolve branding from a workspace ID."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        return dict(DEFAULT_BRANDING)
    org = db.query(Organization).filter(Organization.id == ws.organization_id).first()
    if not org:
        return dict(DEFAULT_BRANDING)
    return get_branding(org, db)


def validate_color(hex_str: str) -> bool:
    """Validate hex color string (#RRGGBB)."""
    return bool(_HEX_RE.match(hex_str))


def validate_logo(base64_data: str, max_kb: int = 300) -> bool:
    """Validate base64 logo data: decodes cleanly and within size limit."""
    try:
        # Strip data URI prefix if present
        if "," in base64_data:
            base64_data = base64_data.split(",", 1)[1]
        raw = base64.b64decode(base64_data)
        return len(raw) <= max_kb * 1024
    except Exception:
        return False


def validate_mime(mime: str) -> bool:
    """Check MIME type is an allowed image format."""
    return mime in _ALLOWED_MIME


def strip_data_uri(data: str) -> str:
    """Remove 'data:image/...;base64,' prefix if present."""
    if data and "," in data and data.startswith("data:"):
        return data.split(",", 1)[1]
    return data
