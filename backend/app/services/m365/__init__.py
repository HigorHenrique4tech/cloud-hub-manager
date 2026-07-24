"""
Microsoft 365 service package — refactored into mixin classes.

Re-exports M365Service, M365AuthError, GRAPH_V1 for backward compatibility.
"""

from ._base import M365Base, M365AuthError, GRAPH_V1, GRAPH_BETA
from ._users import UsersMixin
from ._groups import GroupsMixin
from ._teams import TeamsMixin
from ._licenses import LicensesMixin
from ._sharepoint import SharePointMixin
from ._exchange import ExchangeMixin
from ._security import SecurityMixin
from ._overview import OverviewMixin
from ._guests import GuestsMixin
from ._audit import AuditMixin
from ._onedrive import OneDriveMixin
from ._offboarding import OffboardingMixin
from ._gdap import GDAPMixin


class M365Service(
    M365Base,
    OverviewMixin,
    UsersMixin,
    GroupsMixin,
    TeamsMixin,
    LicensesMixin,
    SharePointMixin,
    ExchangeMixin,
    SecurityMixin,
    GuestsMixin,
    AuditMixin,
    OneDriveMixin,
    OffboardingMixin,
    GDAPMixin,
):
    """Thin wrapper around Microsoft Graph API for M365 data retrieval."""
    pass


__all__ = ["M365Service", "M365AuthError", "GRAPH_V1", "GRAPH_BETA"]
