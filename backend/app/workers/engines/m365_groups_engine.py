"""M365 Groups engine — migra Microsoft 365 Groups (Unified Groups) entre tenants.

O que migra:
  - Metadados do grupo (displayName, description, visibility)
  - Membros (por UPN — devem existir no tenant destino)
  - Proprietários

O que NÃO migra nesta versão:
  - Email/conversas do grupo (API de conversas não suporta importação histórica)
  - SharePoint site do grupo (usar object_type=sharepoint separado)
  - Teams associado ao grupo (usar objeto Teams separado)
  - Calendário, Planner, etc.

mailbox.source_email      = email do grupo de origem (ex: team@contoso.com)
mailbox.destination_email = email do grupo de destino
"""
import logging
from urllib.parse import quote

import requests

from .base import MigrationEngine, ProgressCallback

logger = logging.getLogger(__name__)
GRAPH_V1 = "https://graph.microsoft.com/v1.0"


class M365GroupsEngine(MigrationEngine):

    # ── Auth ─────────────────────────────────────────────────────────────────────

    def _get_token(self, tenant_id: str, client_id: str, client_secret: str) -> str:
        url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        resp = requests.post(url, data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        }, timeout=30)
        if not resp.ok:
            try:
                data = resp.json()
                raise Exception(
                    f"OAuth {resp.status_code} [{data.get('error','')}]: "
                    f"{data.get('error_description','')[:300]}"
                )
            except (ValueError, KeyError):
                raise Exception(f"OAuth {resp.status_code}: {resp.text[:200]}")
        return resp.json()["access_token"]

    def _src_headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_token(
            self.source_cfg['tenant_id'],
            self.source_cfg['client_id'],
            self.source_cfg['client_secret'],
        )}"}

    def _dst_headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_token(
            self.dest_cfg['tenant_id'],
            self.dest_cfg['client_id'],
            self.dest_cfg['client_secret'],
        )}"}

    # ── Localização de grupo por e-mail ──────────────────────────────────────────

    def _find_group(self, email: str, headers: dict) -> dict | None:
        """Busca grupo pelo e-mail. Tenta filter por 'mail' e fallback por 'mailNickname'."""
        enc = quote(email, safe="@.")
        # Tentativa 1: filter por mail
        url = (f"{GRAPH_V1}/groups"
               f"?$filter=mail eq '{enc}'"
               f"&$select=id,displayName,description,visibility,mailNickname,mail")
        try:
            r = self.retry_on_throttle(lambda: requests.get(url, headers=headers, timeout=15))
            if r.ok:
                items = r.json().get("value", [])
                if items:
                    return items[0]
        except Exception as exc:
            logger.debug(f"_find_group filter falhou para {email}: {exc}")

        # Tentativa 2: filter pelo mailNickname (parte antes do @)
        nickname = email.split("@")[0]
        url2 = (f"{GRAPH_V1}/groups"
                f"?$filter=mailNickname eq '{nickname}'"
                f"&$select=id,displayName,description,visibility,mailNickname,mail")
        try:
            r2 = self.retry_on_throttle(lambda: requests.get(url2, headers=headers, timeout=15))
            if r2.ok:
                items2 = r2.json().get("value", [])
                if items2:
                    return items2[0]
        except Exception:
            pass

        return None

    # ── Criação de grupo no destino ─────────────────────────────────────────────

    def _create_group(self, src_group: dict, dst_email: str, dst_headers: dict) -> str:
        """Cria o grupo no tenant destino. Retorna o id do grupo criado."""
        nickname = dst_email.split("@")[0]
        body = {
            "displayName": src_group.get("displayName") or nickname,
            "mailNickname": nickname,
            "mailEnabled": True,
            "securityEnabled": False,
            "groupTypes": ["Unified"],
            "visibility": src_group.get("visibility") or "Private",
        }
        if src_group.get("description"):
            body["description"] = src_group["description"]

        def do():
            r = requests.post(
                f"{GRAPH_V1}/groups",
                headers={**dst_headers, "Content-Type": "application/json"},
                json=body,
                timeout=30,
            )
            if r.status_code == 429:
                raise Exception("429 throttle")
            if not r.ok:
                try:
                    err = r.json().get("error", {})
                    raise Exception(
                        f"POST /groups HTTP {r.status_code} [{err.get('code','')}]: "
                        f"{err.get('message','')[:300]}"
                    )
                except (ValueError, KeyError):
                    raise Exception(f"POST /groups HTTP {r.status_code}: {r.text[:200]}")
            return r.json()

        data = self.retry_on_throttle(do)
        return data["id"]

    # ── Listagem de membros / proprietários ───────────────────────────────────────

    def _list_members(self, group_id: str, role: str, headers: dict) -> list[str]:
        """
        role = 'members' | 'owners'
        Retorna lista de UPNs.
        """
        url = (f"{GRAPH_V1}/groups/{group_id}/{role}"
               f"?$select=userPrincipalName&$top=100")
        upns: list[str] = []
        while url:
            def fetch():
                r = requests.get(url, headers=headers, timeout=15)
                if r.status_code == 429:
                    raise Exception("429 throttle")
                r.raise_for_status()
                return r.json()
            page = self.retry_on_throttle(fetch)
            for m in page.get("value", []):
                upn = m.get("userPrincipalName")
                if upn:
                    upns.append(upn)
            url = page.get("@odata.nextLink")
        return upns

    # ── Adição de membro / proprietário no destino ─────────────────────────────

    def _resolve_user_id(self, upn: str, headers: dict) -> str | None:
        """Resolve UPN para id de objeto no tenant destino. Retorna None se não existir."""
        try:
            r = requests.get(
                f"{GRAPH_V1}/users/{quote(upn, safe='@.')}?$select=id",
                headers=headers, timeout=10,
            )
            if r.status_code == 200:
                return r.json().get("id")
        except Exception:
            pass
        return None

    def _add_member(self, group_id: str, user_id: str, role: str, headers: dict) -> bool:
        """
        role = 'members' | 'owners'
        Retorna True se adicionado com sucesso, False se já existe (409) ou erro.
        """
        url = f"{GRAPH_V1}/groups/{group_id}/{role}/$ref"
        body = {"@odata.id": f"{GRAPH_V1}/directoryObjects/{user_id}"}

        def do():
            r = requests.post(
                url,
                headers={**headers, "Content-Type": "application/json"},
                json=body,
                timeout=15,
            )
            if r.status_code == 429:
                raise Exception("429 throttle")
            # 204 = added, 400 (already member) = ok, 404 = user not found
            return r.status_code in (204, 400)

        try:
            return self.retry_on_throttle(do)
        except Exception as exc:
            logger.debug(f"_add_member falhou user={user_id}: {exc}")
            return False

    # ── Sincronização de membros e proprietários ──────────────────────────────────

    def _sync_role(self, src_group_id: str, dst_group_id: str,
                   role: str, src_hdrs: dict, dst_hdrs: dict) -> tuple[int, int]:
        """
        Sincroniza membros ou proprietários.
        Retorna (adicionados, não_encontrados).
        """
        upns = self._list_members(src_group_id, role, src_hdrs)
        added = 0
        missing = 0

        for upn in upns:
            user_id = self._resolve_user_id(upn, dst_hdrs)
            if not user_id:
                self.add_log(
                    f"Usuário '{upn}' não encontrado no tenant destino — ignorado.",
                    "warning",
                )
                missing += 1
                continue

            ok = self._add_member(dst_group_id, user_id, role, dst_hdrs)
            if ok:
                added += 1

        return added, missing

    # ── Interface MigrationEngine ─────────────────────────────────────────────────

    def test_connection(self) -> dict:
        src_email = self.source_cfg.get("src_user_id") or (
            self.mailbox.source_email if self.mailbox else ""
        )
        try:
            src_hdrs = self._src_headers()
        except Exception as exc:
            return {"ok": False, "message": f"Origem (OAuth): {exc}"}

        notes = ["Origem OAuth OK"]

        if src_email:
            grp = self._find_group(src_email, src_hdrs)
            if grp:
                notes.append(f"Grupo '{grp.get('displayName')}' encontrado na origem.")
            else:
                return {"ok": False, "message": f"Grupo '{src_email}' não encontrado no tenant de origem."}

        if not self.dest_cfg.get("tenant_id"):
            return {"ok": True, "message": " · ".join(notes) + " · Destino não informado."}

        try:
            self._dst_headers()
            notes.append("Destino OAuth OK")
        except Exception as exc:
            return {"ok": False, "message": f"Destino (OAuth): {exc}"}

        return {"ok": True, "message": " · ".join(notes)}

    def assess(self) -> dict:
        src_email = self.mailbox.source_email
        src_hdrs = self._src_headers()
        grp = self._find_group(src_email, src_hdrs)
        if not grp:
            raise Exception(f"Grupo '{src_email}' não encontrado no tenant de origem.")
        members = self._list_members(grp["id"], "members", src_hdrs)
        owners = self._list_members(grp["id"], "owners", src_hdrs)
        return {
            "total_messages": len(members) + len(owners),
            "estimated_size_bytes": 0,
            "folders": [f"Membros: {len(members)}", f"Proprietários: {len(owners)}"],
        }

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        src_email = self.mailbox.source_email
        dst_email = self.mailbox.destination_email or src_email

        try:
            src_hdrs = self._src_headers()
        except Exception as exc:
            self.add_log(f"Falha ao autenticar no tenant de ORIGEM: {exc}", "error")
            raise
        try:
            dst_hdrs = self._dst_headers()
        except Exception as exc:
            self.add_log(f"Falha ao autenticar no tenant de DESTINO: {exc}", "error")
            raise

        # ── 1. Localizar grupo na origem ─────────────────────────────────────────
        src_grp = self._find_group(src_email, src_hdrs)
        if not src_grp:
            raise Exception(f"Grupo '{src_email}' não encontrado no tenant de origem.")
        src_grp_id = src_grp["id"]
        self.add_log(f"Grupo de origem encontrado: '{src_grp.get('displayName')}' ({src_grp_id[:8]}…)")

        # ── 2. Localizar ou criar grupo no destino ────────────────────────────────
        dst_grp = self._find_group(dst_email, dst_hdrs)
        if dst_grp:
            dst_grp_id = dst_grp["id"]
            self.add_log(f"Grupo de destino já existe: '{dst_grp.get('displayName')}' ({dst_grp_id[:8]}…)")
        else:
            self.add_log(f"Grupo '{dst_email}' não encontrado no destino — criando…")
            dst_grp_id = self._create_group(src_grp, dst_email, dst_hdrs)
            self.add_log(f"Grupo criado no destino com id {dst_grp_id[:8]}…")

        on_progress(1, 3, 0)

        # ── 3. Sincronizar proprietários ──────────────────────────────────────────
        self.add_log("Sincronizando proprietários…")
        o_added, o_missing = self._sync_role(src_grp_id, dst_grp_id, "owners", src_hdrs, dst_hdrs)
        self.add_log(f"Proprietários: {o_added} adicionado(s), {o_missing} não encontrado(s) no destino.")
        on_progress(2, 3, 0)

        # ── 4. Sincronizar membros ────────────────────────────────────────────────
        self.add_log("Sincronizando membros…")
        m_added, m_missing = self._sync_role(src_grp_id, dst_grp_id, "members", src_hdrs, dst_hdrs)
        self.add_log(f"Membros: {m_added} adicionado(s), {m_missing} não encontrado(s) no destino.")
        on_progress(3, 3, 0)

        self.add_log(
            "Migração de grupo concluída. Email/conversas do grupo não são migrados via API — "
            "exporte manualmente se necessário."
        )

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Re-sincroniza membros adicionados após o início da migração."""
        src_email = self.mailbox.source_email
        dst_email = self.mailbox.destination_email or src_email

        src_hdrs = self._src_headers()
        dst_hdrs = self._dst_headers()

        src_grp = self._find_group(src_email, src_hdrs)
        dst_grp = self._find_group(dst_email, dst_hdrs)
        if not src_grp or not dst_grp:
            return

        m_added, _ = self._sync_role(src_grp["id"], dst_grp["id"], "members", src_hdrs, dst_hdrs)
        o_added, _ = self._sync_role(src_grp["id"], dst_grp["id"], "owners", src_hdrs, dst_hdrs)
        if m_added or o_added:
            self.add_log(f"Delta: {m_added} membro(s) + {o_added} proprietário(s) sincronizado(s).")
        on_progress(self.mailbox.items_migrated or 0, self.mailbox.items_total or 0, 0)
