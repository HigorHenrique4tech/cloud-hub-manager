"""M365 Audit mixin — sign-in logs and directory audits."""

import logging
import requests

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class AuditMixin:
    """Audit log methods for M365Service."""

    def get_sign_ins(self, limit: int = 50, upn: str = None, status: str = None, days: int = None) -> dict:
        """List sign-in logs. Requires AuditLog.Read.All + Entra ID P1/P2 license."""
        from datetime import datetime, timedelta, timezone
        try:
            filters = []
            if upn:
                filters.append(f"userPrincipalName eq '{upn}'")
            if status == "success":
                filters.append("status/errorCode eq 0")
            elif status == "failure":
                filters.append("status/errorCode ne 0")
            if days:
                since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
                filters.append(f"createdDateTime ge {since}")
            url = f"{GRAPH_V1}/auditLogs/signIns?$top={limit}&$orderby=createdDateTime desc"
            if filters:
                url += f"&$filter={' and '.join(filters)}"
            token = self._get_token()
            r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
            if not r.ok:
                logger.error("get_sign_ins HTTP %s — body: %s", r.status_code, r.text[:600])
                if r.status_code == 403:
                    return {"sign_ins": [], "total": 0, "error": "permission_denied"}
                r.raise_for_status()
            resp = r.json()
            sign_ins = []
            for s in resp.get("value", []):
                loc = s.get("location") or {}
                geo = loc.get("geoCoordinates") or {}
                sign_ins.append({
                    "id": s.get("id"),
                    "user_display_name": s.get("userDisplayName"),
                    "upn": s.get("userPrincipalName"),
                    "app_display_name": s.get("appDisplayName"),
                    "ip_address": s.get("ipAddress"),
                    "city": loc.get("city"),
                    "country": loc.get("countryOrRegion"),
                    "status_code": (s.get("status") or {}).get("errorCode", 0),
                    "status_reason": (s.get("status") or {}).get("failureReason", ""),
                    "created_at": s.get("createdDateTime"),
                    "client_app_used": s.get("clientAppUsed"),
                    "conditional_access": s.get("conditionalAccessStatus"),
                    "device_os": (s.get("deviceDetail") or {}).get("operatingSystem"),
                    "browser": (s.get("deviceDetail") or {}).get("browser"),
                })
            return {"sign_ins": sign_ins, "total": len(sign_ins)}
        except Exception as e:
            logger.error(f"Error getting sign-ins: {e}")
            return {"sign_ins": [], "total": 0, "error": str(e)}

    def get_directory_audits(self, limit: int = 50, category: str = None, days: int = None) -> dict:
        """List directory audit logs. Requires AuditLog.Read.All."""
        from datetime import datetime, timedelta, timezone
        try:
            filters = []
            if category and category != "all":
                filters.append(f"category eq '{category}'")
            if days:
                since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
                filters.append(f"activityDateTime ge {since}")
            url = f"{GRAPH_V1}/auditLogs/directoryAudits?$top={limit}&$orderby=activityDateTime desc"
            if filters:
                url += f"&$filter={' and '.join(filters)}"
            resp = self._get(url)
            audits = []
            for a in resp.get("value", []):
                initiated = (a.get("initiatedBy") or {})
                initiated_user = initiated.get("user") or {}
                initiated_app = initiated.get("app") or {}
                initiator_upn = initiated_user.get("userPrincipalName") or initiated_app.get("displayName", "")
                initiator_name = initiated_user.get("displayName") or initiated_app.get("displayName", "")
                targets = a.get("targetResources") or []
                target_name = targets[0].get("displayName") if targets else ""
                modified_props = []
                for t in targets:
                    for mp in (t.get("modifiedProperties") or []):
                        modified_props.append({
                            "name": mp.get("displayName"),
                            "old": mp.get("oldValue"),
                            "new": mp.get("newValue"),
                        })
                audits.append({
                    "id": a.get("id"),
                    "category": a.get("category"),
                    "activity_display_name": a.get("activityDisplayName"),
                    "result": a.get("result"),
                    "result_reason": a.get("resultReason", ""),
                    "initiated_by_upn": initiator_upn,
                    "initiated_by_display_name": initiator_name,
                    "target_display_name": target_name,
                    "activity_at": a.get("activityDateTime"),
                    "log_id": a.get("correlationId"),
                    "modified_properties": modified_props,
                })
            return {"audits": audits, "total": len(audits)}
        except Exception as e:
            logger.error(f"Error getting directory audits: {e}")
            return {"audits": [], "total": 0, "error": str(e)}
