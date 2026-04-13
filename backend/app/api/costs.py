"""
Costs API — coleta de custos com detecção automática de fonte (Cost Management vs CSP).
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import CloudAccount, Workspace

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/costs",
    tags=["Costs"],
)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@ws_router.get("/source")
def get_cost_source(
    member: MemberContext = Depends(require_permission("costs.view")),
    db: Session = Depends(get_db),
):
    """
    Retorna qual fonte de custo está sendo usada e por que.
    Útil para debug e transparência ao usuário.
    """
    from app.services.cost_facade_service import CostFacadeService

    # Buscar primeira conta Azure da workspace
    account = (
        db.query(CloudAccount)
        .join(Workspace, CloudAccount.workspace_id == Workspace.id)
        .filter(
            Workspace.id == member.workspace_id,
            CloudAccount.provider == "azure",
            CloudAccount.is_active == True,
        )
        .first()
    )

    if not account:
        return {
            "source": None,
            "reason": "Nenhuma conta Azure configurada",
            "organization": member.organization.name,
        }

    detection = CostFacadeService.detect_cost_source(
        db, member.workspace_id, account
    )

    return {
        "source": detection.get("source"),
        "reason": detection.get("reason"),
        "offer_id": detection.get("offer_id"),
        "fallback_to": detection.get("fallback_to"),
        "organization": member.organization.name,
        "cost_source_preference": member.organization.cost_source_preference,
    }


@ws_router.get("")
def get_costs(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    member: MemberContext = Depends(require_permission("costs.view")),
    db: Session = Depends(get_db),
):
    """
    Retorna custos com detecção automática de fonte.

    Response:
    {
        "costs": [...],
        "source": "cost_management" | "partner_center" | "estimated" | null,
        "last_update": "2026-04-13T...",
        "warning": "Dados via Partner Center (delay 24-48h)" (opcional)
    }
    """
    from app.services.cost_facade_service import CostFacadeService
    from app.services.partner_center_service import decrypt_pc_credentials

    # Buscar primeira conta Azure da workspace
    account = (
        db.query(CloudAccount)
        .join(Workspace, CloudAccount.workspace_id == Workspace.id)
        .filter(
            Workspace.id == member.workspace_id,
            CloudAccount.provider == "azure",
            CloudAccount.is_active == True,
        )
        .first()
    )

    if not account:
        return {
            "costs": [],
            "source": None,
            "error": "Nenhuma conta Azure configurada",
            "last_update": datetime.utcnow().isoformat(),
        }

    # Obter token do Partner Center se disponível (para fallback)
    partner_token = None
    try:
        pc_creds = decrypt_pc_credentials(db, member.workspace_id)
        if pc_creds:
            from app.services.partner_center_service import get_partner_center_token

            partner_token = get_partner_center_token(
                pc_creds["partner_tenant_id"],
                pc_creds["client_id"],
                pc_creds["client_secret"],
            )
    except Exception as exc:
        logger.warning(f"Não foi possível obter token Partner Center: {exc}")

    # Obter custos com fallback automático
    try:
        result = CostFacadeService.get_costs_with_fallback(
            db,
            member.workspace_id,
            account,
            start_date,
            end_date,
            partner_token=partner_token,
        )
        return result
    except Exception as exc:
        logger.error(f"Erro ao obter custos: {exc}")
        return {
            "costs": [],
            "source": None,
            "error": str(exc),
            "last_update": datetime.utcnow().isoformat(),
        }
