"""M365 SharePoint mixin — SharePoint site management and usage."""

import logging
import requests

from ._base import GRAPH_V1

logger = logging.getLogger(__name__)


class SharePointMixin:
    """SharePoint methods for M365Service."""

    def get_sites(self, search: str = None) -> dict:
        """List SharePoint sites. Optionally filter by search term."""
        try:
            if search:
                url = f"{GRAPH_V1}/sites?search={search}&$top=50"
            else:
                url = f"{GRAPH_V1}/sites?search=*&$top=50"
            resp = self._get(url)
            sites = []
            for s in resp.get("value", []):
                sites.append({
                    "id": s.get("id"),
                    "name": s.get("name") or s.get("displayName"),
                    "display_name": s.get("displayName"),
                    "web_url": s.get("webUrl"),
                    "description": s.get("description", ""),
                    "created_at": s.get("createdDateTime"),
                    "last_modified": s.get("lastModifiedDateTime"),
                })
            return {"sites": sites, "total": len(sites)}
        except Exception as e:
            logger.error(f"Error getting SharePoint sites: {e}")
            return {"sites": [], "total": 0, "error": str(e)}

    def get_site(self, site_id: str) -> dict:
        """Get details of a specific SharePoint site."""
        try:
            s = self._get(f"{GRAPH_V1}/sites/{site_id}")
            return {
                "id": s.get("id"),
                "name": s.get("name") or s.get("displayName"),
                "display_name": s.get("displayName"),
                "web_url": s.get("webUrl"),
                "description": s.get("description", ""),
                "created_at": s.get("createdDateTime"),
                "last_modified": s.get("lastModifiedDateTime"),
                "site_collection": s.get("siteCollection"),
            }
        except Exception as e:
            logger.error(f"Error getting site {site_id}: {e}")
            return {"error": str(e)}

    def get_site_drives(self, site_id: str) -> dict:
        """List document libraries (drives) in a SharePoint site."""
        try:
            resp = self._get(f"{GRAPH_V1}/sites/{site_id}/drives")
            drives = []
            for d in resp.get("value", []):
                quota = d.get("quota", {})
                drives.append({
                    "id": d.get("id"),
                    "name": d.get("name"),
                    "drive_type": d.get("driveType"),
                    "web_url": d.get("webUrl"),
                    "quota_used": quota.get("used", 0),
                    "quota_total": quota.get("total", 0),
                    "quota_remaining": quota.get("remaining", 0),
                    "last_modified": d.get("lastModifiedDateTime"),
                })
            return {"drives": drives, "total": len(drives)}
        except Exception as e:
            logger.error(f"Error getting drives for site {site_id}: {e}")
            return {"drives": [], "total": 0, "error": str(e)}

    def get_drive_items(self, drive_id: str, folder_id: str = None) -> dict:
        """List items in a drive (root or a specific folder)."""
        try:
            if folder_id:
                url = f"{GRAPH_V1}/drives/{drive_id}/items/{folder_id}/children"
            else:
                url = f"{GRAPH_V1}/drives/{drive_id}/root/children"
            resp = self._get(f"{url}?$top=100&$select=id,name,size,file,folder,lastModifiedDateTime,webUrl")
            items = []
            for item in resp.get("value", []):
                items.append({
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "is_folder": "folder" in item,
                    "size": item.get("size", 0),
                    "web_url": item.get("webUrl"),
                    "last_modified": item.get("lastModifiedDateTime"),
                    "mime_type": (item.get("file") or {}).get("mimeType"),
                    "child_count": (item.get("folder") or {}).get("childCount", 0),
                })
            return {"items": items, "total": len(items)}
        except Exception as e:
            logger.error(f"Error getting drive items for {drive_id}: {e}")
            return {"items": [], "total": 0, "error": str(e)}

    def get_sharepoint_usage(self) -> dict:
        """Get SharePoint site usage report (last 30 days)."""
        import csv, io, re as _re
        try:
            token = self._get_token()
            resp = requests.get(
                f"{GRAPH_V1}/reports/getSharePointSiteUsageDetail(period='D30')",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30,
            )
            resp.raise_for_status()

            # Build URL → displayName map from Graph API (bypasses privacy obfuscation)
            url_name_map = {}
            try:
                sp_sites = self._get(f"{GRAPH_V1}/sites?search=*&$select=id,displayName,webUrl&$top=100")
                for s in sp_sites.get("value", []):
                    web_url = (s.get("webUrl") or "").rstrip("/").lower()
                    display_name = s.get("displayName") or s.get("name") or ""
                    if web_url and display_name:
                        url_name_map[web_url] = display_name
            except Exception:
                pass

            reader = csv.DictReader(io.StringIO(resp.text))
            sites = []
            for row in reader:
                try:
                    site_url = row.get("Site URL", "")
                    url_key = site_url.rstrip("/").lower()

                    # 1. Prefer Graph API display name (always real, ignores privacy settings)
                    site_name = url_name_map.get(url_key, "")

                    # 2. Fallback: extract from URL path
                    if not site_name and site_url:
                        m = _re.search(r"/sites/([^/]+)", site_url)
                        if m:
                            site_name = m.group(1).replace("-", " ").replace("_", " ").title()
                        else:
                            m2 = _re.search(r"/personal/([^/]+)", site_url)
                            if m2:
                                site_name = m2.group(1).split("_")[0].title()
                            elif site_url:
                                try:
                                    from urllib.parse import urlparse
                                    site_name = urlparse(site_url).hostname.split(".")[0].title()
                                except Exception:
                                    site_name = site_url

                    sites.append({
                        "site_url": site_url,
                        "site_name": site_name,
                        "owner": row.get("Owner Display Name", ""),
                        "storage_used_bytes": int(row.get("Storage Used (Byte)", 0) or 0),
                        "storage_allocated_bytes": int(row.get("Storage Allocated (Byte)", 0) or 0),
                        "file_count": int(row.get("File Count", 0) or 0),
                        "last_activity": row.get("Last Activity Date", ""),
                        "page_views": int(row.get("Page View Count", 0) or 0),
                    })
                except Exception:
                    continue
            sites.sort(key=lambda x: x["storage_used_bytes"], reverse=True)
            return {"sites": sites, "total": len(sites)}
        except Exception as e:
            logger.error(f"Error getting SharePoint usage: {e}")
            return {"sites": [], "total": 0, "error": str(e)}
