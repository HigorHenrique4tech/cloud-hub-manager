"""M365 SharePoint admin endpoints."""

from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_get, cache_set
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_service_or_404, _run


@ws_router.get("/sharepoint/sites")
async def ws_m365_list_sites(
    search: Optional[str] = None,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    cache_key = f"m365:{member.workspace_id}:sp_sites"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_sites, search=search)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 sharepoint sites error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch SharePoint sites")


@ws_router.get("/sharepoint/sites/{site_id}")
async def ws_m365_get_site(
    site_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_site, site_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get site error for %s: %s", site_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch SharePoint site")


@ws_router.get("/sharepoint/sites/{site_id}/drives")
async def ws_m365_get_site_drives(
    site_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_site_drives, site_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get site drives error for %s: %s", site_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch site drives")


@ws_router.get("/sharepoint/drives/{drive_id}/items")
async def ws_m365_get_drive_items(
    drive_id: str,
    folder_id: Optional[str] = None,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        return await _run(svc.get_drive_items, drive_id, folder_id=folder_id)
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 get drive items error for %s: %s", drive_id, exc)
        raise HTTPException(status_code=502, detail="Failed to fetch drive items")


@ws_router.get("/sharepoint/usage")
async def ws_m365_sharepoint_usage(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "SharePoint Admin")
    cache_key = f"m365:{member.workspace_id}:sp_usage"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_sharepoint_usage)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 sharepoint usage error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch SharePoint usage")


@ws_router.get("/sharepoint/onedrive-usage")
async def ws_m365_onedrive_usage(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan, "OneDrive Usage")
    cache_key = f"m365:{member.workspace_id}:onedrive_usage"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_service_or_404(db, member.workspace_id)
        result = await _run(svc.get_onedrive_usage)
        cache_set(cache_key, result, ttl=600)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 onedrive usage error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch OneDrive usage")
