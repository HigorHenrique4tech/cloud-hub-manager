"""SharePoint engine — migra document libraries entre sites SharePoint de tenants M365.

Fluxo resumido:
  1. _map_drives (4 estratégias)    → mapeia libraries src→dst, cria se faltar
  2. _walk_drive (generator BFS)    → não carrega drive inteiro em memória
  3. _download_to_tempfile          → streaming pra disco, calcula hash incremental
  4. _upload_small | _upload_resumable_from_path → lê do temp em chunks
  5. Graph auto-cria as pastas no destino via endpoint /root:/path:/content

Decisões importantes:
- Pastas vazias NÃO são migradas (trade-off pra simplicidade)
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


class SharePointEngine(MigrationEngine):
    """
    Fonte:   Site SharePoint no tenant de origem.
    Destino: Site SharePoint no tenant de destino.

    source_cfg  = {tenant_id, client_id, client_secret}
    dest_cfg    = {tenant_id, client_id, client_secret}
    mailbox.source_email      = site_id de origem      (hostname,collection-guid,site-guid)
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

    # ── Graph walk (generator) ──────────────────────────────────────────────────

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

    def _walk_drive(self, drive_id: str, headers: dict):
        """
        Generator BFS sobre os itens do drive. Não acumula nada em memória
        além da pilha de pastas a visitar.
        Yielda dicts: {id, name, path, is_folder, size, lastModifiedDateTime, createdDateTime}.
        """
        stack: list[tuple[str, str]] = [("root", "/")]

        while stack:
            folder_id, folder_path = stack.pop()
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

    def _count_drive(self, drive_id: str, headers: dict) -> tuple[int, int, list[str]]:
        """Varre o drive contando arquivos e tamanho, sem materializar tudo."""
        total_files = 0
        total_size = 0
        folder_names: list[str] = []

        for item in self._walk_drive(drive_id, headers):
            if item["is_folder"]:
                if len(folder_names) < 200:
                    folder_names.append(item["path"])
            else:
                total_files += 1
                total_size += item.get("size", 0)

        return total_files, total_size, folder_names

    # ── Download streaming ──────────────────────────────────────────────────────

    def _download_to_tempfile(self, drive_id: str, item_id: str,
                              headers: dict) -> tuple[str, int, str]:
        """
        Baixa item pra arquivo temporário em disco, calcula hash SHA-256 incrementalmente.
        Retorna (caminho_temp, tamanho_bytes, hash_hex).
        """
        url = f"{GRAPH_V1}/drives/{drive_id}/items/{item_id}/content"

        def do():
            r = requests.get(url, headers=headers,
                             timeout=(30, 600), stream=True, allow_redirects=True)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()

            h = hashlib.sha256()
            tmp = tempfile.NamedTemporaryFile(delete=False, prefix="sp_", suffix=".migdl")
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

    def _upload_small(self, drive_id: str, dest_path: str,
                      file_path: str, headers: dict) -> str:
        """Upload simples (<= 4 MB). Lê o temp e faz PUT."""
        url = (f"{GRAPH_V1}/drives/{drive_id}/root:"
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

    def _upload_resumable(self, drive_id: str, dest_path: str,
                          file_path: str, total_size: int, headers: dict) -> str:
        """
        Resumable upload (> 4 MB). Lê chunks do arquivo temp em disco,
        não carrega nada em memória além do chunk atual.
        """
        session_url = (f"{GRAPH_V1}/drives/{drive_id}/root:"
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

    # ── Permissões de item ──────────────────────────────────────────────────────

    def _get_unique_permissions(self, drive_id: str, item_id: str,
                                headers: dict) -> list[dict]:
        """
        Retorna apenas as permissões únicas (não herdadas) do item.
        Filtra fora links anônimos e permissões sem grantedToV2.user.email.
        """
        url = f"{GRAPH_V1}/drives/{drive_id}/items/{item_id}/permissions?$top=100"
        perms: list[dict] = []
        try:
            while url:
                def fetch():
                    r = requests.get(url, headers=headers, timeout=15)
                    if r.status_code == 429:
                        raise Exception("429 throttle")
                    r.raise_for_status()
                    return r.json()
                page = self.retry_on_throttle(fetch)
                for p in page.get("value", []):
                    # Ignora permissões herdadas
                    if p.get("inheritedFrom"):
                        continue
                    # Precisa ter roles e e-mail do destinatário
                    roles = p.get("roles", [])
                    granted = (p.get("grantedToV2") or p.get("grantedTo") or {})
                    user = granted.get("user") or {}
                    email = user.get("email") or user.get("userPrincipalName")
                    if not roles or not email:
                        continue
                    perms.append({"roles": roles, "email": email})
                url = page.get("@odata.nextLink")
        except Exception as exc:
            logger.debug(f"_get_unique_permissions falhou drive={drive_id} item={item_id}: {exc}")
        return perms

    def _apply_permissions(self, drive_id: str, item_id: str,
                           permissions: list[dict], headers: dict) -> None:
        """Aplica permissões únicas no item de destino via /invite."""
        if not permissions:
            return
        url = f"{GRAPH_V1}/drives/{drive_id}/items/{item_id}/invite"
        for perm in permissions:
            body = {
                "requireSignIn": True,
                "sendInvitation": False,
                "roles": perm["roles"],
                "recipients": [{"email": perm["email"]}],
            }
            try:
                def do():
                    r = requests.post(
                        url,
                        headers={**headers, "Content-Type": "application/json"},
                        json=body,
                        timeout=15,
                    )
                    if r.status_code == 429:
                        raise Exception("429 throttle")
                    # 200/201 = ok, 400 = já tem acesso, 404 = usuário não existe no tenant
                    if r.status_code == 404:
                        logger.debug(
                            f"Permissão ignorada: {perm['email']} não existe no tenant destino."
                        )
                        return
                    if r.status_code not in (200, 201, 400):
                        logger.debug(
                            f"_apply_permissions HTTP {r.status_code} para {perm['email']}: "
                            f"{r.text[:200]}"
                        )
                self.retry_on_throttle(do)
            except Exception as exc:
                logger.debug(f"_apply_permissions exceção para {perm.get('email')}: {exc}")

    def _update_timestamps(self, drive_id: str, item_id: str,
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
        url = f"{GRAPH_V1}/drives/{drive_id}/items/{item_id}"
        try:
            requests.patch(url, headers={**headers, "Content-Type": "application/json"},
                           json={"fileSystemInfo": fsi}, timeout=15)
        except Exception:
            pass  # best-effort

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
        Mapeia drives do site origem → destino em quatro estratégias:
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
        src_site = self.mailbox.source_email
        src_hdrs = self._src_headers()
        drives = self._get_site_drives(src_site, src_hdrs)

        total_files = 0
        total_size = 0
        all_folders: list[str] = []

        for drive in drives:
            files, size, folders = self._count_drive(drive["id"], src_hdrs)
            total_files += files
            total_size += size
            all_folders.extend(f"{drive.get('name', '')}{f}" for f in folders)

        return {
            "total_messages": total_files,
            "estimated_size_bytes": total_size,
            "folders": all_folders[:200],
        }

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        src_site = self.mailbox.source_email
        dst_site = self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0
        total_files = self.mailbox.items_total or 0

        preserve_perms = self.source_cfg.get("preserve_sp_permissions", False)
        drive_mappings = self._map_drives(src_site, dst_site, src_hdrs, dst_hdrs)

        if not drive_mappings:
            self.add_log("Nenhum drive mapeado entre origem e destino.", "error")
            return

        if preserve_perms:
            self.add_log("Preservação de permissões ativada: permissões únicas serão copiadas após cada arquivo.")

        for src_drive_id, dst_drive_id, drive_name in drive_mappings:
            self.add_log(f"Migrando biblioteca '{drive_name}'...")

            # Walk streaming — não materializa o drive inteiro
            for item in self._walk_drive(src_drive_id, src_hdrs):
                if item["is_folder"]:
                    # Pastas são criadas automaticamente pelo upload /root:/path:/content
                    continue

                item_id = item["id"]
                item_path = item["path"]
                folder_path = "/".join(item_path.split("/")[:-1]) or "/"
                folder_key = f"{drive_name}:{folder_path}"

                if self.is_already_migrated(folder_key, item_id):
                    continue

                tmp_path = None
                try:
                    tmp_path, size_bytes, content_hash = self._download_to_tempfile(
                        src_drive_id, item_id, src_hdrs
                    )

                    dest_path = f"/{item_path.lstrip('/')}"
                    if size_bytes <= SIMPLE_UPLOAD_LIMIT:
                        dest_id = self._upload_small(dst_drive_id, dest_path, tmp_path, dst_hdrs)
                    else:
                        dest_id = self._upload_resumable(
                            dst_drive_id, dest_path, tmp_path, size_bytes, dst_hdrs
                        )

                    self._update_timestamps(
                        dst_drive_id, dest_id,
                        item.get("createdDateTime"),
                        item.get("lastModifiedDateTime"),
                        dst_hdrs,
                    )

                    # Copiar permissões únicas se flag ativo
                    if preserve_perms and dest_id:
                        perms = self._get_unique_permissions(src_drive_id, item_id, src_hdrs)
                        if perms:
                            self._apply_permissions(dst_drive_id, dest_id, perms, dst_hdrs)

                    self.record_copied(
                        folder=folder_key, uid=item_id, dest_id=dest_id,
                        content_hash=content_hash, size_bytes=size_bytes,
                    )
                    total_migrated += 1

                except Exception as e:
                    self.record_failed(folder_key, item_id, str(e))
                    self.add_log(
                        f"Falha arquivo '{item_path}' em '{drive_name}': {e}",
                        "warning",
                    )

                finally:
                    if tmp_path and os.path.exists(tmp_path):
                        try:
                            os.unlink(tmp_path)
                        except OSError:
                            pass

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
                    item_path = f"{parent_path.rstrip('/')}/{name}"

                    if self.is_already_migrated(folder_key, item_id):
                        continue

                    tmp_path = None
                    try:
                        tmp_path, size_bytes, content_hash = self._download_to_tempfile(
                            src_drive_id, item_id, src_hdrs
                        )
                        dest_path = f"/{item_path.lstrip('/')}"
                        if size_bytes <= SIMPLE_UPLOAD_LIMIT:
                            dest_id = self._upload_small(
                                dst_drive_id, dest_path, tmp_path, dst_hdrs
                            )
                        else:
                            dest_id = self._upload_resumable(
                                dst_drive_id, dest_path, tmp_path, size_bytes, dst_hdrs
                            )
                        self._update_timestamps(
                            dst_drive_id, dest_id,
                            item.get("createdDateTime"),
                            item.get("lastModifiedDateTime"),
                            dst_hdrs,
                        )
                        self.record_copied(
                            folder=folder_key, uid=item_id, dest_id=dest_id,
                            content_hash=content_hash, size_bytes=size_bytes,
                        )
                        total_migrated += 1
                        new_items += 1
                        on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                    except Exception as e:
                        self.record_failed(folder_key, item_id, str(e))
                    finally:
                        if tmp_path and os.path.exists(tmp_path):
                            try:
                                os.unlink(tmp_path)
                            except OSError:
                                pass

                url = page.get("@odata.nextLink")

        if new_items:
            self.add_log(f"Delta sync SharePoint: {new_items} arquivo(s) novo(s).")
