"""SharePoint engine — migra document libraries entre sites SharePoint de tenants M365."""
import hashlib
import logging

import requests

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)
GRAPH_V1 = "https://graph.microsoft.com/v1.0"

SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024
UPLOAD_CHUNK_SIZE   = 10 * 1024 * 1024


class SharePointEngine(MigrationEngine):
    """
    Fonte:   Site SharePoint no tenant de origem.
    Destino: Site SharePoint no tenant de destino.

    source_cfg  = {tenant_id, client_id, client_secret}
    dest_cfg    = {tenant_id, client_id, client_secret}
    mailbox.source_email      = site_id de origem
    mailbox.destination_email = site_id de destino
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

    def _get_site_drives(self, site_id: str, headers: dict) -> list[dict]:
        """Lista document libraries de um site."""
        url = f"{GRAPH_V1}/sites/{site_id}/drives?$top=100"
        drives = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()
            page = self.retry_on_throttle(fetch)
            drives.extend(page.get("value", []))
            url = page.get("@odata.nextLink")
        return drives

    def _list_drive_items_recursive(self, drive_id: str, headers: dict,
                                     folder_id: str = "root",
                                     folder_path: str = "/") -> list[dict]:
        """Lista recursivamente todos os itens de um drive."""
        items = []
        url = f"{GRAPH_V1}/drives/{drive_id}/items/{folder_id}/children?$top=200"

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
                    items.append({
                        "id": item["id"],
                        "name": item["name"],
                        "path": item_path + "/",
                        "is_folder": True,
                        "size": 0,
                        "lastModifiedDateTime": item.get("lastModifiedDateTime"),
                    })
                    sub = self._list_drive_items_recursive(
                        drive_id, headers, item["id"], item_path + "/"
                    )
                    items.extend(sub)
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

    def _download_file(self, drive_id: str, item_id: str, headers: dict) -> bytes:
        url = f"{GRAPH_V1}/drives/{drive_id}/items/{item_id}/content"

        def do():
            r = requests.get(url, headers=headers, timeout=120, stream=True)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.content

        return self.retry_on_throttle(do)

    def _create_folder(self, drive_id: str, parent_id: str, folder_name: str,
                       headers: dict) -> str:
        url = f"{GRAPH_V1}/drives/{drive_id}/items/{parent_id}/children"

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
                return r.json() if r.text else {"id": "existing"}
            r.raise_for_status()
            return r.json()

        return self.retry_on_throttle(do).get("id", "")

    def _upload_simple(self, drive_id: str, dest_path: str,
                       content: bytes, headers: dict) -> str:
        url = f"{GRAPH_V1}/drives/{drive_id}/root:{dest_path}:/content"

        def do():
            r = requests.put(url, headers={
                **headers,
                "Content-Type": "application/octet-stream",
            }, data=content, timeout=60)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json()

        return self.retry_on_throttle(do).get("id", "")

    def _upload_resumable(self, drive_id: str, dest_path: str,
                          content: bytes, headers: dict) -> str:
        session_url = f"{GRAPH_V1}/drives/{drive_id}/root:{dest_path}:/createUploadSession"

        def create_session():
            r = requests.post(session_url, headers={
                **headers, "Content-Type": "application/json",
            }, json={"item": {"@microsoft.graph.conflictBehavior": "replace"}}, timeout=30)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json()

        session = self.retry_on_throttle(create_session)
        upload_url = session["uploadUrl"]

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

    def _update_timestamps(self, drive_id: str, item_id: str,
                           last_modified: str, headers: dict):
        if not last_modified or not item_id:
            return
        url = f"{GRAPH_V1}/drives/{drive_id}/items/{item_id}"
        try:
            requests.patch(url, headers={**headers, "Content-Type": "application/json"},
                           json={"fileSystemInfo": {"lastModifiedDateTime": last_modified}},
                           timeout=15)
        except Exception:
            pass

    # ── Mapeamento de drives ─────────────────────────────────────────────────────

    # Nomes equivalentes da document library padrão em vários idiomas
    _DEFAULT_LIB_NAMES = {
        "documents", "shared documents",
        "documentos", "documentos compartilhados",
        "documentos partilhados",
        "dokumente", "freigegebene dokumente",
        "documenti", "documenti condivisi",
    }

    def _create_document_library(self, dst_site_id: str, display_name: str,
                                  dst_hdrs: dict) -> tuple[str, str] | None:
        """
        Cria uma document library no site destino via /lists com template.
        Depois resolve o drive_id correspondente à lista criada.
        Retorna (drive_id, drive_name) ou None.
        """
        try:
            r = requests.post(
                f"{GRAPH_V1}/sites/{dst_site_id}/lists",
                headers={**dst_hdrs, "Content-Type": "application/json"},
                json={
                    "displayName": display_name,
                    "list": {"template": "documentLibrary"},
                },
                timeout=30,
            )
            if r.status_code not in (200, 201):
                self.add_log(
                    f"Falha ao criar library '{display_name}' no destino: "
                    f"HTTP {r.status_code} {r.text[:200]}",
                    "warning",
                )
                return None
            list_data = r.json()
            list_id = list_data.get("id", "")

            # Resolve drive_id via /lists/{id}/drive
            drv = requests.get(
                f"{GRAPH_V1}/sites/{dst_site_id}/lists/{list_id}/drive",
                headers=dst_hdrs, timeout=15,
            )
            if drv.status_code == 200:
                d = drv.json()
                return (d.get("id", ""), d.get("name", display_name))
            self.add_log(
                f"Library '{display_name}' criada mas drive não localizado "
                f"(HTTP {drv.status_code}).",
                "warning",
            )
            return None
        except Exception as exc:
            self.add_log(f"Exceção criando library '{display_name}': {exc}", "warning")
            return None

    def _map_drives(self, src_site_id: str, dst_site_id: str,
                    src_hdrs: dict, dst_hdrs: dict) -> list[tuple]:
        """
        Mapeia drives do site origem → destino em três estratégias:
        1. Match exato por nome
        2. Match de default libraries (Documents / Documentos / Dokumente etc.)
        3. Auto-map 1:1 quando cada lado tem exatamente uma library
        4. Criar library no destino via POST /sites/{id}/lists

        Retorna lista de (src_drive_id, dst_drive_id, drive_name).
        """
        src_drives = self._get_site_drives(src_site_id, src_hdrs)
        dst_drives = self._get_site_drives(dst_site_id, dst_hdrs)

        dst_by_name = {d["name"]: d for d in dst_drives}
        dst_defaults = [
            d for d in dst_drives
            if (d.get("name") or "").strip().lower() in self._DEFAULT_LIB_NAMES
        ]
        used_dst_ids: set[str] = set()
        mappings: list[tuple] = []

        for sd in src_drives:
            src_name = sd.get("name", "")
            src_name_norm = src_name.strip().lower()

            # 1. Match exato
            match = dst_by_name.get(src_name)
            if match and match["id"] not in used_dst_ids:
                mappings.append((sd["id"], match["id"], src_name))
                used_dst_ids.add(match["id"])
                self.add_log(f"Drive '{src_name}' mapeado por nome exato.")
                continue

            # 2. Default library — se source é default, casa com default do destino
            if src_name_norm in self._DEFAULT_LIB_NAMES:
                default_match = next(
                    (d for d in dst_defaults if d["id"] not in used_dst_ids),
                    None,
                )
                if default_match:
                    mappings.append((sd["id"], default_match["id"], src_name))
                    used_dst_ids.add(default_match["id"])
                    self.add_log(
                        f"Drive '{src_name}' mapeado para '{default_match.get('name')}' "
                        f"(default library do destino)."
                    )
                    continue

            # 3. Auto-map 1:1 quando só há uma library em cada lado
            if len(src_drives) == 1 and len(dst_drives) == 1 \
               and dst_drives[0]["id"] not in used_dst_ids:
                dd = dst_drives[0]
                mappings.append((sd["id"], dd["id"], src_name))
                used_dst_ids.add(dd["id"])
                self.add_log(
                    f"Drive '{src_name}' mapeado automaticamente para "
                    f"'{dd.get('name')}' (única library de cada lado)."
                )
                continue

            # 4. Criar a library no destino
            self.add_log(
                f"Library '{src_name}' não encontrada no destino — criando..."
            )
            created = self._create_document_library(dst_site_id, src_name, dst_hdrs)
            if created:
                new_id, new_name = created
                mappings.append((sd["id"], new_id, src_name))
                used_dst_ids.add(new_id)
                self.add_log(f"Library '{new_name}' criada no destino.")
            else:
                self.add_log(
                    f"Drive '{src_name}' não pôde ser mapeado nem criado — ignorado.",
                    "warning",
                )

        return mappings

    # ── Interface MigrationEngine ────────────────────────────────────────────────

    def test_connection(self) -> dict:
        # Sem site_id (ex.: wizard step 2): só valida OAuth — evita exigir Organization.Read.All.
        test_site = self.source_cfg.get("test_site_id") or (
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

        if not test_site:
            return {
                "ok": True,
                "message": "Credenciais OAuth válidas. Informe um site_id ao adicionar sites para validar o acesso.",
            }

        try:
            headers = {"Authorization": f"Bearer {token}"}
            resp = requests.get(f"{GRAPH_V1}/sites/{test_site}", headers=headers, timeout=15)
            if resp.status_code != 200:
                try:
                    err = resp.json().get("error", {})
                    return {"ok": False, "message": f"HTTP {resp.status_code} [{err.get('code','')}]: {err.get('message','')[:200]}"}
                except Exception:
                    return {"ok": False, "message": f"HTTP {resp.status_code}: {resp.text[:200]}"}
            site = resp.json()
            drives = self._get_site_drives(test_site, headers)
            return {
                "ok": True,
                "message": f"Conectado ao site '{site.get('displayName', '')}'. {len(drives)} biblioteca(s) encontrada(s).",
            }
        except Exception as exc:
            return {"ok": False, "message": f"Falha ao conectar: {exc}"}

    def assess(self) -> dict:
        src_site = self.mailbox.source_email  # site_id
        src_hdrs = self._src_headers()
        drives = self._get_site_drives(src_site, src_hdrs)

        total_files = 0
        total_size = 0
        all_folders = []

        for drive in drives:
            items = self._list_drive_items_recursive(drive["id"], src_hdrs)
            files = [i for i in items if not i["is_folder"]]
            folders = [i for i in items if i["is_folder"]]
            total_files += len(files)
            total_size += sum(f["size"] for f in files)
            all_folders.extend([f"{drive['name']}{f['path']}" for f in folders])

        return {
            "total_messages": total_files,
            "estimated_size_bytes": total_size,
            "folders": all_folders,
        }

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        src_site = self.mailbox.source_email
        dst_site = self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0

        drive_mappings = self._map_drives(src_site, dst_site, src_hdrs, dst_hdrs)

        if not drive_mappings:
            self.add_log("Nenhum drive mapeado entre origem e destino.", "error")
            return

        total_files = 0
        for src_drive_id, dst_drive_id, drive_name in drive_mappings:
            self.add_log(f"Migrando biblioteca '{drive_name}'...")

            all_items = self._list_drive_items_recursive(src_drive_id, src_hdrs)

            # Criar pastas no destino
            folders = sorted([i for i in all_items if i["is_folder"]], key=lambda x: x["path"])
            # Build folder_id map for creating nested folders
            dst_folder_map = {"root": "root"}

            for folder in folders:
                path_parts = folder["path"].rstrip("/").split("/")
                folder_name = path_parts[-1]
                parent_path = "/".join(path_parts[:-1]) or "root"
                parent_id = dst_folder_map.get(parent_path, "root")

                try:
                    new_id = self._create_folder(dst_drive_id, parent_id, folder_name, dst_hdrs)
                    dst_folder_map[folder["path"].rstrip("/")] = new_id
                except Exception as e:
                    self.add_log(f"Falha criar pasta '{folder['path']}': {e}", "warning")

            # Copiar arquivos
            files = [i for i in all_items if not i["is_folder"]]
            total_files += len(files)

            for item in files:
                item_id = item["id"]
                folder_key = f"{drive_name}:{'/'.join(item['path'].split('/')[:-1]) or '/'}"

                if self.is_already_migrated(folder_key, item_id):
                    total_migrated += 1
                    continue

                try:
                    content = self._download_file(src_drive_id, item_id, src_hdrs)
                    content_hash = hashlib.sha256(content).hexdigest()

                    dest_path = f"/{item['path'].lstrip('/')}"
                    if len(content) <= SIMPLE_UPLOAD_LIMIT:
                        dest_id = self._upload_simple(dst_drive_id, dest_path, content, dst_hdrs)
                    else:
                        dest_id = self._upload_resumable(dst_drive_id, dest_path, content, dst_hdrs)

                    self._update_timestamps(dst_drive_id, dest_id,
                                            item.get("lastModifiedDateTime"), dst_hdrs)

                    self.record_copied(
                        folder=folder_key,
                        uid=item_id,
                        dest_id=dest_id,
                        content_hash=content_hash,
                        size_bytes=len(content),
                    )
                    total_migrated += 1

                except Exception as e:
                    self.record_failed(folder_key, item_id, str(e))
                    self.add_log(f"Falha arquivo '{item['path']}' em '{drive_name}': {e}", "warning")

                if total_migrated % BATCH_SIZE == 0:
                    self.save_checkpoint(folder_key, item_id, total_migrated)
                    on_progress(total_migrated, total_files, 0)

            self.add_log(f"Biblioteca '{drive_name}' concluída.")

        on_progress(total_migrated, total_files, 0)
        self.add_log(f"Migração SharePoint concluída: {total_migrated} arquivos copiados.")

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Delta sync usando Graph delta query por drive."""
        if not self.mailbox.started_at:
            return

        src_site = self.mailbox.source_email
        dst_site = self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0

        cutoff = self.mailbox.started_at.strftime("%Y-%m-%dT%H:%M:%SZ")
        drive_mappings = self._map_drives(src_site, dst_site, src_hdrs, dst_hdrs)
        new_items = 0

        for src_drive_id, dst_drive_id, drive_name in drive_mappings:
            url = f"{GRAPH_V1}/drives/{src_drive_id}/root/delta"

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
                    folder_key = f"{drive_name}:{parent_path}"

                    if self.is_already_migrated(folder_key, item_id):
                        continue

                    try:
                        content = self._download_file(src_drive_id, item_id, src_hdrs)
                        dest_path = f"/{parent_path.lstrip('/')}/{name}".replace("//", "/")

                        if len(content) <= SIMPLE_UPLOAD_LIMIT:
                            dest_id = self._upload_simple(dst_drive_id, dest_path, content, dst_hdrs)
                        else:
                            dest_id = self._upload_resumable(dst_drive_id, dest_path, content, dst_hdrs)

                        self.record_copied(
                            folder=folder_key, uid=item_id, dest_id=dest_id,
                            content_hash=hashlib.sha256(content).hexdigest(),
                            size_bytes=len(content),
                        )
                        total_migrated += 1
                        new_items += 1
                        on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                    except Exception as e:
                        self.record_failed(folder_key, item_id, str(e))

                url = page.get("@odata.nextLink")

        if new_items:
            self.add_log(f"Delta sync SharePoint: {new_items} arquivo(s) novo(s).")
