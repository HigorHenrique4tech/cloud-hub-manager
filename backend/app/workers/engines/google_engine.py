"""Google Workspace engine — Gmail API → Exchange Online via Graph API."""
import base64
import email as email_lib
import hashlib
import json
import logging
import time

import requests

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)

GMAIL_API = "https://www.googleapis.com/gmail/v1"
GRAPH_V1  = "https://graph.microsoft.com/v1.0"


class GoogleWorkspaceEngine(MigrationEngine):
    """
    Fonte: Gmail API com Service Account + domain-wide delegation.
    Destino: Exchange Online via Graph API (importMessage).

    Requer: pip install google-auth google-api-python-client
    """

    def _get_gmail_service(self, impersonate_email: str):
        try:
            from google.oauth2 import service_account
            import googleapiclient.discovery
        except ImportError:
            raise RuntimeError(
                "google-auth / google-api-python-client não instalados."
            )

        sa_json = self.source_cfg.get("service_account")
        if isinstance(sa_json, str):
            sa_info = json.loads(sa_json)
        else:
            sa_info = sa_json

        scopes = [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.labels",
        ]
        credentials = service_account.Credentials.from_service_account_info(
            sa_info, scopes=scopes
        ).with_subject(impersonate_email)

        return googleapiclient.discovery.build("gmail", "v1", credentials=credentials,
                                               cache_discovery=False)

    def _graph_headers(self) -> dict:
        tenant_id     = self.dest_cfg["tenant_id"]
        client_id     = self.dest_cfg["client_id"]
        client_secret = self.dest_cfg["client_secret"]
        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        resp = requests.post(token_url, data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }, timeout=30)
        resp.raise_for_status()
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "message/rfc822"}

    def _import_to_graph(self, dest_user: str, raw_bytes: bytes, headers: dict) -> str:
        url = f"{GRAPH_V1}/users/{dest_user}/messages/$value"
        def do():
            r = requests.post(url, headers=headers, data=raw_bytes, timeout=60)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json().get("id", "")
        return self.retry_on_throttle(do)

    # ── Teste de conexão ──────────────────────────────────────────────────────

    def test_connection(self) -> dict:
        try:
            admin_email = self.source_cfg.get("admin_email")
            if not admin_email:
                return {"ok": False, "message": "admin_email não informado na configuração de origem."}
            service = self._get_gmail_service(admin_email)
            profile = service.users().getProfile(userId="me").execute()
            return {
                "ok": True,
                "message": f"Conectado ao Google Workspace. Conta: {profile.get('emailAddress')}.",
            }
        except ImportError:
            return {"ok": False, "message": "google-auth / google-api-python-client não instalados."}
        except Exception as exc:
            return {"ok": False, "message": f"Falha ao conectar ao Google Workspace: {exc}"}

    # ── Fase 1: Assessment ────────────────────────────────────────────────────

    def assess(self) -> dict:
        service = self._get_gmail_service(self.mailbox.source_email)
        labels_resp = service.users().labels().list(userId="me").execute()
        labels = [l["name"] for l in labels_resp.get("labels", [])]

        total = 0
        for label_id in [l["id"] for l in labels_resp.get("labels", [])
                         if l.get("type") == "system"]:
            try:
                info = service.users().labels().get(userId="me", id=label_id).execute()
                total += info.get("messagesTotal", 0)
            except Exception:
                pass

        return {
            "total_messages": total,
            "estimated_size_bytes": total * 75_000,  # ~75KB média Gmail
            "folders": labels,
        }

    # ── Fase 2: Migração ──────────────────────────────────────────────────────

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        service = self._get_gmail_service(self.mailbox.source_email)
        graph_hdrs = self._graph_headers()
        dest_user = self.dest_cfg.get("dest_user_id") or self.mailbox.destination_email
        total_migrated = self.mailbox.items_migrated or 0

        # Gmail usa labels em vez de pastas — migra INBOX + Sent como prioridade
        # e as demais labels como pastas no Exchange
        label_folder = "INBOX"
        chk = self.get_checkpoint(label_folder)
        if chk and chk.completed and chk.phase == "initial":
            return

        page_token = chk.last_uid if chk else None
        batch_count = 0

        while True:
            params = {"userId": "me", "maxResults": 100}
            if page_token:
                params["pageToken"] = page_token

            def list_messages():
                return service.users().messages().list(**params).execute()

            result = self.retry_on_throttle(list_messages)
            messages = result.get("messages", [])

            for msg_meta in messages:
                msg_id = msg_meta["id"]

                # Baixa mensagem em formato RAW (base64url)
                def fetch_msg():
                    return service.users().messages().get(
                        userId="me", id=msg_id, format="raw"
                    ).execute()

                try:
                    msg = self.retry_on_throttle(fetch_msg)
                except Exception as e:
                    self.add_log(f"Falha ao baixar msg {msg_id}: {e}", "warning")
                    continue

                raw_b64 = msg.get("raw", "")
                raw_bytes = base64.urlsafe_b64decode(raw_b64 + "==")

                parsed = email_lib.message_from_bytes(raw_bytes)
                msg_id_header = (parsed.get("Message-ID") or "").strip()
                content_hash = hashlib.sha256(raw_bytes[:4096]).hexdigest()

                if self.is_already_migrated(label_folder, msg_id, msg_id_header or None):
                    batch_count += 1
                    continue

                try:
                    dest_id = self._import_to_graph(dest_user, raw_bytes, graph_hdrs)
                    self.record_copied(
                        folder=label_folder,
                        uid=msg_id,
                        dest_id=dest_id,
                        msg_id_header=msg_id_header or None,
                        content_hash=content_hash,
                        size_bytes=len(raw_bytes),
                    )
                    total_migrated += 1
                except Exception as e:
                    self.record_failed(label_folder, msg_id, str(e))
                    self.add_log(f"Falha ao importar msg {msg_id}: {e}", "warning")

                batch_count += 1

                if batch_count % BATCH_SIZE == 0:
                    page_token = result.get("nextPageToken") or msg_id
                    self.save_checkpoint(label_folder, page_token, batch_count)
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)

            next_page = result.get("nextPageToken")
            if not next_page:
                break
            page_token = next_page

        self.save_checkpoint(label_folder, "", batch_count, completed=True)

    # ── Fase 3: Delta sync ────────────────────────────────────────────────────

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Gmail: busca mensagens após a data de início da migração."""
        if not self.mailbox.started_at:
            return

        service = self._get_gmail_service(self.mailbox.source_email)
        graph_hdrs = self._graph_headers()
        dest_user = self.dest_cfg.get("dest_user_id") or self.mailbox.destination_email

        cutoff_ts = int(self.mailbox.started_at.timestamp())
        total_migrated = self.mailbox.items_migrated or 0
        page_token = None

        while True:
            params = {
                "userId": "me",
                "maxResults": 100,
                "q": f"after:{cutoff_ts}",
            }
            if page_token:
                params["pageToken"] = page_token

            result = self.retry_on_throttle(
                lambda: service.users().messages().list(**params).execute()
            )
            for msg_meta in result.get("messages", []):
                msg_id = msg_meta["id"]
                try:
                    msg = self.retry_on_throttle(
                        lambda: service.users().messages().get(
                            userId="me", id=msg_id, format="raw").execute()
                    )
                    raw_bytes = base64.urlsafe_b64decode(msg.get("raw", "") + "==")
                    parsed = email_lib.message_from_bytes(raw_bytes)
                    msg_id_header = (parsed.get("Message-ID") or "").strip()
                    if self.is_already_migrated("INBOX", msg_id, msg_id_header or None):
                        continue
                    dest_id = self._import_to_graph(dest_user, raw_bytes, graph_hdrs)
                    self.record_copied(folder="INBOX", uid=msg_id, dest_id=dest_id,
                                       msg_id_header=msg_id_header or None,
                                       size_bytes=len(raw_bytes))
                    total_migrated += 1
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                except Exception as e:
                    self.record_failed("INBOX", msg_id, str(e))

            if not result.get("nextPageToken"):
                break
            page_token = result["nextPageToken"]
