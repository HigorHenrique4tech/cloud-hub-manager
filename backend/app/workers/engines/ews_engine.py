"""EWS engine — Exchange On-Premises via exchangelib → Exchange Online via Graph API."""
import email as email_lib
import hashlib
import logging
import time

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)


class EwsEngine(MigrationEngine):
    """
    Fonte: Exchange On-Premises 2013/2016/2019 via EWS (exchangelib).
    Destino: Exchange Online via Graph API (importMessage).

    Requer: pip install exchangelib
    """

    def _get_ews_account(self):
        """Autentica no Exchange On-Prem via EWS."""
        try:
            from exchangelib import Credentials, Account, Configuration, DELEGATE
            from exchangelib.protocol import BaseProtocol
        except ImportError:
            raise RuntimeError(
                "exchangelib não instalado. Adicione 'exchangelib' ao requirements.txt."
            )

        host = self.source_cfg["host"]
        username = self.source_cfg["username"]
        password = self.source_cfg["password"]
        ews_url = self.source_cfg.get("ews_url") or f"https://{host}/EWS/Exchange.asmx"

        credentials = Credentials(username=username, password=password)
        config = Configuration(service_endpoint=ews_url, credentials=credentials)
        account = Account(
            primary_smtp_address=self.mailbox.source_email,
            config=config,
            autodiscover=False,
            access_type=DELEGATE,
        )
        return account

    def _graph_headers(self) -> dict:
        """Obtém token de acesso para a Graph API do tenant de destino."""
        import requests
        tenant_id  = self.dest_cfg["tenant_id"]
        client_id  = self.dest_cfg["client_id"]
        client_secret = self.dest_cfg["client_secret"]
        token_url  = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        resp = requests.post(token_url, data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }, timeout=30)
        resp.raise_for_status()
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "message/rfc822"}

    def _import_message_graph(self, dest_user_id: str, raw_mime: bytes,
                               headers: dict) -> str:
        """POST /users/{id}/messages/$value — importa email bruto no Exchange Online."""
        import requests
        url = f"https://graph.microsoft.com/v1.0/users/{dest_user_id}/messages/$value"

        def do_import():
            r = requests.post(url, headers=headers, data=raw_mime, timeout=60)
            if r.status_code == 429:
                raise Exception(f"429 throttle")
            r.raise_for_status()
            return r.json().get("id", "")

        return self.retry_on_throttle(do_import)

    # ── Teste de conexão ──────────────────────────────────────────────────────

    def test_connection(self) -> dict:
        try:
            from exchangelib import Credentials, Configuration, Account, DELEGATE
            host = self.source_cfg["host"]
            username = self.source_cfg["username"]
            password = self.source_cfg["password"]
            ews_url = self.source_cfg.get("ews_url") or f"https://{host}/EWS/Exchange.asmx"
            credentials = Credentials(username=username, password=password)
            config = Configuration(service_endpoint=ews_url, credentials=credentials)
            test_email = self.source_cfg.get("test_email") or username
            account = Account(
                primary_smtp_address=test_email,
                config=config,
                autodiscover=False,
                access_type=DELEGATE,
            )
            count = account.inbox.total_count
            return {
                "ok": True,
                "message": f"Conectado ao Exchange via EWS. Inbox com {count} mensagem(s).",
            }
        except ImportError:
            return {"ok": False, "message": "exchangelib não instalado no servidor."}
        except Exception as exc:
            return {"ok": False, "message": f"Falha ao conectar: {exc}"}

    # ── Fase 1: Assessment ────────────────────────────────────────────────────

    def assess(self) -> dict:
        account = self._get_ews_account()
        total = 0
        size_estimate = 0
        folders = []
        for folder in account.root.walk():
            try:
                count = folder.total_count or 0
                total += count
                folders.append(folder.absolute)
                # Tamanho estimado: 100KB por mensagem (conservador)
                size_estimate += count * 100_000
            except Exception:
                pass
        return {
            "total_messages": total,
            "estimated_size_bytes": int(size_estimate),
            "folders": folders,
        }

    # ── Fase 2: Migração ──────────────────────────────────────────────────────

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        account = self._get_ews_account()
        graph_hdrs = self._graph_headers()
        dest_user = self.dest_cfg.get("dest_user_id") or self.mailbox.destination_email
        total_migrated = self.mailbox.items_migrated or 0

        for folder in account.root.walk():
            folder_path = folder.absolute
            chk = self.get_checkpoint(folder_path)
            if chk and chk.completed and chk.phase == "initial":
                continue

            resume_after = chk.last_uid if chk else None
            batch_count = 0
            last_uid = resume_after or ""
            skip = bool(resume_after)

            for item in folder.all().order_by("datetime_received"):
                item_id = item.id

                if skip:
                    if item_id == resume_after:
                        skip = False
                    continue

                try:
                    mime_content = item.mime_content  # bytes do email bruto
                except Exception as e:
                    self.add_log(f"Falha ao obter MIME para {item_id}: {e}", "warning")
                    continue

                parsed = email_lib.message_from_bytes(mime_content)
                msg_id_header = (parsed.get("Message-ID") or "").strip()
                content_hash = hashlib.sha256(mime_content[:4096]).hexdigest()

                if self.is_already_migrated(folder_path, item_id, msg_id_header or None):
                    batch_count += 1
                    last_uid = item_id
                    continue

                try:
                    dest_id = self._import_message_graph(dest_user, mime_content, graph_hdrs)
                    self.record_copied(
                        folder=folder_path,
                        uid=item_id,
                        dest_id=dest_id,
                        msg_id_header=msg_id_header or None,
                        content_hash=content_hash,
                        size_bytes=len(mime_content),
                    )
                    total_migrated += 1
                except Exception as e:
                    self.record_failed(folder_path, item_id, str(e))
                    self.add_log(f"Falha ao importar {item_id}: {e}", "warning")

                batch_count += 1
                last_uid = item_id

                if batch_count % BATCH_SIZE == 0:
                    self.save_checkpoint(folder_path, last_uid, batch_count)
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)

            self.save_checkpoint(folder_path, last_uid, batch_count, completed=True)

    # ── Fase 3: Delta sync ────────────────────────────────────────────────────

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """EWS: usa datetime_received > started_at para pegar emails novos."""
        account = self._get_ews_account()
        graph_hdrs = self._graph_headers()
        dest_user = self.dest_cfg.get("dest_user_id") or self.mailbox.destination_email
        cutoff = self.mailbox.started_at
        total_migrated = self.mailbox.items_migrated or 0

        if not cutoff:
            return

        from exchangelib import EWSDateTime
        import pytz
        cutoff_ews = EWSDateTime.from_datetime(cutoff.replace(tzinfo=pytz.utc))

        for folder in account.root.walk():
            folder_path = folder.absolute
            items = folder.filter(datetime_received__gte=cutoff_ews).order_by("datetime_received")
            for item in items:
                item_id = item.id
                try:
                    mime_content = item.mime_content
                except Exception:
                    continue
                parsed = email_lib.message_from_bytes(mime_content)
                msg_id_header = (parsed.get("Message-ID") or "").strip()
                if self.is_already_migrated(folder_path, item_id, msg_id_header or None):
                    continue
                try:
                    dest_id = self._import_message_graph(dest_user, mime_content, graph_hdrs)
                    self.record_copied(folder=folder_path, uid=item_id, dest_id=dest_id,
                                       msg_id_header=msg_id_header or None,
                                       size_bytes=len(mime_content))
                    total_migrated += 1
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                except Exception as e:
                    self.record_failed(folder_path, item_id, str(e))
