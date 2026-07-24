"""Teams engine — migração de times/canais entre tenants M365 via Graph Migration API.

Fluxo oficial (requer permissão Teamwork.Migrate.All no tenant destino):

1.  POST /teams                                        (@teamCreationMode=migration)
2.  POST /teams/{t}/channels                           (@channelCreationMode=migration)
3.  POST /teams/{t}/channels/{c}/messages              (createdDateTime + from.user.id)
4.  POST /teams/{t}/channels/{c}/messages/{m}/replies  (replies dos threads)
5.  POST /teams/{t}/channels/{c}/completeMigration     (libera o canal)
6.  POST /teams/{t}/completeMigration                  (libera o time)
7.  POST /groups/{g}/members/$ref                      (adiciona membros — só depois do complete)

Durante o migration mode o time/canal fica "locked": ninguém consegue postar. As mensagens
precisam ser importadas em ordem cronológica por canal, e o `from.user.id` precisa ser um
usuário válido **no tenant destino**.
"""
import hashlib
import logging
import re
import time
from datetime import datetime
from typing import Optional

import requests

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)
GRAPH_V1 = "https://graph.microsoft.com/v1.0"
STANDARD_TEMPLATE = f"{GRAPH_V1}/teamsTemplates('standard')"


class TeamsChatEngine(MigrationEngine):
    """
    Migra os times (joinedTeams) de um usuário entre tenants M365.

    source_cfg  = {tenant_id, client_id, client_secret}
    dest_cfg    = {tenant_id, client_id, client_secret,
                   fallback_user_upn?, user_mapping?, default_domain?}
    mailbox.source_email      = UPN do usuário de origem (lê joinedTeams dele)
    mailbox.destination_email = UPN do usuário de destino (vira owner dos times migrados)

    Configurações opcionais do dest_cfg:
    - fallback_user_upn : UPN usado como remetente quando a origem não puder ser resolvida
    - user_mapping      : dict {src_upn: dst_upn} para mapear remetentes explicitamente
    - default_domain    : domínio do destino; se fornecido, tenta resolver src_user@src → prefix@default_domain
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
        if resp.status_code != 200:
            try:
                err = resp.json()
                code = err.get("error", "")
                desc = err.get("error_description", "")
                m = re.search(r"AADSTS\d+", desc)
                aad = m.group(0) if m else code
                raise Exception(f"OAuth {aad}: {desc[:200]}")
            except ValueError:
                raise Exception(f"OAuth HTTP {resp.status_code}")
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

    # ── Utilitário de erro Graph ────────────────────────────────────────────────

    @staticmethod
    def _describe(resp: requests.Response) -> str:
        try:
            data = resp.json()
            err = data.get("error") or {}
            code = err.get("code", "")
            msg = err.get("message", "") or data
            return f"HTTP {resp.status_code} [{code}]: {str(msg)[:300]}"
        except ValueError:
            return f"HTTP {resp.status_code}: {resp.text[:300]}"

    # ── Listagem na origem ──────────────────────────────────────────────────────

    def _get_joined_teams(self, user_id: str, headers: dict) -> list[dict]:
        url = f"{GRAPH_V1}/users/{user_id}/joinedTeams?$top=100"
        teams = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                if r.status_code != 200:
                    raise Exception(self._describe(r))
                return r.json()
            page = self.retry_on_throttle(fetch)
            teams.extend(page.get("value", []))
            url = page.get("@odata.nextLink")
        return teams

    def _get_team(self, team_id: str, headers: dict) -> dict:
        r = requests.get(f"{GRAPH_V1}/teams/{team_id}", headers=headers, timeout=30)
        if r.status_code != 200:
            raise Exception(self._describe(r))
        return r.json()

    def _get_channels(self, team_id: str, headers: dict) -> list[dict]:
        url = f"{GRAPH_V1}/teams/{team_id}/channels?$top=100"
        channels = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                if r.status_code != 200:
                    raise Exception(self._describe(r))
                return r.json()
            page = self.retry_on_throttle(fetch)
            channels.extend(page.get("value", []))
            url = page.get("@odata.nextLink")
        return channels

    def _get_channel_messages(self, team_id: str, channel_id: str,
                              headers: dict) -> list[dict]:
        """Lista top-level messages (sem replies) em ordem cronológica."""
        url = (f"{GRAPH_V1}/teams/{team_id}/channels/{channel_id}/messages"
               f"?$top=50")
        messages = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                if r.status_code != 200:
                    raise Exception(self._describe(r))
                return r.json()
            page = self.retry_on_throttle(fetch)
            messages.extend(page.get("value", []))
            url = page.get("@odata.nextLink")
        # Ordenar cronologicamente (obrigatório pro import)
        messages.sort(key=lambda m: m.get("createdDateTime", ""))
        return messages

    def _get_message_replies(self, team_id: str, channel_id: str,
                             message_id: str, headers: dict) -> list[dict]:
        url = (f"{GRAPH_V1}/teams/{team_id}/channels/{channel_id}"
               f"/messages/{message_id}/replies?$top=50")
        replies = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=30)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                if r.status_code != 200:
                    raise Exception(self._describe(r))
                return r.json()
            page = self.retry_on_throttle(fetch)
            replies.extend(page.get("value", []))
            url = page.get("@odata.nextLink")
        replies.sort(key=lambda m: m.get("createdDateTime", ""))
        return replies

    # ── Resolução de usuários origem→destino ───────────────────────────────────

    def _src_user_cache(self) -> dict:
        if not hasattr(self, "_src_users"):
            self._src_users: dict[str, str] = {}
        return self._src_users

    def _dst_user_cache(self) -> dict:
        if not hasattr(self, "_dst_users"):
            self._dst_users: dict[str, tuple[str, str]] = {}
        return self._dst_users

    def _resolve_src_upn(self, src_user_id: str, headers: dict) -> Optional[str]:
        """Busca o UPN de um usuário no tenant de origem pelo id."""
        if not src_user_id:
            return None
        cache = self._src_user_cache()
        if src_user_id in cache:
            return cache[src_user_id]
        try:
            r = requests.get(
                f"{GRAPH_V1}/users/{src_user_id}?$select=userPrincipalName,mail",
                headers=headers, timeout=15,
            )
            if r.status_code == 200:
                data = r.json()
                upn = data.get("userPrincipalName") or data.get("mail") or ""
                cache[src_user_id] = upn
                return upn
        except Exception:
            pass
        cache[src_user_id] = ""
        return None

    def _resolve_dst_user(self, src_upn: str, dst_hdrs: dict) -> tuple[str, str]:
        """
        Retorna (dst_user_id, displayName) para usar no campo 'from' das mensagens
        migradas. Segue esta ordem:
        1. user_mapping explícito em dest_cfg
        2. UPN direto (mesmo UPN existir no destino)
        3. prefix + default_domain
        4. fallback_user_upn
        5. ("", src_upn) — deixa Graph decidir (pode falhar)
        """
        cache = self._dst_user_cache()
        if src_upn in cache:
            return cache[src_upn]

        candidates: list[str] = []
        mapping = (self.dest_cfg.get("user_mapping") or {})
        if src_upn and mapping.get(src_upn):
            candidates.append(mapping[src_upn])
        if src_upn:
            candidates.append(src_upn)
            default_domain = self.dest_cfg.get("default_domain")
            if default_domain and "@" in src_upn:
                candidates.append(f"{src_upn.split('@')[0]}@{default_domain}")
        fallback = self.dest_cfg.get("fallback_user_upn")
        if fallback:
            candidates.append(fallback)

        for cand in candidates:
            try:
                r = requests.get(
                    f"{GRAPH_V1}/users/{cand}?$select=id,displayName",
                    headers=dst_hdrs, timeout=15,
                )
                if r.status_code == 200:
                    data = r.json()
                    result = (data.get("id", ""), data.get("displayName", cand))
                    cache[src_upn] = result
                    return result
            except Exception:
                continue

        cache[src_upn] = ("", src_upn or "Unknown")
        return cache[src_upn]

    def _build_from_field(self, msg: dict, src_hdrs: dict, dst_hdrs: dict) -> Optional[dict]:
        """Monta o objeto 'from' da mensagem migrada resolvendo o remetente no destino."""
        src_from = (msg.get("from") or {}).get("user") or {}
        src_user_id = src_from.get("id")
        display = src_from.get("displayName") or "Unknown"

        upn = self._resolve_src_upn(src_user_id, src_hdrs) if src_user_id else None
        if not upn:
            upn = display  # last-resort key pro cache

        dst_id, dst_display = self._resolve_dst_user(upn, dst_hdrs)
        if not dst_id:
            return None
        return {
            "user": {
                "id": dst_id,
                "displayName": dst_display or display,
                "userIdentityType": "aadUser",
            }
        }

    # ── Operações assíncronas do Teams ─────────────────────────────────────────

    def _wait_for_operation(self, location: str, hdrs: dict,
                            timeout: int = 180) -> str:
        """
        Aguarda op. assíncrona (create team/channel) e retorna o team_id resultante.
        Location format: /teams('{team-id}')/operations('{op-id}')
        """
        m = re.search(r"teams\('([^']+)'\).*?operations\('([^']+)'\)", location or "")
        if not m:
            raise Exception(f"Location inválido: {location!r}")
        team_id, op_id = m.group(1), m.group(2)

        start = time.time()
        while time.time() - start < timeout:
            try:
                r = requests.get(
                    f"{GRAPH_V1}/teams/{team_id}/operations/{op_id}",
                    headers=hdrs, timeout=15,
                )
                if r.status_code == 200:
                    status = r.json().get("status", "")
                    if status == "succeeded":
                        return team_id
                    if status == "failed":
                        err = r.json().get("error", {})
                        raise Exception(f"Operação falhou: {err}")
            except requests.RequestException:
                pass
            time.sleep(4)
        raise Exception(f"Timeout aguardando operação {op_id}")

    # ── Criação em migration mode ──────────────────────────────────────────────

    def _create_migration_team(self, src_team: dict, dst_hdrs: dict) -> str:
        """Cria team no destino em modo migration. Retorna dest team_id."""
        chk_key = f"team:{src_team['id']}"
        chk = self.get_checkpoint(chk_key)
        if chk and chk.last_uid:
            return chk.last_uid

        created_dt = src_team.get("createdDateTime") or "2020-01-01T00:00:00.000Z"
        body = {
            "@microsoft.graph.teamCreationMode": "migration",
            "template@odata.bind": STANDARD_TEMPLATE,
            "displayName": src_team.get("displayName", "Migrated Team"),
            "description": src_team.get("description") or "Migrated from source tenant",
            "createdDateTime": created_dt,
        }
        r = requests.post(
            f"{GRAPH_V1}/teams",
            headers={**dst_hdrs, "Content-Type": "application/json"},
            json=body, timeout=60,
        )
        if r.status_code not in (201, 202):
            raise Exception(f"Criar team: {self._describe(r)}")

        if r.status_code == 201:
            dst_team_id = r.json().get("id", "")
        else:
            location = r.headers.get("Location") or r.headers.get("Content-Location", "")
            dst_team_id = self._wait_for_operation(location, dst_hdrs)

        if not dst_team_id:
            raise Exception("Team criado mas sem ID retornado")

        self.save_checkpoint(chk_key, dst_team_id, 0)
        self.add_log(
            f"Team '{src_team.get('displayName')}' criado em migration mode (id={dst_team_id})"
        )
        return dst_team_id

    def _create_migration_channel(self, dst_team_id: str, src_channel: dict,
                                  dst_hdrs: dict) -> str:
        """
        Cria canal no time destino em modo migration. Retorna dest channel_id.
        Caso especial: canal 'General' já é criado automaticamente pelo time e deve ser reutilizado.
        """
        chk_key = f"channel:{src_channel['id']}"
        chk = self.get_checkpoint(chk_key)
        if chk and chk.last_uid:
            return chk.last_uid

        display = src_channel.get("displayName", "Migrated Channel")

        # General: canal padrão, não pode ser recriado
        if display.lower() == "general":
            r = requests.get(
                f"{GRAPH_V1}/teams/{dst_team_id}/channels",
                headers=dst_hdrs, timeout=30,
            )
            if r.status_code == 200:
                for ch in r.json().get("value", []):
                    if (ch.get("displayName") or "").lower() == "general":
                        self.save_checkpoint(chk_key, ch["id"], 0)
                        return ch["id"]
            raise Exception("General channel não encontrado no team destino")

        created_dt = src_channel.get("createdDateTime") or "2020-01-01T00:00:00.000Z"
        body = {
            "@microsoft.graph.channelCreationMode": "migration",
            "displayName": display,
            "description": src_channel.get("description") or "",
            "membershipType": src_channel.get("membershipType", "standard"),
            "createdDateTime": created_dt,
        }
        r = requests.post(
            f"{GRAPH_V1}/teams/{dst_team_id}/channels",
            headers={**dst_hdrs, "Content-Type": "application/json"},
            json=body, timeout=60,
        )
        if r.status_code not in (201, 202):
            raise Exception(f"Criar canal '{display}': {self._describe(r)}")

        if r.status_code == 201:
            channel_id = r.json().get("id", "")
        else:
            # Criação assíncrona de canal retorna operação no escopo do time
            location = r.headers.get("Location") or r.headers.get("Content-Location", "")
            # Re-listar canais e achar pelo displayName é mais robusto
            time.sleep(3)
            list_resp = requests.get(
                f"{GRAPH_V1}/teams/{dst_team_id}/channels",
                headers=dst_hdrs, timeout=30,
            )
            channel_id = ""
            if list_resp.status_code == 200:
                for ch in list_resp.json().get("value", []):
                    if ch.get("displayName") == display:
                        channel_id = ch.get("id", "")
                        break

        if not channel_id:
            raise Exception(f"Canal '{display}' criado mas ID não resolvido")

        self.save_checkpoint(chk_key, channel_id, 0)
        return channel_id

    # ── Import de mensagens ────────────────────────────────────────────────────

    def _import_message(self, dst_team_id: str, dst_channel_id: str,
                        msg: dict, src_hdrs: dict, dst_hdrs: dict,
                        parent_id: Optional[str] = None) -> str:
        """
        Importa uma mensagem (ou reply se parent_id fornecido) no canal destino.
        Exige migration mode ativo no canal.
        """
        from_field = self._build_from_field(msg, src_hdrs, dst_hdrs)

        body: dict = {
            "createdDateTime": msg.get("createdDateTime"),
            "body": msg.get("body") or {"contentType": "text", "content": ""},
        }
        if from_field:
            body["from"] = from_field
        if msg.get("attachments"):
            body["attachments"] = msg["attachments"]
        if msg.get("mentions"):
            body["mentions"] = msg["mentions"]
        if msg.get("subject"):
            body["subject"] = msg["subject"]
        if msg.get("importance"):
            body["importance"] = msg["importance"]

        if parent_id:
            url = (f"{GRAPH_V1}/teams/{dst_team_id}/channels/{dst_channel_id}"
                   f"/messages/{parent_id}/replies")
        else:
            url = f"{GRAPH_V1}/teams/{dst_team_id}/channels/{dst_channel_id}/messages"

        def do():
            r = requests.post(
                url, headers={**dst_hdrs, "Content-Type": "application/json"},
                json=body, timeout=30,
            )
            if r.status_code == 429:
                raise Exception("429 throttle")
            if r.status_code not in (200, 201):
                raise Exception(self._describe(r))
            return r.json()

        result = self.retry_on_throttle(do)
        return result.get("id", "")

    # ── completeMigration ──────────────────────────────────────────────────────

    def _complete_channel(self, team_id: str, channel_id: str, hdrs: dict) -> None:
        r = requests.post(
            f"{GRAPH_V1}/teams/{team_id}/channels/{channel_id}/completeMigration",
            headers=hdrs, timeout=30,
        )
        if r.status_code not in (204, 200):
            raise Exception(f"completeMigration canal: {self._describe(r)}")

    def _complete_team(self, team_id: str, hdrs: dict) -> None:
        r = requests.post(
            f"{GRAPH_V1}/teams/{team_id}/completeMigration",
            headers=hdrs, timeout=30,
        )
        if r.status_code not in (204, 200):
            raise Exception(f"completeMigration team: {self._describe(r)}")

    def _add_owner(self, team_id: str, user_upn: str, dst_hdrs: dict) -> None:
        """Adiciona um usuário como owner do time (só após completeMigration)."""
        lookup = requests.get(
            f"{GRAPH_V1}/users/{user_upn}?$select=id",
            headers=dst_hdrs, timeout=15,
        )
        if lookup.status_code != 200:
            raise Exception(f"Usuário '{user_upn}' não encontrado no destino")
        user_id = lookup.json().get("id", "")

        body = {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            "roles": ["owner"],
            "user@odata.bind": f"{GRAPH_V1}/users('{user_id}')",
        }
        r = requests.post(
            f"{GRAPH_V1}/teams/{team_id}/members",
            headers={**dst_hdrs, "Content-Type": "application/json"},
            json=body, timeout=30,
        )
        if r.status_code not in (200, 201):
            # 409 pode acontecer se já for owner — ignora
            if r.status_code != 409:
                raise Exception(f"Adicionar owner: {self._describe(r)}")

    # ── Interface MigrationEngine ──────────────────────────────────────────────

    def test_connection(self) -> dict:
        try:
            src_token = self._get_token(
                self.source_cfg["tenant_id"],
                self.source_cfg["client_id"],
                self.source_cfg["client_secret"],
            )
            dst_token = self._get_token(
                self.dest_cfg["tenant_id"],
                self.dest_cfg["client_id"],
                self.dest_cfg["client_secret"],
            )
        except Exception as exc:
            return {"ok": False, "message": f"Falha OAuth: {exc}"}

        src_user = self.source_cfg.get("test_user") or (
            self.mailbox.source_email if self.mailbox else None
        )
        if not src_user:
            return {"ok": True, "message": "Tokens OAuth obtidos nos dois tenants."}

        try:
            r = requests.get(
                f"{GRAPH_V1}/users/{src_user}/joinedTeams?$top=1",
                headers={"Authorization": f"Bearer {src_token}"}, timeout=15,
            )
            if r.status_code != 200:
                return {"ok": False, "message": f"Origem: {self._describe(r)}"}

            dst_user = self.mailbox.destination_email if self.mailbox else None
            if dst_user:
                r2 = requests.get(
                    f"{GRAPH_V1}/users/{dst_user}?$select=id",
                    headers={"Authorization": f"Bearer {dst_token}"}, timeout=15,
                )
                if r2.status_code != 200:
                    return {"ok": False, "message": f"Destino: {self._describe(r2)}"}
            return {"ok": True, "message": f"Conectado. Acesso a joinedTeams de {src_user} confirmado."}
        except Exception as exc:
            return {"ok": False, "message": f"Falha: {exc}"}

    def assess(self) -> dict:
        src_user = self.mailbox.source_email
        src_hdrs = self._src_headers()

        teams = self._get_joined_teams(src_user, src_hdrs)
        total_messages = 0
        folder_labels = []

        for team in teams:
            try:
                channels = self._get_channels(team["id"], src_hdrs)
            except Exception as e:
                self.add_log(f"Ignorando team '{team.get('displayName')}': {e}", "warning")
                continue
            for ch in channels:
                folder_labels.append(f"{team.get('displayName')} / {ch.get('displayName')}")
                try:
                    msgs = self._get_channel_messages(team["id"], ch["id"], src_hdrs)
                    total_messages += len(msgs)
                    # contar replies de forma amostrada (primeiras 5 msgs)
                    for m in msgs[:5]:
                        replies = self._get_message_replies(
                            team["id"], ch["id"], m["id"], src_hdrs
                        )
                        total_messages += len(replies)
                except Exception as e:
                    self.add_log(
                        f"Canal '{ch.get('displayName')}' não contado: {e}", "warning"
                    )

        return {
            "total_messages": total_messages,
            "estimated_size_bytes": total_messages * 2048,
            "folders": folder_labels[:100],
        }

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        src_user = self.mailbox.source_email
        dst_user = self.mailbox.destination_email

        try:
            src_hdrs = self._src_headers()
            dst_hdrs = self._dst_headers()
        except Exception as exc:
            self.add_log(f"Erro OAuth: {exc}", "error")
            raise

        total_migrated = self.mailbox.items_migrated or 0
        total_items = self.mailbox.items_total or 0

        teams = self._get_joined_teams(src_user, src_hdrs)
        self.add_log(f"Encontrados {len(teams)} time(s) para migrar do usuário {src_user}.")

        for team in teams:
            src_team_id = team["id"]
            team_name = team.get("displayName", src_team_id)
            team_chk_key = f"team:{src_team_id}"
            team_done_chk = self.get_checkpoint(f"team_done:{src_team_id}")
            if team_done_chk and team_done_chk.completed:
                self.add_log(f"Team '{team_name}' já finalizado — pulando.")
                continue

            # Refresca info do time (joinedTeams não traz createdDateTime)
            try:
                full_team = self._get_team(src_team_id, src_hdrs)
                team.update(full_team)
            except Exception:
                pass

            # 1) Criar team destino em migration mode
            try:
                dst_team_id = self._create_migration_team(team, dst_hdrs)
            except Exception as exc:
                self.add_log(f"Falha ao criar team destino '{team_name}': {exc}", "error")
                continue

            # 2) Migrar canais
            try:
                channels = self._get_channels(src_team_id, src_hdrs)
            except Exception as exc:
                self.add_log(f"Falha listando canais de '{team_name}': {exc}", "error")
                continue

            # General primeiro (pra usar o canal auto-criado), depois os demais
            channels.sort(key=lambda c: 0 if (c.get("displayName") or "").lower() == "general" else 1)

            migrated_channels: list[tuple[str, str, str]] = []  # (src_ch_id, dst_ch_id, name)

            for channel in channels:
                src_ch_id = channel["id"]
                ch_name = channel.get("displayName", src_ch_id)
                folder_key = f"channel_msgs:{src_team_id}:{src_ch_id}"

                ch_done = self.get_checkpoint(f"channel_done:{src_ch_id}")
                if ch_done and ch_done.completed:
                    migrated_channels.append((src_ch_id, ch_done.last_uid or "", ch_name))
                    continue

                try:
                    dst_ch_id = self._create_migration_channel(dst_team_id, channel, dst_hdrs)
                except Exception as exc:
                    self.add_log(f"Falha canal '{ch_name}': {exc}", "error")
                    continue

                # 3) Importar mensagens em ordem cronológica
                try:
                    messages = self._get_channel_messages(src_team_id, src_ch_id, src_hdrs)
                except Exception as exc:
                    self.add_log(f"Falha listando msgs '{ch_name}': {exc}", "error")
                    continue

                self.add_log(f"Canal '{ch_name}': {len(messages)} mensagens top-level.")

                for msg in messages:
                    msg_id = msg["id"]
                    if self.is_already_migrated(folder_key, msg_id):
                        continue

                    try:
                        dest_msg_id = self._import_message(
                            dst_team_id, dst_ch_id, msg, src_hdrs, dst_hdrs
                        )
                        body_content = (msg.get("body") or {}).get("content", "")
                        self.record_copied(
                            folder=folder_key, uid=msg_id, dest_id=dest_msg_id,
                            content_hash=hashlib.sha256(body_content.encode()).hexdigest(),
                            size_bytes=len(body_content.encode()),
                        )
                        total_migrated += 1

                        # 4) Replies (thread)
                        try:
                            replies = self._get_message_replies(
                                src_team_id, src_ch_id, msg_id, src_hdrs
                            )
                        except Exception as exc:
                            self.add_log(
                                f"Falha replies de msg {msg_id[:12]}: {exc}", "warning"
                            )
                            replies = []

                        for rep in replies:
                            rep_id = rep["id"]
                            rep_key = f"{folder_key}:replies"
                            if self.is_already_migrated(rep_key, rep_id):
                                continue
                            try:
                                self._import_message(
                                    dst_team_id, dst_ch_id, rep,
                                    src_hdrs, dst_hdrs, parent_id=dest_msg_id,
                                )
                                rep_body = (rep.get("body") or {}).get("content", "")
                                self.record_copied(
                                    folder=rep_key, uid=rep_id,
                                    content_hash=hashlib.sha256(rep_body.encode()).hexdigest(),
                                    size_bytes=len(rep_body.encode()),
                                )
                                total_migrated += 1
                            except Exception as exc:
                                self.record_failed(rep_key, rep_id, str(exc))

                    except Exception as exc:
                        self.record_failed(folder_key, msg_id, str(exc))
                        self.add_log(
                            f"Falha msg {msg_id[:12]} em '{ch_name}': {exc}", "warning"
                        )

                    if total_migrated % BATCH_SIZE == 0:
                        self.save_checkpoint(folder_key, msg_id, total_migrated)
                        on_progress(total_migrated, total_items, 0)

                # 5) Completar migração do canal
                try:
                    self._complete_channel(dst_team_id, dst_ch_id, dst_hdrs)
                    self.save_checkpoint(
                        f"channel_done:{src_ch_id}", dst_ch_id, total_migrated, completed=True
                    )
                    migrated_channels.append((src_ch_id, dst_ch_id, ch_name))
                    self.add_log(f"Canal '{ch_name}' finalizado (completeMigration).")
                except Exception as exc:
                    self.add_log(
                        f"Falha completeMigration canal '{ch_name}': {exc}", "error"
                    )

            # 6) Completar migração do time
            try:
                self._complete_team(dst_team_id, dst_hdrs)
                self.add_log(f"Team '{team_name}' finalizado (completeMigration).")
            except Exception as exc:
                self.add_log(
                    f"Falha completeMigration team '{team_name}': {exc}", "error"
                )
                continue

            # 7) Adicionar owner (só funciona após completeMigration)
            if dst_user:
                try:
                    self._add_owner(dst_team_id, dst_user, dst_hdrs)
                    self.add_log(f"Usuário {dst_user} adicionado como owner de '{team_name}'.")
                except Exception as exc:
                    self.add_log(
                        f"Falha ao adicionar owner em '{team_name}': {exc}", "warning"
                    )

            self.save_checkpoint(
                f"team_done:{src_team_id}", dst_team_id, total_migrated, completed=True
            )
            on_progress(total_migrated, total_items, 0)

        on_progress(total_migrated, total_items, 0)
        self.add_log(f"Migração Teams concluída: {total_migrated} mensagens importadas.")

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """
        Delta sync não é suportado pelo fluxo de migration mode:
        após completeMigration o canal é "unlocked" e a Graph API
        não aceita mais POST com createdDateTime backdated.

        Novas mensagens precisariam ser copiadas via endpoint normal
        /messages, mas isso retorna 403 sem permissão delegada do usuário.
        """
        self.add_log(
            "Delta sync não disponível para Teams: canais ficam em modo normal "
            "após completeMigration e não aceitam mais import backdated.",
            "info",
        )

    def verify(self) -> dict:
        """Verificação baseada no ledger — contagem de mensagens copiadas."""
        from app.models.db_models import MigrationMessageLedger
        total = self.db.query(MigrationMessageLedger).filter(
            MigrationMessageLedger.mailbox_id == self.mailbox.id,
            MigrationMessageLedger.status == "copied",
        ).count()
        return {
            "ok": True,
            "total_in_ledger": total,
            "missing_count": 0,
            "missing": [],
            "note": "Verificação via ledger — Teams Migration API não oferece contagem direta.",
        }
