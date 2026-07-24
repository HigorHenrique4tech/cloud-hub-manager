from .imap_engine import ImapEngine
from .google_engine import GoogleWorkspaceEngine
from .t2t_engine import TenantToTenantEngine
from .onedrive_engine import OneDriveEngine
from .sharepoint_engine import SharePointEngine
from .teams_engine import TeamsChatEngine
from .m365_groups_engine import M365GroupsEngine

# object_type (mailbox-level) → engine type quando o projeto é tenant_to_tenant
_T2T_OBJECT_TYPE_MAP = {
    "email":       "tenant_to_tenant",
    "onedrive":    "onedrive_to_onedrive",
    "sharepoint":  "sharepoint_to_sharepoint",
    "m365_group":  "m365_groups",
}

_ENGINES = {
    "imap":                     ImapEngine,
    "google_workspace":         GoogleWorkspaceEngine,
    "tenant_to_tenant":         TenantToTenantEngine,
    "onedrive_to_onedrive":     OneDriveEngine,
    "sharepoint_to_sharepoint": SharePointEngine,
    "teams_chat":               TeamsChatEngine,
    "m365_groups":              M365GroupsEngine,
}


def get_engine(migration_type: str, source_cfg: dict, dest_cfg: dict,
               db=None, mailbox=None):
    """
    Factory — retorna a engine correta.

    Para projetos tenant_to_tenant, despacha com base em mailbox.object_type
    para permitir migração mista (email + onedrive + sharepoint + m365_group)
    dentro do mesmo projeto.
    """
    effective_type = migration_type

    if migration_type == "tenant_to_tenant" and mailbox is not None:
        obj_type = getattr(mailbox, "object_type", None) or "email"
        effective_type = _T2T_OBJECT_TYPE_MAP.get(obj_type, migration_type)

    cls = _ENGINES.get(effective_type)
    if not cls:
        raise ValueError(f"Tipo de migração desconhecido: {effective_type}")
    return cls(db=db, mailbox=mailbox, source_cfg=source_cfg, dest_cfg=dest_cfg)
