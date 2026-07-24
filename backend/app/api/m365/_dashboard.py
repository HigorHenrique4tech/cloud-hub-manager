"""M365 dashboard overview endpoints."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.core.cache import cache_get, cache_set
from app.services.m365_service import M365AuthError

from . import ws_router
from ._helpers import logger, _get_org_plan, _require_enterprise, _get_m365_account, _get_cached_service, _run


@ws_router.get("/overview")
async def get_overview(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return M365 tenant overview: users, licenses, teams."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    cache_key = f"m365:{member.workspace_id}:overview"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct, db=db)
        result = await _run(svc.get_overview)
        cache_set(cache_key, result, ttl=120)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 overview error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 data")


@ws_router.get("/users")
async def get_users(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return list of M365 users with license, MFA, and last sign-in info."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    cache_key = f"m365:{member.workspace_id}:users"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct, db=db)
        result = {"users": await _run(svc.get_users)}
        cache_set(cache_key, result, ttl=300)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 users error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 users")


@ws_router.get("/licenses")
async def get_licenses(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return M365 license SKU usage."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    cache_key = f"m365:{member.workspace_id}:licenses"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct, db=db)
        result = {"licenses": await _run(svc.get_licenses)}
        cache_set(cache_key, result, ttl=300)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 licenses error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 licenses")


@ws_router.get("/groups")
async def get_groups(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return list of all M365/Security/Distribution groups with type classification."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    cache_key = f"m365:{member.workspace_id}:groups"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct, db=db)
        result = {"groups": await _run(svc.get_groups)}
        cache_set(cache_key, result, ttl=300)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 groups error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 groups")


@ws_router.get("/teams")
async def get_teams(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return list of Microsoft Teams."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    cache_key = f"m365:{member.workspace_id}:teams"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct, db=db)
        result = {"teams": await _run(svc.get_teams)}
        cache_set(cache_key, result, ttl=300)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 teams error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 teams")


@ws_router.get("/security")
async def get_security(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return M365 security report: MFA coverage and risky users."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)

    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")

    cache_key = f"m365:{member.workspace_id}:mfa"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        svc = _get_cached_service(acct, db=db)
        result = await _run(svc.get_security_overview)
        cache_set(cache_key, result, ttl=300)
        return result
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 security error: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch M365 security data")


@ws_router.get("/service-health")
async def get_service_health(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return current M365 service health. Requires ServiceHealth.Read.All."""
    plan = _get_org_plan(db, member.organization_id)
    _require_enterprise(plan)
    acct = _get_m365_account(db, member.workspace_id)
    if not acct:
        raise HTTPException(status_code=404, detail="M365 tenant not connected")
    try:
        svc = _get_cached_service(acct, db=db)
        return {"services": await _run(svc.get_service_health)}
    except M365AuthError as exc:
        raise HTTPException(status_code=502, detail=f"M365 authentication failed: {exc}")
    except Exception as exc:
        logger.error("M365 service health error: %s", exc)
        raise HTTPException(status_code=502, detail="Falha ao carregar saúde dos serviços")
