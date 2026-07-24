"""
CSP Cost Service — coleta de custos Azure via Partner Center API para clientes CSP.

Usado como fallback quando Cost Management API retorna 403 (CSP desabilitado pelo cliente).
Partner Center Usage Records retorna consumo com delay de 24-48h.
"""
import logging
from datetime import datetime

import requests

logger = logging.getLogger(__name__)

PC_API = "https://api.partnercenter.microsoft.com"


class CspCostService:
    """Coleta custos via Partner Center APIs para clientes CSP."""

    def __init__(self, partner_token: str, customer_id: str):
        self.token = partner_token
        self.customer_id = customer_id
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def get_usage_records(self, subscription_id: str = None) -> list[dict]:
        """
        Consumo por recurso (últimos 30 dias).
        GET /v1/customers/{customer-id}/subscriptions/{sub-id}/usagerecords/resources
        ou
        GET /v1/customers/{customer-id}/usagerecords/resources (todos os subs)
        """
        if subscription_id:
            url = f"{PC_API}/v1/customers/{self.customer_id}/subscriptions/{subscription_id}/usagerecords/resources"
        else:
            url = f"{PC_API}/v1/customers/{self.customer_id}/usagerecords/resources"

        try:
            resp = requests.get(url, headers=self.headers, timeout=30)
            resp.raise_for_status()
            return resp.json().get("items", [])
        except Exception as exc:
            logger.error(f"Erro ao buscar usage records do Partner Center: {exc}")
            return []

    def get_usage_summary(self) -> dict:
        """
        Resumo total de consumo do cliente.
        GET /v1/customers/{customer-id}/usagesummary
        """
        url = f"{PC_API}/v1/customers/{self.customer_id}/usagesummary"
        try:
            resp = requests.get(url, headers=self.headers, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.error(f"Erro ao buscar usage summary do Partner Center: {exc}")
            return {}

    def get_daily_usage(self, subscription_id: str, start: str, end: str) -> list[dict]:
        """
        Rated usage diário por meter.
        GET /v1/customers/{id}/subscriptions/{id}/usagerecords/daily
        start e end em formato 'YYYY-MM-DD'
        """
        url = f"{PC_API}/v1/customers/{self.customer_id}/subscriptions/{subscription_id}/usagerecords/daily"
        try:
            resp = requests.get(
                url,
                headers=self.headers,
                params={"startDate": start, "endDate": end},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json().get("items", [])
        except Exception as exc:
            logger.error(f"Erro ao buscar daily usage do Partner Center: {exc}")
            return []

    def normalize_to_cost_format(self, usage_records: list[dict]) -> list[dict]:
        """
        Converte formato Partner Center para formato padrão do Cost Service.

        Nosso formato padrão (compatível com Cost Management):
        {
            "resource_id": "...",
            "resource_name": "...",
            "resource_type": "Microsoft.Compute/virtualMachines",
            "resource_group": "...",
            "cost": 123.45,
            "currency": "USD",
            "date": "2026-04-01",
            "meter_category": "Virtual Machines",
            "meter_subcategory": "...",
            "source": "partner_center",
        }
        """
        normalized = []
        for record in usage_records:
            normalized.append(
                {
                    "resource_id": record.get("resourceUri", ""),
                    "resource_name": record.get("resourceName", ""),
                    "resource_type": record.get("category", ""),
                    "resource_group": self._extract_rg(record.get("resourceUri", "")),
                    "cost": float(record.get("totalCost", 0)),
                    "currency": record.get("currencyCode", "USD"),
                    "date": record.get("usageDate", ""),
                    "meter_category": record.get("category", ""),
                    "meter_subcategory": record.get("subcategory", ""),
                    "source": "partner_center",  # Flag para indicar origem
                }
            )
        return normalized

    @staticmethod
    def _extract_rg(resource_uri: str) -> str:
        """Extrai resource group de um resource URI."""
        if not resource_uri:
            return ""
        parts = resource_uri.split("/")
        for i, part in enumerate(parts):
            if part.lower() == "resourcegroups" and i + 1 < len(parts):
                return parts[i + 1]
        return ""

    @staticmethod
    def apply_markup(costs: list[dict], markup_pct: float) -> list[dict]:
        """Aplica markup do partner sobre custos CSP."""
        if markup_pct <= 0:
            return costs

        factor = 1 + (markup_pct / 100)
        result = []
        for cost in costs:
            cost_copy = cost.copy()
            cost_copy["partner_cost"] = cost["cost"]  # Custo original (o que partner paga)
            cost_copy["cost"] = round(cost["cost"] * factor, 2)  # Preço de venda
            cost_copy["markup_pct"] = markup_pct
            result.append(cost_copy)
        return result
