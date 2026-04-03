"""OneDrive engine — migra arquivos entre OneDrives de tenants M365 via Graph API."""
import hashlib
import logging
import time
from io import BytesIO

import requests

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)
GRAPH_V1 = "https://graph.microsoft.com/v1.0"

# Upload simples para arquivos <= 4 MB; resumable session acima disso.
SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024        # 4 MB
UPLOAD_CHUNK_SIZE   = 10 * 1024 * 1024        # 10 MB por chunk


class OneDriveEngine(MigrationEngine):
    """
    Fonte:   OneDrive de um usuário no tenant de origem.
    Destino: OneDrive de um usuário no tenant de destino.

    Usa Graph API em ambos os lados.
    source_cfg  = {tenant_id, client_id, client_secret}
    dest_cfg    = {tenant_id, client_id, client_secret}
    mailbox.source_email      = UPN do usuário de origem  (user@source.com)
    mailbox.destination_email = UPN do usuário de destino (user@target.com)
    """

    # ── Auth ─────────────────────────────────────────────────────────────────────

    def _get_token(self, tenant_id: str, client_id: str, client_secret: str) -> str:
        url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        resp = requests.post(url, data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }, timeout=30)
        resp.raise_for_status()
        return resp.json()["access_token"]

    def _src_headers(self) -> dict:
        token = self._get_token(
            self.source_cfg["tenant_id"],
            self.source_cfg["client_id"],
            self.source_cfg["client_secret"],
        )
        return {"Authorization": f"Bearer {token}"}

    def _dst_headers(self) -> dict:
        token = self._get_token(
            self.dest_cfg["tenant_id"],
            self.dest_cfg["client_id"],
            self.dest_cfg["client_secret"],
        )
        return {"Authorization": f"Bearer {token}"}

    # ── Graph helpers ────────────────────────────────────────────────────────────

    def _list_drive_items_recursive(self, user_id: str, headers: dict,
                                     folder_id: str = "root",
                                     folder_path: str = "/") -> list[dict]:
        """Lista recursivamente todos os itens de um drive de usuário."""
        items = []
        url = f"{GRAPH_V1}/users/{user_id}/drive/items/{folder_id}/children?$top=200"

        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()

            page = self.retry_on_throttle(fetch)
            for item in page.get("value", []):
                item_path = f"{folder_path}{item['name']}"
                if "folder" in item:
                    # É uma pasta — entrar recursivamente
                    items.append({
                        "id": item["id"],
                        "name": item["name"],
                        "path": item_path + "/",
                        "is_folder": True,
                        "size": 0,
                        "lastModifiedDateTime": item.get("lastModifiedDateTime"),
                    })
                    sub_items = self._list_drive_items_recursive(
                        user_id, headers, item["id"], item_path + "/"
                    )
                    items.extend(sub_items)
                else:
                    items.append({
                        "id": item["id"],
                        "name": item["name"],
                        "path": item_path,
                        "is_folder": False,
                        "size": item.get("size", 0),
                        "lastModifiedDateTime": item.get("lastModifiedDateTime"),
                        "mimeType": item.get("file", {}).get("mimeType"),
                    })
            url = page.get("@odata.nextLink")
        return items

    def _download_file(self, user_id: str, item_id: str, headers: dict) -> bytes:
        """Baixa conteúdo de um arquivo via Graph API (streaming)."""
        url = f"{GRAPH_V1}/users/{user_id}/drive/items/{item_id}/content"

        def do():
            r = requests.get(url, headers=headers, timeout=120, stream=True)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.content

        return self.retry_on_throttle(do)

    def _create_folder(self, user_id: str, parent_path: str, folder_name: str,
                       headers: dict) -> str:
        """Cria pasta no OneDrive de destino. Retorna item ID."""
        # Normaliza parent_path: remove trailing slash, garante leading /
        parent_path = parent_path.rstrip("/") or "/root:"
        if parent_path == "/":
            parent_path = "/root:"

        url = f"{GRAPH_V1}/users/{user_id}/drive{parent_path}/children"

        def do():
            r = requests.post(url, headers={**headers, "Content-Type": "application/json"},
                              json={
                                  "name": folder_name,
                                  "folder": {},
                                  "@microsoft.graph.conflictBehavior": "replace",
                              }, timeout=30)
            if r.status_code == 429:
                raise Exception("429 throttle")
            if r.status_code == 409:
                # Pasta já existe — ok
                return r.json() if r.text else {"id": "existing"}
            r.raise_for_status()
            return r.json()

        result = self.retry_on_throttle(do)
        return result.get("id", "")

    def _upload_simple(self, user_id: str, dest_path: str,
                       content: bytes, headers: dict) -> str:
        """Upload simples (< 4 MB). Retorna item ID."""
        url = f"{GRAPH_V1}/users/{user_id}/drive/root:{dest_path}:/content"

        def do():
            r = requests.put(url, headers={
                **headers,
                "Content-Type": "application/octet-stream",
            }, data=content, timeout=60)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json()

        result = self.retry_on_throttle(do)
        return result.get("id", "")

    def _upload_resumable(self, user_id: str, dest_path: str,
                          content: bytes, headers: dict) -> str:
        """Upload em chunks via upload session (> 4 MB). Retorna item ID."""
        # 1. Criar upload session
        session_url = f"{GRAPH_V1}/users/{user_id}/drive/root:{dest_path}:/createUploadSession"

        def create_session():
            r = requests.post(session_url, headers={
                **headers,
                "Content-Type": "application/json",
            }, json={
                "item": {
                    "@microsoft.graph.conflictBehavior": "replace",
                },
            }, timeout=30)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json()

        session = self.retry_on_throttle(create_session)
        upload_url = session["uploadUrl"]

        # 2. Upload em chunks
        total_size = len(content)
        offset = 0
        result = {}

        while offset < total_size:
            chunk_end = min(offset + UPLOAD_CHUNK_SIZE, total_size)
            chunk = content[offset:chunk_end]

            def upload_chunk():
                r = requests.put(upload_url, headers={
                    "Content-Length": str(len(chunk)),
                    "Content-Range": f"bytes {offset}-{chunk_end - 1}/{total_size}",
                }, data=chunk, timeout=120)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                if r.status_code not in (200, 201, 202):
                    r.raise_for_status()
                return r.json() if r.text else {}

            result = self.retry_on_throttle(upload_chunk)
            offset = chunk_end

        return result.get("id", "")

    def _update_timestamps(self, user_id: str, item_id: str,
                           last_modified: str, headers: dict):
        """Preserva lastModifiedDateTime no item de destino."""
        if not last_modified or not item_id:
            return
        url = f"{GRAPH_V1}/users/{user_id}/drive/items/{item_id}"
        try:
            requests.patch(url, headers={**headers, "Content-Type": "application/json"},
                           json={"fileSystemInfo": {"lastModifiedDateTime": last_modified}},
                           timeout=15)
        except Exception:
            pass  # best-effort

    # ── Interface MigrationEngine ────────────────────────────────────────────────

    def test_connection(self) -> dict:
        try:
            headers = self._src_headers()
            src_user = self.source_cfg.get("test_user") or (
                self.mailbox.source_email if self.mailbox else None
            )
            # Se nenhum user especificado, teste com /organization
            if not src_user:
                resp = requests.get(f"{GRAPH_V1}/organization", headers=headers, timeout=15)
                resp.raise_for_status()
                orgs = resp.json().get("value", [])
                name = orgs[0].get("displayName", "") if orgs else ""
                return {"ok": True, "message": f"Conectado ao tenant. Organização: {name}."}

            resp = requests.get(f"{GRAPH_V1}/users/{src_user}/drive",
                                headers=headers, timeout=15)
            resp.raise_for_status()
            drive = resp.json()
            quota = drive.get("quota", {})
            used_gb = round(quota.get("used", 0) / 1_073_741_824, 1)
            total_gb = round(quota.get("total", 0) / 1_073_741_824, 1)
            return {
                "ok": True,
                "message": f"Conectado ao OneDrive de {src_user}. "
                           f"Uso: {used_gb} GB / {total_gb} GB.",
            }
        except Exception as exc:
            err = str(exc)
            if "401" in err or "403" in err:
                return {"ok": False, "message": f"Autenticação negada. Verifique as permissões Files.ReadWrite.All: {err}"}
            return {"ok": False, "message": f"Falha ao conectar: {err}"}

    def assess(self) -> dict:
        src_user = self.mailbox.source_email
        headers = self._src_headers()
        items = self._list_drive_items_recursive(src_user, headers)
        files = [i for i in items if not i["is_folder"]]
        folders = [i for i in items if i["is_folder"]]
        total_size = sum(f["size"] for f in files)

        return {
            "total_messages": len(files),       # reusa campo — "messages" = "items"
            "estimated_size_bytes": total_size,
            "folders": [f["path"] for f in folders],
        }

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        src_user = self.mailbox.source_email
        dst_user = self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0

        # Lista todos os itens recursivamente
        all_items = self._list_drive_items_recursive(src_user, src_hdrs)

        # Primeira passada: criar todas as pastas no destino
        folders = sorted([i for i in all_items if i["is_folder"]], key=lambda x: x["path"])
        for folder in folders:
            path_parts = folder["path"].rstrip("/").split("/")
            folder_name = path_parts[-1]
            parent_path = "/".join(path_parts[:-1]) or "/"
            if parent_path != "/":
                parent_path = f"/root:/{parent_path.lstrip('/')}"
            try:
                self._create_folder(dst_user, parent_path, folder_name, dst_hdrs)
            except Exception as e:
                self.add_log(f"Aviso: falha ao criar pasta '{folder['path']}': {e}", "warning")

        # Segunda passada: copiar arquivos
        files = [i for i in all_items if not i["is_folder"]]
        for item in files:
            item_id = item["id"]
            item_path = item["path"]

            # Verificar se já foi migrado (via ledger)
            folder_path = "/".join(item_path.split("/")[:-1]) or "/"
            if self.is_already_migrated(folder_path, item_id):
                total_migrated += 1
                continue

            try:
                # Download
                content = self._download_file(src_user, item_id, src_hdrs)

                # Hash do conteúdo completo
                content_hash = hashlib.sha256(content).hexdigest()

                # Upload
                dest_path = f"/{item_path.lstrip('/')}"
                if len(content) <= SIMPLE_UPLOAD_LIMIT:
                    dest_id = self._upload_simple(dst_user, dest_path, content, dst_hdrs)
                else:
                    dest_id = self._upload_resumable(dst_user, dest_path, content, dst_hdrs)

                # Preservar timestamps
                self._update_timestamps(dst_user, dest_id,
                                        item.get("lastModifiedDateTime"), dst_hdrs)

                # Registrar no ledger
                self.record_copied(
                    folder=folder_path,
                    uid=item_id,
                    dest_id=dest_id,
                    content_hash=content_hash,
                    size_bytes=len(content),
                )
                total_migrated += 1

            except Exception as e:
                self.record_failed(folder_path, item_id, str(e))
                self.add_log(f"Falha arquivo '{item_path}': {e}", "warning")

            # Progresso e checkpoint
            if total_migrated % BATCH_SIZE == 0:
                self.save_checkpoint(folder_path, item_id, total_migrated)
                on_progress(total_migrated, len(files), 0)

        # Progresso final
        on_progress(total_migrated, len(files), 0)
        self.add_log(f"Migração OneDrive concluída: {total_migrated} arquivos copiados.")

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Delta sync usando lastModifiedDateTime > started_at."""
        if not self.mailbox.started_at:
            return

        src_user = self.mailbox.source_email
        dst_user = self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0

        cutoff = self.mailbox.started_at.strftime("%Y-%m-%dT%H:%M:%SZ")

        # Usa delta query do Graph para buscar mudanças
        url = f"{GRAPH_V1}/users/{src_user}/drive/root/delta"
        new_items = 0

        while url:
            def fetch():
                r = requests.get(url, headers=src_hdrs, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()

            page = self.retry_on_throttle(fetch)

            for item in page.get("value", []):
                # Ignorar pastas e itens deletados
                if "folder" in item or "deleted" in item:
                    continue

                modified = item.get("lastModifiedDateTime", "")
                if modified < cutoff:
                    continue

                item_id = item["id"]
                name = item.get("name", "unknown")

                # Construir path a partir do parentReference
                parent = item.get("parentReference", {})
                parent_path = parent.get("path", "").replace("/drive/root:", "") or "/"
                item_path = f"{parent_path.rstrip('/')}/{name}"

                if self.is_already_migrated(parent_path, item_id):
                    continue

                try:
                    content = self._download_file(src_user, item_id, src_hdrs)
                    dest_path = f"/{item_path.lstrip('/')}"
                    if len(content) <= SIMPLE_UPLOAD_LIMIT:
                        dest_id = self._upload_simple(dst_user, dest_path, content, dst_hdrs)
                    else:
                        dest_id = self._upload_resumable(dst_user, dest_path, content, dst_hdrs)

                    self.record_copied(
                        folder=parent_path, uid=item_id, dest_id=dest_id,
                        content_hash=hashlib.sha256(content).hexdigest(),
                        size_bytes=len(content),
                    )
                    total_migrated += 1
                    new_items += 1
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                except Exception as e:
                    self.record_failed(parent_path, item_id, str(e))

            url = page.get("@odata.nextLink")

        if new_items:
            self.add_log(f"Delta sync: {new_items} arquivo(s) novo(s) sincronizado(s).")
