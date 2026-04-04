"""Teams Chat engine — migra mensagens de chat e canais entre tenants M365 via Graph API."""
import hashlib
import logging
import time
from datetime import datetime

import requests

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)
GRAPH_V1 = "https://graph.microsoft.com/v1.0"
GRAPH_BETA = "https://graph.microsoft.com/beta"


class TeamsChatEngine(MigrationEngine):
    """
    Migra conversas de chat (1:1 e grupo) e mensagens de canais do Teams
    de um usuário no tenant de origem para o tenant de destino.

    Limitações conhecidas da Graph API:
    - Exportação de chats requer licenças específicas (Teams Export API)
    - Importação de mensagens em canais usa /teams/{id}/channels/{id}/messages
      (requer permissão Teamwork.Migrate.All — disponível apenas para apps
       com aprovação Microsoft para migração)
    - Mensagens importadas aparecem com timestamp original mas autor "Migration Bot"

    source_cfg  = {tenant_id, client_id, client_secret}
    dest_cfg    = {tenant_id, client_id, client_secret}
    mailbox.source_email      = UPN do usuário de origem
    mailbox.destination_email = UPN do usuário de destino (ou team_id para canais)
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

    def _get_user_chats(self, user_id: str, headers: dict) -> list[dict]:
        """Lista todos os chats de um usuário (1:1, grupo, meeting)."""
        url = f"{GRAPH_V1}/users/{user_id}/chats?$top=50&$expand=members"
        chats = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()
            page = self.retry_on_throttle(fetch)
            chats.extend(page.get("value", []))
            url = page.get("@odata.nextLink")
        return chats

    def _get_chat_messages(self, chat_id: str, headers: dict,
                           since: str = None) -> list[dict]:
        """Lista mensagens de um chat."""
        url = f"{GRAPH_V1}/chats/{chat_id}/messages?$top=50&$orderby=createdDateTime"
        if since:
            url += f"&$filter=createdDateTime gt {since}"
        messages = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()
            page = self.retry_on_throttle(fetch)
            messages.extend(page.get("value", []))
            url = page.get("@odata.nextLink")
        return messages

    def _get_team_channels(self, team_id: str, headers: dict) -> list[dict]:
        """Lista canais de um time."""
        url = f"{GRAPH_V1}/teams/{team_id}/channels?$top=100"
        channels = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()
            page = self.retry_on_throttle(fetch)
            channels.extend(page.get("value", []))
            url = page.get("@odata.nextLink")
        return channels

    def _get_channel_messages(self, team_id: str, channel_id: str,
                              headers: dict, since: str = None) -> list[dict]:
        """Lista mensagens de um canal, incluindo replies."""
        url = (f"{GRAPH_V1}/teams/{team_id}/channels/{channel_id}/messages"
               f"?$top=50&$orderby=createdDateTime")
        if since:
            url += f"&$filter=createdDateTime gt {since}"
        messages = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()
            page = self.retry_on_throttle(fetch)
            for msg in page.get("value", []):
                messages.append(msg)
                # Buscar replies (threads)
                if msg.get("replyToId") is None:
                    replies = self._get_message_replies(
                        team_id, channel_id, msg["id"], headers
                    )
                    messages.extend(replies)
            url = page.get("@odata.nextLink")
        return messages

    def _get_message_replies(self, team_id: str, channel_id: str,
                              message_id: str, headers: dict) -> list[dict]:
        """Lista replies de uma mensagem em um canal."""
        url = (f"{GRAPH_V1}/teams/{team_id}/channels/{channel_id}"
               f"/messages/{message_id}/replies?$top=50")
        replies = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()
            page = self.retry_on_throttle(fetch)
            replies.extend(page.get("value", []))
            url = page.get("@odata.nextLink")
        return replies

    def _import_channel_message(self, team_id: str, channel_id: str,
                                 msg: dict, headers: dict) -> str:
        """
        Importa uma mensagem em um canal do destino.
        Usa a Migration API do Teams (requer Teamwork.Migrate.All).
        """
        url = f"{GRAPH_BETA}/teams/{team_id}/channels/{channel_id}/messages"

        body = {
            "createdDateTime": msg.get("createdDateTime"),
            "body": msg.get("body", {}),
            "from": msg.get("from"),
        }

        # Preservar attachments se existirem
        if msg.get("attachments"):
            body["attachments"] = msg["attachments"]

        def do():
            r = requests.post(url, headers={
                **headers, "Content-Type": "application/json"
            }, json=body, timeout=30)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json()

        result = self.retry_on_throttle(do)
        return result.get("id", "")

    def _create_chat_and_send(self, dst_user: str, msg: dict,
                               chat_members: list, headers: dict) -> str:
        """
        Cria/reutiliza chat no destino e envia mensagem.
        Para chats 1:1 e grupo.
        """
        # Montar corpo da mensagem com metadata de origem
        body_content = msg.get("body", {}).get("content", "")
        body_type = msg.get("body", {}).get("contentType", "text")
        from_name = (msg.get("from", {}) or {}).get("user", {}).get("displayName", "Desconhecido")
        original_date = msg.get("createdDateTime", "")

        # Prefixar com info do remetente original e data
        prefixed_content = (
            f"<div style='color:#666;font-size:11px;margin-bottom:4px'>"
            f"<b>{from_name}</b> · {original_date[:16].replace('T', ' ')}</div>"
            f"{body_content}"
        )

        # Enviar como mensagem no chat do usuário destino
        url = f"{GRAPH_V1}/users/{dst_user}/chats/messages"

        # Para simplificar, enviamos via /users/{id}/chat — mas isso requer
        # que o chat já exista. Alternativa: criar chat primeiro.
        # Usar endpoint mais genérico:
        url = f"{GRAPH_V1}/chats"

        # Criar chat (ou reutilizar existente)
        members_payload = []
        for m in chat_members[:2]:  # 1:1 chat = 2 members max
            members_payload.append({
                "@odata.type": "#microsoft.graph.aadUserConversationMember",
                "roles": ["owner"],
                "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{m}')",
            })

        def create_chat():
            r = requests.post(url, headers={
                **headers, "Content-Type": "application/json"
            }, json={
                "chatType": "oneOnOne" if len(members_payload) == 2 else "group",
                "members": members_payload,
            }, timeout=30)
            if r.status_code == 429:
                raise Exception("429 throttle")
            # 409 = chat já existe, retorna o existente
            if r.status_code in (200, 201, 409):
                return r.json()
            r.raise_for_status()
            return r.json()

        chat = self.retry_on_throttle(create_chat)
        chat_id = chat.get("id", "")

        if not chat_id:
            return ""

        # Enviar mensagem no chat
        msg_url = f"{GRAPH_V1}/chats/{chat_id}/messages"

        def send_msg():
            r = requests.post(msg_url, headers={
                **headers, "Content-Type": "application/json"
            }, json={
                "body": {
                    "contentType": "html",
                    "content": prefixed_content,
                },
            }, timeout=30)
            if r.status_code == 429:
                raise Exception("429 throttle")
            r.raise_for_status()
            return r.json()

        result = self.retry_on_throttle(send_msg)
        return result.get("id", "")

    # ── Interface MigrationEngine ────────────────────────────────────────────────

    def test_connection(self) -> dict:
        try:
            headers = self._src_headers()
            src_user = self.source_cfg.get("test_user") or (
                self.mailbox.source_email if self.mailbox else None
            )
            if not src_user:
                resp = requests.get(f"{GRAPH_V1}/organization", headers=headers, timeout=15)
                resp.raise_for_status()
                orgs = resp.json().get("value", [])
                name = orgs[0].get("displayName", "") if orgs else ""
                return {"ok": True, "message": f"Conectado ao tenant. Organização: {name}."}

            # Testa acesso aos chats do usuário
            resp = requests.get(
                f"{GRAPH_V1}/users/{src_user}/chats?$top=1",
                headers=headers, timeout=15,
            )
            resp.raise_for_status()
            return {
                "ok": True,
                "message": f"Conectado. Acesso aos chats de {src_user} confirmado.",
            }
        except Exception as exc:
            err = str(exc)
            if "401" in err or "403" in err:
                return {"ok": False, "message": f"Autenticação negada. Verifique Chat.Read.All e ChannelMessage.Read.All: {err}"}
            return {"ok": False, "message": f"Falha ao conectar: {err}"}

    def assess(self) -> dict:
        src_user = self.mailbox.source_email
        src_hdrs = self._src_headers()

        # Contar chats do usuário
        chats = self._get_user_chats(src_user, src_hdrs)
        total_messages = 0
        chat_count = len(chats)

        # Estimar total de mensagens (amostrando primeiros 10 chats)
        for chat in chats[:10]:
            msgs = self._get_chat_messages(chat["id"], src_hdrs)
            total_messages += len(msgs)

        # Extrapolar se tiver mais de 10 chats
        if chat_count > 10 and total_messages > 0:
            avg = total_messages / 10
            total_messages = int(avg * chat_count)

        # Estimar tamanho (~2KB por mensagem média)
        estimated_size = total_messages * 2048

        return {
            "total_messages": total_messages,
            "estimated_size_bytes": estimated_size,
            "folders": [f"Chat: {c.get('topic') or c.get('chatType', 'unknown')}" for c in chats[:50]],
        }

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        src_user = self.mailbox.source_email
        dst_user = self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0

        # ── Migrar chats (1:1 e grupo) ───────────────────────────────────────
        chats = self._get_user_chats(src_user, src_hdrs)
        self.add_log(f"Encontrados {len(chats)} chats para migrar.")

        for chat in chats:
            chat_id = chat["id"]
            chat_topic = chat.get("topic") or chat.get("chatType", "chat")
            folder_key = f"chat:{chat_id}"

            chk = self.get_checkpoint(folder_key)
            if chk and chk.completed:
                continue

            messages = self._get_chat_messages(chat_id, src_hdrs)

            # Extrair membros do chat para recriar no destino
            members = chat.get("members", [])
            member_emails = []
            for m in members:
                email = (m.get("email") or
                         m.get("userId") or
                         (m.get("additionalData", {}) or {}).get("email", ""))
                if email:
                    member_emails.append(email)

            for msg in messages:
                msg_id = msg["id"]
                if self.is_already_migrated(folder_key, msg_id):
                    continue

                try:
                    # Hash do conteúdo da mensagem
                    body = msg.get("body", {}).get("content", "")
                    content_hash = hashlib.sha256(body.encode()).hexdigest()

                    dest_id = self._create_chat_and_send(
                        dst_user, msg, member_emails, dst_hdrs
                    )

                    self.record_copied(
                        folder=folder_key,
                        uid=msg_id,
                        dest_id=dest_id,
                        content_hash=content_hash,
                        size_bytes=len(body.encode()),
                    )
                    total_migrated += 1

                except Exception as e:
                    self.record_failed(folder_key, msg_id, str(e))
                    self.add_log(f"Falha msg {msg_id} em chat '{chat_topic}': {e}", "warning")

                if total_migrated % BATCH_SIZE == 0:
                    self.save_checkpoint(folder_key, msg_id, total_migrated)
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)

            self.save_checkpoint(folder_key, messages[-1]["id"] if messages else "",
                                total_migrated, completed=True)

        # ── Migrar mensagens de canais (se o destino for um team_id) ─────────
        # Se destination_email parece ser um team_id (UUID), migrar canais também
        dst_is_team = len(dst_user) == 36 and "-" in dst_user  # UUID format

        if dst_is_team:
            # Buscar teams do usuário de origem
            try:
                resp = requests.get(
                    f"{GRAPH_V1}/users/{src_user}/joinedTeams?$top=100",
                    headers=src_hdrs, timeout=30,
                )
                resp.raise_for_status()
                src_teams = resp.json().get("value", [])
            except Exception as e:
                self.add_log(f"Erro ao listar teams do usuário: {e}", "warning")
                src_teams = []

            for team in src_teams:
                team_id = team["id"]
                team_name = team.get("displayName", team_id)
                channels = self._get_team_channels(team_id, src_hdrs)

                for channel in channels:
                    ch_id = channel["id"]
                    ch_name = channel.get("displayName", ch_id)
                    folder_key = f"channel:{team_id}:{ch_id}"

                    chk = self.get_checkpoint(folder_key)
                    if chk and chk.completed:
                        continue

                    messages = self._get_channel_messages(team_id, ch_id, src_hdrs)

                    # Encontrar canal correspondente no destino
                    dst_channels = self._get_team_channels(dst_user, dst_hdrs)
                    dst_ch = next((c for c in dst_channels
                                   if c.get("displayName") == ch_name), None)
                    if not dst_ch:
                        self.add_log(
                            f"Canal '{ch_name}' não encontrado no team destino — ignorando.",
                            "warning"
                        )
                        continue

                    for msg in messages:
                        msg_id = msg["id"]
                        if self.is_already_migrated(folder_key, msg_id):
                            continue

                        try:
                            dest_id = self._import_channel_message(
                                dst_user, dst_ch["id"], msg, dst_hdrs
                            )
                            body = msg.get("body", {}).get("content", "")
                            self.record_copied(
                                folder=folder_key,
                                uid=msg_id,
                                dest_id=dest_id,
                                content_hash=hashlib.sha256(body.encode()).hexdigest(),
                                size_bytes=len(body.encode()),
                            )
                            total_migrated += 1
                        except Exception as e:
                            self.record_failed(folder_key, msg_id, str(e))

                        if total_migrated % BATCH_SIZE == 0:
                            self.save_checkpoint(folder_key, msg_id, total_migrated)
                            on_progress(total_migrated, self.mailbox.items_total or 0, 0)

                    self.save_checkpoint(folder_key, messages[-1]["id"] if messages else "",
                                        total_migrated, completed=True)
                    self.add_log(f"Canal '{ch_name}' do team '{team_name}' concluído.")

        on_progress(total_migrated, self.mailbox.items_total or 0, 0)
        self.add_log(f"Migração Teams concluída: {total_migrated} mensagens copiadas.")

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Delta sync — busca mensagens novas desde o início da migração."""
        if not self.mailbox.started_at:
            return

        src_user = self.mailbox.source_email
        dst_user = self.mailbox.destination_email
        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()
        total_migrated = self.mailbox.items_migrated or 0
        cutoff = self.mailbox.started_at.strftime("%Y-%m-%dT%H:%M:%SZ")

        chats = self._get_user_chats(src_user, src_hdrs)
        new_msgs = 0

        for chat in chats:
            chat_id = chat["id"]
            folder_key = f"chat:{chat_id}"

            messages = self._get_chat_messages(chat_id, src_hdrs, since=cutoff)

            members = chat.get("members", [])
            member_emails = [
                m.get("email") or m.get("userId", "")
                for m in members if m.get("email") or m.get("userId")
            ]

            for msg in messages:
                msg_id = msg["id"]
                if self.is_already_migrated(folder_key, msg_id):
                    continue
                try:
                    body = msg.get("body", {}).get("content", "")
                    dest_id = self._create_chat_and_send(
                        dst_user, msg, member_emails, dst_hdrs
                    )
                    self.record_copied(
                        folder=folder_key, uid=msg_id, dest_id=dest_id,
                        content_hash=hashlib.sha256(body.encode()).hexdigest(),
                        size_bytes=len(body.encode()),
                    )
                    total_migrated += 1
                    new_msgs += 1
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                except Exception as e:
                    self.record_failed(folder_key, msg_id, str(e))

        if new_msgs:
            self.add_log(f"Delta sync Teams: {new_msgs} mensagem(ns) nova(s).")
