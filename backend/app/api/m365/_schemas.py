"""Pydantic schemas for the M365 API."""

from typing import Optional
from pydantic import BaseModel


class M365CredentialsIn(BaseModel):
    tenant_id: str
    client_id: str
    client_secret: str
    label: str = "M365 Tenant"
    tenant_domain: str = ""   # e.g. contoso.onmicrosoft.com (display only)


class AddMemberRequest(BaseModel):
    user_id: str
    roles: list = []   # [] = member, ["owner"] = owner


class CreateUserRequest(BaseModel):
    display_name: str
    upn: str                        # userPrincipalName e.g. joao@contoso.com
    password: str
    first_name: str = ""
    last_name: str = ""
    job_title: str = ""
    department: str = ""
    usage_location: str = "BR"
    mail_nickname: str = ""
    account_enabled: bool = True
    force_change_password: bool = True


class CreateGroupRequest(BaseModel):
    display_name: str
    description: str = ""
    mail_nickname: str = ""
    group_type: str = "m365"        # "m365" | "security"
    visibility: str = "Private"     # "Private" | "Public" (M365 groups only)


class MailboxSettingsUpdate(BaseModel):
    auto_reply_enabled: Optional[bool] = None
    auto_reply_message: Optional[str] = None
    timezone: Optional[str] = None


class CreateTeamRequest(BaseModel):
    display_name: str
    description: str = ""
    visibility: str = "Private"     # "Private" | "Public"


class UpdateTeamRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None


class CreateChannelRequest(BaseModel):
    display_name: str
    description: str = ""
    channel_type: str = "standard"  # "standard" | "private"


class UpdateRoleRequest(BaseModel):
    roles: list = []                # [] = member, ["owner"] = owner


class InviteGuestRequest(BaseModel):
    email: str
    display_name: str = ""
    redirect_url: str = "https://myapps.microsoft.com"
    message: str = ""


class OffboardRequest(BaseModel):
    disable_account: bool = True
    revoke_sessions: bool = True
    remove_licenses: bool = False
    auto_reply_message: Optional[str] = None


class CreateDistributionListRequest(BaseModel):
    display_name: str
    mail_nickname: str = ""
    description: str = ""


class CreateSharedMailboxRequest(BaseModel):
    display_name: str
    alias: str
    domain: str
    description: str = ""


class AddMailboxDelegateRequest(BaseModel):
    delegate_upn: str
    permission_type: str  # full_access | send_as | send_on_behalf


class CreateGdapRelationshipRequest(BaseModel):
    display_name: str
    duration_days: int = 365
    roles: list = []
    auto_extend: bool = False
    customer_tenant_id: Optional[str] = None


class SendGdapInviteRequest(BaseModel):
    emails: list = []


class ToggleUserRequest(BaseModel):
    enabled: bool


class ResetPasswordRequest(BaseModel):
    new_password: str
    force_change: bool = True


class CreateTapRequest(BaseModel):
    lifetime_minutes: int = 60
    is_usable_once: bool = True


class AssignLicenseRequest(BaseModel):
    user_id: str
