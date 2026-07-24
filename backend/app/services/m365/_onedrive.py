"""M365 OneDrive mixin — OneDrive usage reports."""

import logging
import requests

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class OneDriveMixin:
    """OneDrive methods for M365Service."""

    def get_onedrive_usage(self) -> dict:
        """Get OneDrive usage per user (last 30 days). Requires Reports.Read.All.
        Enriches display names from Graph API users to handle obfuscated privacy report data."""
        import csv, io
        try:
            token = self._get_token()
            resp = requests.get(
                f"{GRAPH_V1}/reports/getOneDriveUsageAccountDetail(period='D30')",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            resp.raise_for_status()
            reader = csv.DictReader(io.StringIO(resp.text))
            usage = []
            for row in reader:
                try:
                    usage.append({
                        "upn": row.get("Owner Principal Name", ""),
                        "display_name": row.get("Owner Display Name", ""),
                        "is_deleted": row.get("Is Deleted", "False").lower() == "true",
                        "last_activity": row.get("Last Activity Date", ""),
                        "file_count": int(row.get("File Count", 0) or 0),
                        "storage_used_bytes": int(row.get("Storage Used (Byte)", 0) or 0),
                        "storage_allocated_bytes": int(row.get("Storage Allocated (Byte)", 0) or 0),
                    })
                except Exception:
                    continue
            # Enrich display names — M365 privacy settings may obfuscate names in CSV reports.
            name_map = self._build_user_name_map()
            if name_map:
                for row in usage:
                    upn_key = (row.get("upn") or "").lower()
                    real_name = name_map.get(upn_key)
                    if real_name:
                        row["display_name"] = real_name
            usage.sort(key=lambda x: x["storage_used_bytes"], reverse=True)
            return {"usage": usage, "total": len(usage)}
        except Exception as e:
            logger.error(f"Error getting OneDrive usage: {e}")
            return {"usage": [], "total": 0, "error": str(e)}
