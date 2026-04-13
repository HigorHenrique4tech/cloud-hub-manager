"""
Cost Facade Service — escolhe automaticamente a fonte de custo (Cost Management vs CSP via Partner Center).

Detecção automática:
1. Tenta Cost Management (funciona para EA, PAYG, CSP com CM habilitado)
2. Se 403 (CSP desabilitado) → fallback para Partner Center
3. Se falhar também → retorna estimativa ou vazio

Retorna sempre no mesmo formato:
{
    "costs": [...],
    "source": "cost_management" | "partner_center" | "estimated" | null,
    "last_update": "2026-04-13T...",
    "warning": "Dados via Partner Center (delay 24-48h)" (opcional)
}
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class CostFacadeService:
    """Facade para coleta de custos com fallback automático."""

    @staticmethod
    def detect_cost_source(db, workspace_id: str, account) -> dict:
        """
        Detecta qual fonte de custo usar para uma workspace.

        Returns: {
            "source": "cost_management" | "partner_center" | "estimated" | null,
            "reason": "string descritivo",
            "offer_id": "MS-AZR-XXXX",
        }
        """
        from app.models.db_models import CloudAccount, Workspace

        # 1. Checar configuração de preferência da org
        workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        if not workspace:
            return {"source": None, "reason": "Workspace não encontrado"}

        org = workspace.organization
        if org.cost_source_preference != "auto":
            return {
                "source": org.cost_source_preference,
                "reason": f"Configuração manual: {org.cost_source_preference}",
            }

        # 2. Detectar offer_id da subscription
        offer_id = account.offer_id if hasattr(account, "offer_id") else None

        # 3. Lógica de detecção
        if offer_id and offer_id.startswith("MS-AZR-0145"):  # CSP
            return {
                "source": "cost_management",  # Tentar primeiro
                "reason": "Subscription CSP (MS-AZR-0145) — tentando Cost Management",
                "offer_id": offer_id,
                "fallback_to": "partner_center",
            }

        if offer_id and offer_id.startswith("MS-AZR-0017"):  # EA
            return {
                "source": "cost_management",
                "reason": "Subscription EA (MS-AZR-0017)",
                "offer_id": offer_id,
            }

        # Default: Cost Management
        return {
            "source": "cost_management",
            "reason": f"Oferta padrão: {offer_id or 'desconhecida'}",
            "offer_id": offer_id,
        }

    @staticmethod
    def get_costs_with_fallback(
        db,
        workspace_id: str,
        account,
        start_date: str,
        end_date: str,
        partner_token: Optional[str] = None,
    ) -> dict:
        """
        Obtém custos com fallback automático.

        1. Tenta Cost Management
        2. Se 403 (CSP) → tenta Partner Center
        3. Se Partner Center falhar → retorna vazio

        Returns: {
            "costs": [...],
            "source": "cost_management" | "partner_center" | "estimated" | null,
            "last_update": "2026-04-13T...",
            "warning": "string" (se fonte não é Cost Management)
        }
        """
        from app.models.db_models import Workspace

        workspace = db.query(Workspace).filter(
            Workspace.id == workspace_id
        ).first()
        if not workspace:
            return {
                "costs": [],
                "source": None,
                "error": "Workspace não encontrado",
            }

        # Detectar fonte
        detection = CostFacadeService.detect_cost_source(db, workspace_id, account)

        # 1. Tentar Cost Management
        if detection["source"] == "cost_management":
            try:
                # TODO: integrar com Cost Management API real
                # costs = await cost_management_service.get_costs(account, start_date, end_date)
                costs = []  # Placeholder
                if costs:
                    return {
                        "costs": costs,
                        "source": "cost_management",
                        "last_update": datetime.utcnow().isoformat(),
                    }
            except Exception as exc:
                logger.warning(f"Cost Management falhou: {exc}")
                # Verificar se é 403 (CSP)
                if "403" in str(exc) or "BillingAccountNotFound" in str(exc):
                    logger.info("Cost Management retornou 403 — tentando Partner Center")
                    # Prosseguir para fallback
                elif "fallback_to" in detection:
                    # Prosseguir se foi detectado como CSP
                    pass
                else:
                    # Erro real, não é falta de permissão
                    raise

        # 2. Fallback: Partner Center (para CSP)
        if detection.get("fallback_to") == "partner_center" or (
            "0145" in (account.offer_id or "")
        ):
            if partner_token:
                try:
                    from app.services.csp_cost_service import CspCostService

                    csp_service = CspCostService(
                        partner_token, account.customer_id or account.subscription_id
                    )
                    raw = csp_service.get_usage_records()
                    costs = csp_service.normalize_to_cost_format(raw)

                    # Aplicar markup se configurado
                    if workspace.organization and workspace.organization.cost_markup_pct > 0:
                        costs = CspCostService.apply_markup(
                            costs, workspace.organization.cost_markup_pct
                        )

                    return {
                        "costs": costs,
                        "source": "partner_center",
                        "last_update": datetime.utcnow().isoformat(),
                        "warning": "Dados via Partner Center (delay 24-48h)",
                    }
                except Exception as exc:
                    logger.error(f"Partner Center falhou: {exc}")

        # 3. Fallback final: estimativa ou vazio
        return {
            "costs": [],
            "source": None,
            "last_update": datetime.utcnow().isoformat(),
            "error": "Sem dados de custo disponíveis",
        }
