"""OneDrive engine — migra arquivos entre OneDrives de tenants M365 via Graph API.

Fluxo resumido:
  1. _walk_drive (generator BFS)   → não carrega drive inteiro em memória
  2. _download_to_tempfile         → streaming pra disco, calcula hash incremental
  3. _upload_small | _upload_resumable_from_path → lê do temp em chunks
  4. Graph auto-cria as pastas no destino via endpoint /root:/path:/content

Decisões importantes:
- Pastas vazias NÃO são migradas (trade-off pra simplicidade e pra eliminar ordering bug)
- Paths URL-encoded via urllib.parse.quote (safe="/") pra lidar com #, &, +, espaço, acento
- conflictBehavior=replace no upload (sobrescrever arquivo existente)
- createdDateTime + lastModifiedDateTime preservados via PATCH fileSystemInfo
"""
import hashlib
import logging
import os
import tempfile
from urllib.parse import quote

import requests

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)
GRAPH_V1 = "https://graph.microsoft.com/v1.0"

SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024        # 4 MB — limite do upload simples
UPLOAD_CHUNK_SIZE   = 10 * 1024 * 1024        # 10 MB por chunk no resumable
DOWNLOAD_CHUNK_SIZE = 1 * 1024 * 1024         # 1 MB por chunk no download


def _encode(path: str) -> str:
    """URL-encode preservando /. Usa quote do urllib pra lidar com # & + espaço acento."""
    return quote(path or "", safe="/")


class OneDriveEngine(MigrationEngine):
    """
    Fonte:   OneDrive de um usuário no tenant de origem.
    Destino: OneDrive de um usuário no tenant de destino.

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

    # ── Graph walk (generator) ──────────────────────────────────────────────────

    def _walk_drive(self, user_id: str, headers: dict):
        """
        Generator BFS sobre os itens do drive. Não acumula nada em memória
        além da pilha de pastas a visitar.
        Yielda dicts: {id, name, path, is_folder, size, lastModifiedDateTime}.
        """
        stack: list[tuple[str, str]] = [("root", "/")]

        while stack:
            folder_id, folder_path = stack.pop()
            url = (f"{GRAPH_V1}/users/{user_id}/drive/items/{folder_id}/children"
                   f"?$top=200")
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
                        yield {
                            "id": item["id"],
                            "name": item["name"],
                            "path": item_path + "/",
                            "is_folder": True,
                            "size": 0,
                            "lastModifiedDateTime": item.get("lastModifiedDateTime"),
                        }
                        stack.append((item["id"], item_path + "/"))
                    else:
                        yield {
                            "id": item["id"],
                            "name": item["name"],
                            "path": item_path,
                            "is_folder": False,
                            "size": item.get("size", 0),
                            "lastModifiedDateTime": item.get("lastModifiedDateTime"),
                            "createdDateTime": item.get("createdDateTime"),
                            "mimeType": (item.get("file") or {}).get("mimeType"),
                        }
                url = page.get("@odata.nextLink")

    def _count_drive(self, user_id: str, headers: dict) -> tuple[int, int, list[str]]:
        """Varre o drive contando arquivos e tamanho, sem materializar tudo."""
        total_files = 0
        total_size = 0
        folder_names: list[str] = []

        for item in self._walk_drive(user_id, headers):
            if item["is_folder"]:
                if len(folder_names) < 200:  # limite pra UI
                    folder_names.append(item["path"])
            else:
                total_files += 1
                total_size += item.get("size", 0)

        return total_files, total_size, folder_names

    # ── Download streaming ──────────────────────────────────────────────────────

    def _download_to_tempfile(self, user_id: str, item_id: str,
                              headers: dict) -> tuple[str, int, str]:
        """
        Baixa item pra arquivo temporário em disco, calcula hash SHA-256 incrementalmente.
        Retorna (caminho_temp, tamanho_bytes, hash_hex).
        """
        url = f"{GRAPH_V1}/users/{user_id}/drive/items/{item_id}/content"

        def do():
            r = requests.get(url, headers=headers,
                             timeout=(30, 600), stream=True, allow_redirects=True)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()

            h = hashlib.sha256()
            tmp = tempfile.NamedTemporaryFile(delete=False, prefix="od_", suffix=".migdl")
            size = 0
            try:
                for chunk in r.iter_content(chunk_size=DOWNLOAD_CHUNK_SIZE):
                    if chunk:
                        tmp.write(chunk)
                        h.update(chunk)
                        size += len(chunk)
                tmp.close()
                return tmp.name, size, h.hexdigest()
            except Exception:
                tmp.close()
                try:
                    os.unlink(tmp.name)
                except OSError:
                    pass
                raise

        return self.retry_on_throttle(do)

    # ── Upload ──────────────────────────────────────────────────────────────────

    def _upload_small(self, user_id: str, dest_path: str,
                      file_path: str, headers: dict) -> str:
        """Upload simples (<= 4 MB). Lê o temp e faz PUT."""
        url = (f"{GRAPH_V1}/users/{user_id}/drive/root:"
               f"{_encode(dest_path)}:/content")
        with open(file_path, "rb") as f:
            content = f.read()

        def do():
            r = requests.put(url, headers={
                **headers,
                "Content-Type": "application/octet-stream",
            }, data=content, timeout=(30, 300))
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json()

        return self.retry_on_throttle(do).get("id", "")

    def _upload_resumable(self, user_id: str, dest_path: str,
                          file_path: str, total_size: int, headers: dict) -> str:
        """
        Resumable upload (> 4 MB). Lê chunks do arquivo temp em disco,
        não carrega nada em memória além do chunk atual.
        """
        session_url = (f"{GRAPH_V1}/users/{user_id}/drive/root:"
                       f"{_encode(dest_path)}:/createUploadSession")

        def create_session():
            r = requests.post(session_url, headers={
                **headers, "Content-Type": "application/json",
            }, json={
                "item": {"@microsoft.graph.conflictBehavior": "replace"},
            }, timeout=30)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json()

        session = self.retry_on_throttle(create_session)
        upload_url = session["uploadUrl"]

        result: dict = {}
        with open(file_path, "rb") as f:
            offset = 0
            while offset < total_size:
                chunk_end = min(offset + UPLOAD_CHUNK_SIZE, total_size)
                f.seek(offset)
                chunk = f.read(chunk_end - offset)

                def upload_chunk():
                    r = requests.put(upload_url, headers={
                        "Content-Length": str(len(chunk)),
                        "Content-Range": f"bytes {offset}-{chunk_end - 1}/{total_size}",
                    }, data=chunk, timeout=(30, 600))
                    if r.status_code == 429:
                        raise Exception("429 throttle")
                    if r.status_code == 404:
                        raise Exception("Upload session expirou (404)")
                    if r.status_code not in (200, 201, 202):
                        r.raise_for_status()
                    return r.json() if r.text else {}

                result = self.retry_on_throttle(upload_chunk)
                offset = chunk_end

        return result.get("id", "")

    def _update_timestamps(self, user_id: str, item_id: str,
                           created: str | None, last_modified: str | None,
                           headers: dict) -> None:
        """Preserva createdDateTime + lastModifiedDateTime no item destino."""
        if not item_id or (not created and not last_modified):
            return
        fsi: dict = {}
        if created:
            fsi["createdDateTime"] = created
        if last_modified:
            fsi["lastModifiedDateTime"] = last_modified
        url = f"{GRAPH_V1}/users/{user_id}/drive/items/{item_id}"
        try:
            requests.patch(url, headers={**headers, "Content-Type": "application/json"},
                           json={"fileSystemInfo": fsi}, timeout=15)
        except Exception:
            pass  # best-effort

    # ── Interface MigrationEngine ──────────────────────────────────────────────

    def test_connection(self) -> dict:
        src_user = self.source_cfg.get("test_user") or (
            self.mailbox.source_email if self.mailbox else None
        )
        try:
            token = self._get_token(
                self.source_cfg["tenant_id"],
                self.source_cfg["client_id"],
                self.source_cfg["client_secret"],
            )
        except requests.HTTPError as exc:
            body = ""
            try:
                body = exc.response.json().get("error_description", "")
            except Exception:
                pass
            return {"ok": False, "message": f"Falha OAuth: {body or exc}"}
        except Exception as exc:
            return {"ok": False, "message": f"Falha OAuth: {exc}"}

        if not src_user:
            return {
                "ok": True,
                "message": "Credenciais OAuth válidas. Informe um UPN ao adicionar usuários para validar o acesso ao OneDrive.",
            }

        try:
            resp = requests.get(
                f"{GRAPH_V1}/users/{src_user}/drive",
                headers={"Authorization": f"Bearer {token}"}, timeout=15,
            )
            if resp.status_code != 200:
                try:
                    err = resp.json().get("error", {})
                    return {"ok": False, "message": f"HTTP {resp.status_code} [{err.get('code','')}]: {err.get('message','')[:200]}"}
                except Exception:
                    return {"ok": False, "message": f"HTTP {resp.status_code}: {resp.text[:200]}"}
            drive = resp.json()
            quota = drive.get("quota") or {}
            used_gb = round(quota.get("used", 0) / 1_073_741_824, 1)
            total_gb = round(quota.get("total", 0) / 1_073_741_824, 1)
            return {
                "ok": True,
                "message": f"Conectado ao OneDrive de {src_user}. Uso: {used_gb} GB / {total_gb} GB.",
            }
        except Exception as exc:
            return {"ok": False, "message": f"Falha ao conectar: {exc}"}

    def assess(self) -> dict:
        src_user = self.mailbox.source_email
        headers = self._src_headers()
        total_files, total_size, folder_names = self._count_drive(src_user, headers)
        return {
            "total_messages": total_files,       # reusa campo — "messages" = "items"
            "estimated_size_bytes": total_size,
            "folders": folder_names,
        }

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        src_user = self.mailbox.source_email
        dst_user = self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0
        total_files = self.mailbox.items_total or 0

        # Walk streaming — não materializa o drive inteiro
        for item in self._walk_drive(src_user, src_hdrs):
            if item["is_folder"]:
                # Pastas são criadas automaticamente pelo upload /root:/path:/content
                continue

            item_id = item["id"]
            item_path = item["path"]
            folder_path = "/".join(item_path.split("/")[:-1]) or "/"

            if self.is_already_migrated(folder_path, item_id):
                continue

            tmp_path = None
            try:
                tmp_path, size_bytes, content_hash = self._download_to_tempfile(
                    src_user, item_id, src_hdrs
                )

                dest_path = f"/{item_path.lstrip('/')}"
                if size_bytes <= SIMPLE_UPLOAD_LIMIT:
                    dest_id = self._upload_small(dst_user, dest_path, tmp_path, dst_hdrs)
                else:
                    dest_id = self._upload_resumable(
                        dst_user, dest_path, tmp_path, size_bytes, dst_hdrs
                    )

                self._update_timestamps(
                    dst_user, dest_id,
                    item.get("createdDateTime"),
                    item.get("lastModifiedDateTime"),
                    dst_hdrs,
                )

                self.record_copied(
                    folder=folder_path, uid=item_id, dest_id=dest_id,
                    content_hash=content_hash, size_bytes=size_bytes,
                )
                total_migrated += 1

            except Exception as e:
                self.record_failed(folder_path, item_id, str(e))
                self.add_log(f"Falha arquivo '{item_path}': {e}", "warning")

            finally:
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass

            if total_migrated % BATCH_SIZE == 0:
                self.save_checkpoint(folder_path, item_id, total_migrated)
                on_progress(total_migrated, total_files, 0)

        on_progress(total_migrated, total_files, 0)
        self.add_log(f"Migração OneDrive concluída: {total_migrated} arquivos copiados.")

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Delta sync via Graph delta query."""
        if not self.mailbox.started_at:
            return

        src_user = self.mailbox.source_email
        dst_user = self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0

        cutoff = self.mailbox.started_at.strftime("%Y-%m-%dT%H:%M:%SZ")
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
                if "folder" in item or "deleted" in item:
                    continue

                modified = item.get("lastModifiedDateTime", "")
                if modified < cutoff:
                    continue

                item_id = item["id"]
                name = item.get("name", "unknown")
                parent = item.get("parentReference", {})
                parent_path = parent.get("path", "").replace("/drive/root:", "") or "/"
                item_path = f"{parent_path.rstrip('/')}/{name}"

                if self.is_already_migrated(parent_path, item_id):
                    continue

                tmp_path = None
                try:
                    tmp_path, size_bytes, content_hash = self._download_to_tempfile(
                        src_user, item_id, src_hdrs
                    )
                    dest_path = f"/{item_path.lstrip('/')}"
                    if size_bytes <= SIMPLE_UPLOAD_LIMIT:
                        dest_id = self._upload_small(dst_user, dest_path, tmp_path, dst_hdrs)
                    else:
                        dest_id = self._upload_resumable(
                            dst_user, dest_path, tmp_path, size_bytes, dst_hdrs
                        )
                    self._update_timestamps(
                        dst_user, dest_id,
                        item.get("createdDateTime"),
                        item.get("lastModifiedDateTime"),
                        dst_hdrs,
                    )
                    self.record_copied(
                        folder=parent_path, uid=item_id, dest_id=dest_id,
                        content_hash=content_hash, size_bytes=size_bytes,
                    )
                    total_migrated += 1
                    new_items += 1
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                except Exception as e:
                    self.record_failed(parent_path, item_id, str(e))
                finally:
                    if tmp_path and os.path.exists(tmp_path):
                        try:
                            os.unlink(tmp_path)
                        except OSError:
                            pass

            url = page.get("@odata.nextLink")

        if new_items:
            self.add_log(f"Delta sync: {new_items} arquivo(s) novo(s) sincronizado(s).")
