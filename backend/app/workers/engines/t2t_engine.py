"""Tenant-to-Tenant engine — M365 Graph API → M365 Graph API.

Import via MIME bruto (base64 + text/plain) com preservação total:
sender, datas, Message-ID, anexos e headers. PATCH posterior com
PidTagMessageFlags limpa o bit de rascunho (mfUnsent).
"""
import base64
import email as email_lib
import hashlib
import logging
from urllib.parse import quote

import requests

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)
GRAPH_V1 = "https://graph.microsoft.com/v1.0"

# Pastas de sistema que não devem ser migradas.
# Resolvidas via endpoints well-known do Graph (/mailFolders/{wkn}) para obter
# os IDs reais e filtrar — independente de idioma. wellKnownName como propriedade
# não existe em v1.0 (só beta), então não dá para usar em $select.
SYSTEM_WELL_KNOWN_NAMES = [
    "deleteditems",
    "drafts",
    "junkemail",
    "outbox",
    "recoverableitemsdeletions",
    "recoverableitemspurges",
    "recoverableitemsversions",
    "syncissues",
    "conversationhistory",
    "conflicts",
    "localfailures",
    "serverfailures",
]
# Fallback por displayName (se o GET por wkn falhar em algum tenant).
SYSTEM_FOLDER_NAMES = {
    "deleted items", "drafts", "junk email", "outbox",
    "recoverable items", "sync issues", "conversation history",
    "conflicts", "local failures", "server failures",
    "itens excluídos", "rascunhos", "lixo eletrônico", "caixa de saída",
    "itens recuperáveis", "problemas de sincronização",
    "histórico de conversas",
}


class TenantToTenantEngine(MigrationEngine):
    """
    Fonte: tenant M365 de origem (app registration com Mail.Read).
    Destino: tenant M365 de destino (app registration com Mail.ReadWrite).
    Usa Graph API em ambos os lados.
    """

    # ── Auth / headers ────────────────────────────────────────────────────────

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
        src_user = self.source_cfg.get("src_user_id") or (self.mailbox.source_email if self.mailbox else "")
        return {
            "Authorization": f"Bearer {token}",
            "X-AnchorMailbox": src_user,
        }

    def _dst_headers(self) -> dict:
        token = self._get_token(
            self.dest_cfg["tenant_id"],
            self.dest_cfg["client_id"],
            self.dest_cfg["client_secret"],
        )
        dest_user = self.dest_cfg.get("dest_user_id") or (self.mailbox.destination_email if self.mailbox else "")
        return {
            "Authorization": f"Bearer {token}",
            "X-AnchorMailbox": dest_user,
        }

    @staticmethod
    def _enc_user(user_id: str) -> str:
        """URL-encode de UPN para segmento de path."""
        return quote(user_id or "", safe="@.")

    # ── Download MIME (fonte) ─────────────────────────────────────────────────

    def _get_mime(self, user_id: str, msg_id: str, headers: dict) -> bytes:
        """Baixa mensagem em formato MIME bruto."""
        url = (
            f"{GRAPH_V1}/users/{self._enc_user(user_id)}"
            f"/messages/{quote(msg_id, safe='')}/$value"
        )

        def do():
            r = requests.get(url, headers=headers, timeout=120)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.content

        return self.retry_on_throttle(do)

    # ── Import MIME (destino) ─────────────────────────────────────────────────

    def _import_message(
        self,
        dest_user: str,
        raw_mime_bytes: bytes,
        dst_hdrs: dict,
        dest_folder_id: str,
    ) -> str:
        """
        Importa mensagem com fidelidade total.

        Passo 1: POST base64(MIME) com Content-Type: text/plain.
                 A Graph cria a mensagem preservando sender original,
                 datas (receivedDateTime / sentDateTime), internetMessageId
                 e anexos — mas entra como rascunho.

        Passo 2: PATCH com singleValueExtendedProperties PR_MESSAGE_FLAGS=1
                 (mfRead only, sem mfUnsent) → limpa flag de rascunho e
                 marca como lida.

        Retorna o ID da mensagem criada no destino.
        """
        base_user = f"{GRAPH_V1}/users/{self._enc_user(dest_user)}"

        # ── Passo 1: upload do MIME em base64 ────────────────────────────────
        b64_mime = base64.b64encode(raw_mime_bytes).decode("ascii")
        post_hdrs = {
            "Authorization": dst_hdrs["Authorization"],
            "Content-Type": "text/plain",
            "X-AnchorMailbox": dest_user,
        }
        post_url = (
            f"{base_user}/mailFolders/{quote(dest_folder_id, safe='')}/messages"
        )

        def post_mime():
            r = requests.post(post_url, headers=post_hdrs, data=b64_mime, timeout=180)
            if r.status_code == 429:
                raise Exception("429 throttle")
            if not r.ok:
                try:
                    err = r.json().get("error", {})
                    raise Exception(
                        f"HTTP {r.status_code} [{err.get('code','')}]: "
                        f"{err.get('message','')[:300]}"
                    )
                except (ValueError, KeyError):
                    raise Exception(f"HTTP {r.status_code}: {r.text[:300]}")
            return r.json()

        created = self.retry_on_throttle(post_mime)
        new_id = created.get("id", "")
        if not new_id:
            raise Exception("Graph não retornou ID da mensagem importada")

        # ── Passo 2: limpar flag de rascunho via extended property ──────────
        # PR_MESSAGE_FLAGS = 0x0E07 (PT_LONG)
        #   0x01 mfRead    — lida
        #   0x08 mfUnsent  — rascunho (é este que queremos APAGAR)
        #   0x20 mfFromMe  — enviada pelo dono da caixa
        # Valor "1" = mfRead apenas → mensagem lida, não rascunho, recebida.
        patch_hdrs = {
            "Authorization": dst_hdrs["Authorization"],
            "Content-Type": "application/json",
            "X-AnchorMailbox": dest_user,
        }
        patch_body = {
            "singleValueExtendedProperties": [
                {"id": "Integer 0x0E07", "value": "1"}
            ]
        }
        patch_url = f"{base_user}/messages/{quote(new_id, safe='')}"

        def patch_flags():
            r = requests.patch(patch_url, headers=patch_hdrs, json=patch_body, timeout=30)
            if r.status_code == 429:
                raise Exception("429 throttle")
            if not r.ok:
                # Não fatal — logamos e seguimos. Pior caso: mensagem fica como rascunho
                # no destino mas o conteúdo/anexos estão lá.
                logger.warning(
                    f"PATCH flags falhou para msg {new_id}: "
                    f"HTTP {r.status_code} {r.text[:200]}"
                )
                return False
            return True

        try:
            self.retry_on_throttle(patch_flags)
        except Exception as exc:
            logger.warning(f"PATCH flags erro para msg {new_id}: {exc}")

        logger.debug(
            f"Importado via MIME base64: id={new_id} "
            f"folder={dest_folder_id[:20]}... bytes={len(raw_mime_bytes)}"
        )
        return new_id

    # ── Descoberta de pastas ──────────────────────────────────────────────────

    def _resolve_system_folder_ids(self, user_id: str, headers: dict) -> set[str]:
        """
        Resolve os IDs reais das pastas de sistema via endpoints well-known.
        Retorna um set com todos os IDs encontrados — pastas não existentes
        simplesmente não entram no set (GET retorna 404, ignoramos).
        """
        base = f"{GRAPH_V1}/users/{self._enc_user(user_id)}/mailFolders"
        ids: set[str] = set()
        for wkn in SYSTEM_WELL_KNOWN_NAMES:
            try:
                r = requests.get(f"{base}/{wkn}?$select=id", headers=headers, timeout=15)
                if r.ok:
                    fid = r.json().get("id")
                    if fid:
                        ids.add(fid)
            except Exception as exc:
                logger.debug(f"Ignorando pasta de sistema '{wkn}': {exc}")
        return ids

    def _list_folders(self, user_id: str, headers: dict) -> list[dict]:
        """Lista pastas de email do usuário, excluindo pastas de sistema."""
        system_ids = self._resolve_system_folder_ids(user_id, headers)

        url = (
            f"{GRAPH_V1}/users/{self._enc_user(user_id)}/mailFolders"
            f"?$top=100&$select=id,displayName,totalItemCount,parentFolderId"
        )
        folders: list[dict] = []
        while url:
            resp = requests.get(url, headers=headers, timeout=30)
            if not resp.ok:
                try:
                    err = resp.json().get("error", {})
                    raise Exception(
                        f"HTTP {resp.status_code} [{err.get('code','')}]: "
                        f"{err.get('message','')[:300]}"
                    )
                except (ValueError, KeyError):
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            for f in data.get("value", []):
                if f.get("id") in system_ids:
                    continue
                name = (f.get("displayName") or "").strip().lower()
                if name in SYSTEM_FOLDER_NAMES:
                    continue
                folders.append(f)
            url = data.get("@odata.nextLink")
        return folders

    def _get_or_create_folder(
        self,
        dest_user: str,
        folder_name: str,
        dst_hdrs: dict,
        _cache: dict,
    ) -> str:
        """Retorna o ID da pasta no destino, criando se não existir. Cache em memória."""
        if folder_name in _cache:
            return _cache[folder_name]

        base_user = f"{GRAPH_V1}/users/{self._enc_user(dest_user)}"
        get_hdrs = {
            "Authorization": dst_hdrs["Authorization"],
            "X-AnchorMailbox": dest_user,
        }

        # Mapeia nomes especiais para well-known names
        WELL_KNOWN = {
            "inbox": "inbox", "caixa de entrada": "inbox",
            "sent items": "sentitems", "itens enviados": "sentitems",
            "archive": "archive", "arquivo morto": "archive",
        }
        wk = WELL_KNOWN.get(folder_name.lower())
        if wk:
            r = requests.get(f"{base_user}/mailFolders/{wk}", headers=get_hdrs, timeout=15)
            if r.ok:
                fid = r.json()["id"]
                _cache[folder_name] = fid
                return fid

        # Busca entre as pastas existentes (case-insensitive)
        r = requests.get(
            f"{base_user}/mailFolders?$top=100&$select=id,displayName",
            headers=get_hdrs, timeout=15,
        )
        if r.ok:
            for f in r.json().get("value", []):
                if (f.get("displayName") or "").lower() == folder_name.lower():
                    _cache[folder_name] = f["id"]
                    return f["id"]

        # Cria nova pasta
        create_hdrs = {**get_hdrs, "Content-Type": "application/json"}
        r = requests.post(
            f"{base_user}/mailFolders",
            headers=create_hdrs,
            json={"displayName": folder_name},
            timeout=15,
        )
        if r.ok:
            fid = r.json()["id"]
            _cache[folder_name] = fid
            return fid

        # Fallback: resolver ID real da Inbox
        logger.warning(
            f"Não foi possível resolver/criar pasta '{folder_name}': "
            f"HTTP {r.status_code} {r.text[:200]} — usando Inbox."
        )
        r = requests.get(f"{base_user}/mailFolders/inbox", headers=get_hdrs, timeout=15)
        if r.ok:
            inbox_id = r.json()["id"]
            _cache[folder_name] = inbox_id
            return inbox_id
        raise Exception(f"Falha ao resolver pasta '{folder_name}' e também falha ao obter Inbox")

    # ── Teste de conexão ──────────────────────────────────────────────────────

    def test_connection(self) -> dict:
        try:
            headers = self._src_headers()
            resp = requests.get(
                f"{GRAPH_V1}/organization",
                headers=headers, timeout=15,
            )
            resp.raise_for_status()
            orgs = resp.json().get("value", [])
            display_name = orgs[0].get("displayName", "") if orgs else ""
            return {
                "ok": True,
                "message": f"Conectado ao tenant de origem via Graph API. Organização: {display_name}.",
            }
        except Exception as exc:
            err = str(exc)
            if "401" in err or "403" in err:
                return {"ok": False, "message": f"Autenticação negada: {err}"}
            return {"ok": False, "message": f"Falha ao conectar ao tenant de origem: {err}"}

    # ── Fase 1: Assessment ────────────────────────────────────────────────────

    def assess(self) -> dict:
        src_user = self.source_cfg.get("src_user_id") or self.mailbox.source_email
        src_hdrs = self._src_headers()
        folders = self._list_folders(src_user, src_hdrs)
        total = sum(f.get("totalItemCount", 0) for f in folders)
        size_estimate = total * 80_000  # ~80KB média Exchange
        return {
            "total_messages": total,
            "estimated_size_bytes": size_estimate,
            "folders": [f["displayName"] for f in folders],
        }

    # ── Fase 2: Migração ──────────────────────────────────────────────────────

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        src_user = self.source_cfg.get("src_user_id") or self.mailbox.source_email
        dest_user = self.dest_cfg.get("dest_user_id") or self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0
        folders = self._list_folders(src_user, src_hdrs)
        _folder_cache: dict = {}  # folder_name → dest folder_id

        src_enc = self._enc_user(src_user)

        for folder in folders:
            folder_id = folder["id"]
            folder_name = folder["displayName"]

            chk = self.get_checkpoint(folder_name)
            if chk and chk.completed and chk.phase == "initial":
                continue

            skip_token = chk.last_uid if chk else None
            batch_count = 0
            last_uid = skip_token or ""

            # 'size' não existe em Microsoft.OutlookServices.Message (Exchange Online)
            url = (
                f"{GRAPH_V1}/users/{src_enc}/mailFolders/{quote(folder_id, safe='')}/messages"
                f"?$top=50&$select=id,internetMessageId"
            )
            if skip_token and skip_token.startswith("http"):
                url = skip_token  # retomada: last_uid guarda o nextLink

            while url:
                _url = url  # captura para closure

                def fetch_page():
                    r = requests.get(_url, headers=src_hdrs, timeout=30)
                    if r.status_code == 429:
                        raise Exception("429 throttle")
                    if not r.ok:
                        try:
                            err = r.json().get("error", {})
                            raise Exception(
                                f"HTTP {r.status_code} [{err.get('code','')}]: "
                                f"{err.get('message','')[:300]}"
                            )
                        except (ValueError, KeyError):
                            raise Exception(f"HTTP {r.status_code}: {r.text[:300]}")
                    return r.json()

                page = self.retry_on_throttle(fetch_page)
                messages = page.get("value", [])

                for msg in messages:
                    msg_id = msg["id"]
                    msg_int_id = (msg.get("internetMessageId") or "").strip()

                    if self.is_already_migrated(folder_name, msg_id, msg_int_id or None):
                        batch_count += 1
                        last_uid = msg_id
                        continue

                    try:
                        raw_bytes = self._get_mime(src_user, msg_id, src_hdrs)
                        parsed = email_lib.message_from_bytes(raw_bytes)
                        msg_id_header = (parsed.get("Message-ID") or msg_int_id or "").strip()
                        content_hash = hashlib.sha256(raw_bytes[:4096]).hexdigest()

                        dest_folder_id = self._get_or_create_folder(
                            dest_user, folder_name, dst_hdrs, _folder_cache
                        )
                        dest_id = self._import_message(
                            dest_user, raw_bytes, dst_hdrs, dest_folder_id
                        )
                        self.record_copied(
                            folder=folder_name,
                            uid=msg_id,
                            dest_id=dest_id,
                            msg_id_header=msg_id_header or None,
                            content_hash=content_hash,
                            size_bytes=len(raw_bytes),
                        )
                        total_migrated += 1
                    except Exception as e:
                        self.record_failed(folder_name, msg_id, str(e))
                        self.add_log(
                            f"Falha msg {msg_id} em '{folder_name}': {e}",
                            "warning",
                        )

                    batch_count += 1
                    last_uid = msg_id

                    if batch_count % BATCH_SIZE == 0:
                        next_url = page.get("@odata.nextLink", "")
                        self.save_checkpoint(folder_name, next_url or last_uid, batch_count)
                        on_progress(total_migrated, self.mailbox.items_total or 0, 0)

                url = page.get("@odata.nextLink")

            self.save_checkpoint(folder_name, last_uid, batch_count, completed=True)
            self.add_log(f"Pasta '{folder_name}' concluída: {batch_count} msgs processadas.")
            on_progress(total_migrated, self.mailbox.items_total or 0, 0)

    # ── Fase 3: Delta sync ────────────────────────────────────────────────────

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Pega mensagens novas desde o início da migração, por pasta."""
        if not self.mailbox.started_at:
            return

        src_user = self.source_cfg.get("src_user_id") or self.mailbox.source_email
        dest_user = self.dest_cfg.get("dest_user_id") or self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0
        _folder_cache: dict = {}

        cutoff = self.mailbox.started_at.strftime("%Y-%m-%dT%H:%M:%SZ")
        folders = self._list_folders(src_user, src_hdrs)
        src_enc = self._enc_user(src_user)

        for folder in folders:
            folder_id = folder["id"]
            folder_name = folder["displayName"]

            url = (
                f"{GRAPH_V1}/users/{src_enc}/mailFolders/{quote(folder_id, safe='')}/messages"
                f"?$filter=createdDateTime ge {cutoff}"
                f"&$select=id,internetMessageId&$top=50"
            )

            while url:
                _url = url

                def fetch():
                    r = requests.get(_url, headers=src_hdrs, timeout=30)
                    if r.status_code == 429:
                        raise Exception("429 throttle")
                    if not r.ok:
                        try:
                            err = r.json().get("error", {})
                            raise Exception(
                                f"HTTP {r.status_code} [{err.get('code','')}]: "
                                f"{err.get('message','')[:300]}"
                            )
                        except (ValueError, KeyError):
                            raise Exception(f"HTTP {r.status_code}: {r.text[:300]}")
                    return r.json()

                page = self.retry_on_throttle(fetch)

                for msg in page.get("value", []):
                    msg_id = msg["id"]
                    msg_int_id = (msg.get("internetMessageId") or "").strip()
                    if self.is_already_migrated(folder_name, msg_id, msg_int_id or None):
                        continue
                    try:
                        raw_bytes = self._get_mime(src_user, msg_id, src_hdrs)
                        parsed = email_lib.message_from_bytes(raw_bytes)
                        msg_id_header = (parsed.get("Message-ID") or msg_int_id or "").strip()
                        dest_folder_id = self._get_or_create_folder(
                            dest_user, folder_name, dst_hdrs, _folder_cache
                        )
                        dest_id = self._import_message(
                            dest_user, raw_bytes, dst_hdrs, dest_folder_id
                        )
                        self.record_copied(
                            folder=folder_name,
                            uid=msg_id,
                            dest_id=dest_id,
                            msg_id_header=msg_id_header or None,
                            size_bytes=len(raw_bytes),
                        )
                        total_migrated += 1
                        on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                    except Exception as e:
                        self.record_failed(folder_name, msg_id, str(e))
                        self.add_log(
                            f"Delta falha msg {msg_id} em '{folder_name}': {e}",
                            "warning",
                        )

                url = page.get("@odata.nextLink")
