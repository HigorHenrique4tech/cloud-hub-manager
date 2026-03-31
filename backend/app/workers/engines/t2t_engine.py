"""Tenant-to-Tenant engine — M365 Graph API → M365 Graph API."""
import email as email_lib
import hashlib
import logging
import time

import requests

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)
GRAPH_V1 = "https://graph.microsoft.com/v1.0"


class TenantToTenantEngine(MigrationEngine):
    """
    Fonte: tenant M365 de origem (app registration com Mail.Read + MailboxSettings.Read).
    Destino: tenant M365 de destino (app registration com Mail.ReadWrite).

    Usa Graph API em ambos os lados.
    """

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
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "message/rfc822",
        }

    def _get_mime(self, user_id: str, msg_id: str, headers: dict) -> bytes:
        """Baixa mensagem em formato MIME bruto."""
        url = f"{GRAPH_V1}/users/{user_id}/messages/{msg_id}/$value"
        def do():
            r = requests.get(url, headers=headers, timeout=60)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.content
        return self.retry_on_throttle(do)

    def _import_message(self, dest_user: str, raw_bytes: bytes, headers: dict) -> str:
        url = f"{GRAPH_V1}/users/{dest_user}/messages/$value"
        def do():
            r = requests.post(url, headers=headers, data=raw_bytes, timeout=60)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json().get("id", "")
        return self.retry_on_throttle(do)

    def _list_folders(self, user_id: str, headers: dict) -> list[dict]:
        """Lista pastas de email do usuário via Graph."""
        url = f"{GRAPH_V1}/users/{user_id}/mailFolders?$top=50"
        folders = []
        while url:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            folders.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
        return folders

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
        src_user  = self.source_cfg.get("src_user_id") or self.mailbox.source_email
        dest_user = self.dest_cfg.get("dest_user_id") or self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0
        folders = self._list_folders(src_user, src_hdrs)

        for folder in folders:
            folder_id   = folder["id"]
            folder_name = folder["displayName"]
            chk = self.get_checkpoint(folder_name)
            if chk and chk.completed and chk.phase == "initial":
                continue

            skip_token = chk.last_uid if chk else None
            batch_count = 0
            last_uid = skip_token or ""

            # Lista mensagens com paginação
            url = (f"{GRAPH_V1}/users/{src_user}/mailFolders/{folder_id}/messages"
                   f"?$top=50&$select=id,internetMessageId,size")
            if skip_token and skip_token.startswith("http"):
                url = skip_token  # retomada: last_uid guarda o nextLink

            while url:
                def fetch_page():
                    r = requests.get(url, headers=src_hdrs, timeout=30)
                    if r.status_code == 429:
                        raise Exception("429 throttle")
                    r.raise_for_status()
                    return r.json()

                page = self.retry_on_throttle(fetch_page)
                messages = page.get("value", [])

                for msg in messages:
                    msg_id      = msg["id"]
                    msg_int_id  = msg.get("internetMessageId", "").strip()

                    if self.is_already_migrated(folder_name, msg_id, msg_int_id or None):
                        batch_count += 1
                        last_uid = msg_id
                        continue

                    try:
                        raw_bytes = self._get_mime(src_user, msg_id, src_hdrs)
                        parsed = email_lib.message_from_bytes(raw_bytes)
                        msg_id_header = (parsed.get("Message-ID") or msg_int_id or "").strip()
                        content_hash = hashlib.sha256(raw_bytes[:4096]).hexdigest()

                        dest_id = self._import_message(dest_user, raw_bytes, dst_hdrs)
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
                        self.add_log(f"Falha msg {msg_id} em '{folder_name}': {e}", "warning")

                    batch_count += 1
                    last_uid = msg_id

                    if batch_count % BATCH_SIZE == 0:
                        next_url = page.get("@odata.nextLink", "")
                        self.save_checkpoint(folder_name, next_url or last_uid, batch_count)
                        on_progress(total_migrated, self.mailbox.items_total or 0, 0)

                url = page.get("@odata.nextLink")

            self.save_checkpoint(folder_name, last_uid, batch_count, completed=True)
            self.add_log(f"Pasta '{folder_name}' concluída: {batch_count} msgs processadas.")

    # ── Fase 3: Delta sync ────────────────────────────────────────────────────

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Usa delta query do Graph para pegar mensagens novas desde a última sincronização."""
        if not self.mailbox.started_at:
            return

        src_user  = self.source_cfg.get("src_user_id") or self.mailbox.source_email
        dest_user = self.dest_cfg.get("dest_user_id") or self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0

        cutoff = self.mailbox.started_at.strftime("%Y-%m-%dT%H:%M:%SZ")

        # Busca mensagens criadas após o início da migração
        url = (f"{GRAPH_V1}/users/{src_user}/messages"
               f"?$filter=createdDateTime ge {cutoff}"
               f"&$select=id,internetMessageId,size&$top=50")

        while url:
            def fetch():
                r = requests.get(url, headers=src_hdrs, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()

            page = self.retry_on_throttle(fetch)
            for msg in page.get("value", []):
                msg_id     = msg["id"]
                msg_int_id = msg.get("internetMessageId", "").strip()
                if self.is_already_migrated("INBOX", msg_id, msg_int_id or None):
                    continue
                try:
                    raw_bytes = self._get_mime(src_user, msg_id, src_hdrs)
                    parsed = email_lib.message_from_bytes(raw_bytes)
                    msg_id_header = (parsed.get("Message-ID") or msg_int_id or "").strip()
                    dest_id = self._import_message(dest_user, raw_bytes, dst_hdrs)
                    self.record_copied(folder="INBOX", uid=msg_id, dest_id=dest_id,
                                       msg_id_header=msg_id_header or None,
                                       size_bytes=len(raw_bytes))
                    total_migrated += 1
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                except Exception as e:
                    self.record_failed("INBOX", msg_id, str(e))

            url = page.get("@odata.nextLink")
