"""M365 MSP org-level endpoint."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_org_permission
from app.database import get_db
from app.models.db_models import CloudAccount, Organization, Workspace

from . import org_router
from ._helpers import logger, _get_cached_service, _run


@org_router.get("/{org_slug}/m365/tenants")
async def list_m365_tenants(
    member: MemberContext = Depends(require_org_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """
    Return M365 tenant summary for all partner orgs under this master org.
    Enterprise master orgs only.
    """
    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not master_org or master_org.plan_tier != "enterprise":
        raise HTTPException(status_code=403, detail="Recurso exclusivo do plano Enterprise.")
    if master_org.org_type not in ("master", "standalone"):
        raise HTTPException(status_code=403, detail="Apenas organizações master podem ver tenants dos parceiros.")

    partners = (
        db.query(Organization)
        .filter(Organization.parent_org_id == master_org.id)
        .order_by(Organization.created_at.asc())
        .all()
    )

    # Batch-load all workspaces and M365 accounts in 2 queries (avoids N+1)
    partner_ids = [p.id for p in partners]
    all_workspaces = (
        db.query(Workspace)
        .filter(Workspace.organization_id.in_(partner_ids), Workspace.is_active == True)
        .all()
    )
    ws_by_org = {}
    for ws in all_workspaces:
        ws_by_org.setdefault(ws.organization_id, []).append(ws)

    all_ws_ids = [ws.id for ws in all_workspaces]
    all_accts = (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id.in_(all_ws_ids),
            CloudAccount.provider == "m365",
            CloudAccount.is_active == True,
        )
        .all()
    ) if all_ws_ids else []
    acct_by_ws = {a.workspace_id: a for a in all_accts}

    results = []
    for partner in partners:
        workspaces = ws_by_org.get(partner.id, [])
        for ws in workspaces:
            acct = acct_by_ws.get(ws.id)
            entry = {
                "org_name": partner.name,
                "org_slug": partner.slug,
                "workspace_name": ws.name,
                "workspace_id": str(ws.id),
                "tenant_domain": acct.account_id if acct else None,
                "connected": acct is not None,
                "overview": None,
                "error": None,
            }
            if acct:
                try:
                    svc = _get_cached_service(acct)
                    entry["overview"] = await _run(svc.get_overview)
                except Exception as exc:
                    logger.warning(
                        "M365 overview failed for ws %s (org %s): %s",
                        ws.id, partner.slug, exc,
                    )
                    entry["error"] = str(exc)
            results.append(entry)

    return {"tenants": results}
