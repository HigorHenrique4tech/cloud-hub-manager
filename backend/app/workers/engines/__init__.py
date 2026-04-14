from .imap_engine import ImapEngine
from .google_engine import GoogleWorkspaceEngine
from .t2t_engine import TenantToTenantEngine
from .onedrive_engine import OneDriveEngine
from .sharepoint_engine import SharePointEngine
from .teams_engine import TeamsChatEngine


def get_engine(migration_type: str, source_cfg: dict, dest_cfg: dict,
               db=None, mailbox=None):
    """Factory — retorna a engine correta para o tipo de migração."""
    engines = {
        "imap":                     ImapEngine,
        "google_workspace":         GoogleWorkspaceEngine,
        "tenant_to_tenant":         TenantToTenantEngine,
        "onedrive_to_onedrive":     OneDriveEngine,
        "sharepoint_to_sharepoint": SharePointEngine,
        "teams_chat":               TeamsChatEngine,
    }
    cls = engines.get(migration_type)
    if not cls:
        raise ValueError(f"Tipo de migração desconhecido: {migration_type}")
    return cls(db=db, mailbox=mailbox, source_cfg=source_cfg, dest_cfg=dest_cfg)
