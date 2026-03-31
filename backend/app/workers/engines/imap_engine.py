"""IMAP engine — migra de qualquer servidor IMAP para Exchange Online via IMAP APPEND."""
import email as email_lib
import hashlib
import imaplib
import logging
import re
import ssl
import time
from datetime import datetime
from typing import Optional

from .base import MigrationEngine, ProgressCallback, BATCH_SIZE

logger = logging.getLogger(__name__)


class ImapEngine(MigrationEngine):
    """
    Fonte: qualquer servidor IMAP (host, port, user, password).
    Destino: Exchange Online (outlook.office365.com:993) ou outro IMAP.

    Usa apenas a stdlib Python (imaplib) — sem dependências extras.
    """

    # ── Conexões ──────────────────────────────────────────────────────────────

    def _connect_src(self) -> imaplib.IMAP4_SSL:
        ctx = ssl.create_default_context()
        host = self.source_cfg["host"]
        port = int(self.source_cfg.get("port", 993))
        imap = imaplib.IMAP4_SSL(host, port, ssl_context=ctx)
        imap.login(self.source_cfg["username"], self.source_cfg["password"])
        return imap

    def _connect_dst(self) -> imaplib.IMAP4_SSL:
        ctx = ssl.create_default_context()
        host = self.dest_cfg.get("imap_host", "outlook.office365.com")
        port = int(self.dest_cfg.get("imap_port", 993))
        imap = imaplib.IMAP4_SSL(host, port, ssl_context=ctx)
        imap.login(self.dest_cfg["admin_upn"], self.dest_cfg["admin_password"])
        return imap

    # ── Teste de conexão ──────────────────────────────────────────────────────

    def test_connection(self) -> dict:
        try:
            src = self._connect_src()
            folders = self._list_folders(src)
            src.logout()
            return {
                "ok": True,
                "message": f"Conectado com sucesso. {len(folders)} pasta(s) encontrada(s).",
            }
        except imaplib.IMAP4.error as exc:
            return {"ok": False, "message": f"Erro de autenticação IMAP: {exc}"}
        except OSError as exc:
            return {"ok": False, "message": f"Não foi possível conectar ao servidor: {exc}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    # ── Fase 1: Assessment ────────────────────────────────────────────────────

    def assess(self) -> dict:
        src = self._connect_src()
        folders = self._list_folders(src)
        total = 0
        size_estimate = 0

        for folder in folders:
            try:
                src.select(f'"{folder}"', readonly=True)
                _, data = src.uid("search", None, "ALL")
                uids = data[0].split() if data[0] else []
                count = len(uids)
                total += count

                # Amostra de tamanho (primeiras 10 msgs)
                sample = uids[:min(10, count)]
                if sample:
                    uid_list = b",".join(sample)
                    _, sizes = src.uid("fetch", uid_list, "(RFC822.SIZE)")
                    sample_size = 0
                    sample_count = 0
                    for item in sizes:
                        if isinstance(item, tuple):
                            m = re.search(rb"RFC822\.SIZE (\d+)", item[0])
                            if m:
                                sample_size += int(m.group(1))
                                sample_count += 1
                    if sample_count and count:
                        size_estimate += (sample_size / sample_count) * count
            except Exception as e:
                logger.warning(f"Assessment — pasta '{folder}' ignorada: {e}")

        src.logout()
        return {
            "total_messages": total,
            "estimated_size_bytes": int(size_estimate),
            "folders": folders,
        }

    # ── Fase 2: Migração inicial ──────────────────────────────────────────────

    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        src = self._connect_src()
        dst = self._connect_dst()
        folders = self._list_folders(src)
        total_migrated = self.mailbox.items_migrated or 0
        items_total = self.mailbox.items_total or 0

        for folder in folders:
            chk = self.get_checkpoint(folder)
            if chk and chk.completed and chk.phase == "initial":
                continue  # pasta já concluída nesta fase — pula

            resume_uid = chk.last_uid if chk else None
            folder_q = f'"{folder}"'

            try:
                src.select(folder_q, readonly=True)
            except Exception as e:
                self.add_log(f"Pasta '{folder}' inacessível na fonte: {e}", "warning")
                continue

            # Busca UIDs a processar (retomada segura)
            if resume_uid:
                _, data = src.uid("search", None, f"UID {resume_uid}:*")
                all_uids = data[0].split() if data[0] else []
                uids = [u for u in all_uids if int(u) > int(resume_uid)]
            else:
                _, data = src.uid("search", None, "ALL")
                uids = data[0].split() if data[0] else []

            # Cria pasta no destino se não existir
            self._ensure_folder_dst(dst, folder)

            batch_count = 0
            last_uid_str = resume_uid or ""

            for uid_bytes in uids:
                uid_str = uid_bytes.decode()

                # Baixa email bruto
                try:
                    _, msg_data = src.uid("fetch", uid_bytes, "(RFC822)")
                    if not msg_data or not msg_data[0]:
                        continue
                    raw: bytes = msg_data[0][1]
                except Exception as e:
                    self.add_log(f"Falha ao baixar UID {uid_str} em '{folder}': {e}", "warning")
                    continue

                # Extrai fingerprints
                parsed = email_lib.message_from_bytes(raw)
                msg_id_header = (parsed.get("Message-ID") or "").strip()
                content_hash = hashlib.sha256(raw[:4096]).hexdigest()

                # Anti-duplicação
                if self.is_already_migrated(folder, uid_str, msg_id_header or None):
                    batch_count += 1
                    last_uid_str = uid_str
                    continue

                # Copia para destino via APPEND
                try:
                    dst.select(folder_q)
                    result, append_data = dst.append(folder_q, None, None, raw)
                    dest_id = None
                    if result == "OK" and append_data:
                        dest_id = append_data[0].decode(errors="ignore") if append_data[0] else None

                    self.record_copied(
                        folder=folder,
                        uid=uid_str,
                        dest_id=dest_id,
                        msg_id_header=msg_id_header or None,
                        content_hash=content_hash,
                        size_bytes=len(raw),
                    )

                    total_migrated += 1
                    items_total = max(items_total, total_migrated)

                except Exception as e:
                    self.record_failed(folder, uid_str, str(e), msg_id_header or None)
                    self.add_log(f"Falha ao copiar UID {uid_str} em '{folder}': {e}", "warning")

                batch_count += 1
                last_uid_str = uid_str

                # Checkpoint a cada BATCH_SIZE mensagens
                if batch_count % BATCH_SIZE == 0:
                    self.save_checkpoint(folder, last_uid_str, batch_count)
                    on_progress(total_migrated, items_total, 0)

            # Pasta concluída
            self.save_checkpoint(folder, last_uid_str, batch_count, completed=True)
            self.add_log(f"Pasta '{folder}' concluída: {batch_count} mensagens processadas.")

        src.logout()
        dst.logout()

    # ── Fase 3: Delta sync ────────────────────────────────────────────────────

    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Busca apenas emails que chegaram DEPOIS do last_uid de cada pasta."""
        src = self._connect_src()
        dst = self._connect_dst()
        folders = self._list_folders(src)
        total_migrated = self.mailbox.items_migrated or 0

        for folder in folders:
            chk = self.get_checkpoint(folder)
            if not chk or not chk.last_uid:
                continue  # pasta nunca migrada — pula delta

            folder_q = f'"{folder}"'
            try:
                src.select(folder_q, readonly=True)
            except Exception:
                continue

            # Apenas UIDs > último checkpoint
            _, data = src.uid("search", None, f"UID {chk.last_uid}:*")
            all_uids = data[0].split() if data[0] else []
            new_uids = [u for u in all_uids if int(u) > int(chk.last_uid)]

            if not new_uids:
                continue

            self._ensure_folder_dst(dst, folder)
            self.add_log(f"Delta sync: {len(new_uids)} novas mensagens em '{folder}'.")

            for uid_bytes in new_uids:
                uid_str = uid_bytes.decode()
                try:
                    _, msg_data = src.uid("fetch", uid_bytes, "(RFC822)")
                    if not msg_data or not msg_data[0]:
                        continue
                    raw: bytes = msg_data[0][1]
                except Exception:
                    continue

                parsed = email_lib.message_from_bytes(raw)
                msg_id_header = (parsed.get("Message-ID") or "").strip()

                if self.is_already_migrated(folder, uid_str, msg_id_header or None):
                    continue

                try:
                    dst.select(folder_q)
                    dst.append(folder_q, None, None, raw)
                    self.record_copied(folder=folder, uid=uid_str,
                                       msg_id_header=msg_id_header or None,
                                       size_bytes=len(raw))
                    total_migrated += 1
                    on_progress(total_migrated, self.mailbox.items_total or 0, 0)
                except Exception as e:
                    self.record_failed(folder, uid_str, str(e))

        src.logout()
        dst.logout()

    # ── Verificação ───────────────────────────────────────────────────────────

    def verify(self) -> dict:
        """Conecta no destino e compara Message-IDs por pasta com o ledger."""
        try:
            dst = self._connect_dst()
        except Exception as e:
            return {"ok": False, "error": f"Não foi possível conectar no destino: {e}",
                    "missing_count": 0, "missing": []}

        from sqlalchemy import func
        from app.models.db_models import MigrationMessageLedger

        # Busca Message-IDs no ledger desta mailbox
        ledger_entries = self.db.query(MigrationMessageLedger).filter(
            MigrationMessageLedger.mailbox_id == self.mailbox.id,
            MigrationMessageLedger.status == "copied",
            MigrationMessageLedger.message_id_header.isnot(None),
        ).all()

        ledger_msg_ids = {e.message_id_header.strip() for e in ledger_entries if e.message_id_header}

        if not ledger_msg_ids:
            dst.logout()
            return {"ok": True, "total_in_ledger": 0, "missing_count": 0, "missing": []}

        # Busca todos os Message-IDs no destino (todas as pastas)
        folders = self._list_folders(dst)
        dest_msg_ids = set()
        for folder in folders:
            try:
                dst.select(f'"{folder}"', readonly=True)
                _, data = dst.uid("search", None, "ALL")
                uids = data[0].split() if data[0] else []
                if not uids:
                    continue
                # Busca em batches de 50
                for i in range(0, len(uids), 50):
                    batch = uids[i:i+50]
                    uid_list = b",".join(batch)
                    _, headers = dst.uid("fetch", uid_list,
                                         "(BODY[HEADER.FIELDS (MESSAGE-ID)])")
                    for item in headers:
                        if isinstance(item, tuple):
                            raw_hdr = item[1].decode(errors="ignore") if item[1] else ""
                            m = re.search(r"Message-ID:\s*(<[^>]+>|\S+)", raw_hdr, re.IGNORECASE)
                            if m:
                                dest_msg_ids.add(m.group(1).strip())
            except Exception:
                pass

        dst.logout()

        missing_ids = ledger_msg_ids - dest_msg_ids
        return {
            "ok": len(missing_ids) == 0,
            "total_in_ledger": len(ledger_msg_ids),
            "missing_count": len(missing_ids),
            "missing": list(missing_ids)[:50],  # max 50 para não explodir a resposta
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _list_folders(self, imap: imaplib.IMAP4_SSL) -> list[str]:
        _, folders_raw = imap.list()
        result = []
        seen = set()
        for f in folders_raw:
            if not f:
                continue
            decoded = f.decode(errors="ignore") if isinstance(f, bytes) else f
            # Extrai o nome da pasta (após o último separador ou quoted)
            m = re.search(r'"([^"]+)"\s*$|(\S+)\s*$', decoded)
            if m:
                name = (m.group(1) or m.group(2)).strip().strip('"')
                if name and name not in seen:
                    seen.add(name)
                    result.append(name)
        return result

    def _ensure_folder_dst(self, dst: imaplib.IMAP4_SSL, folder: str) -> None:
        """Cria pasta no destino se não existir."""
        try:
            status, _ = dst.select(f'"{folder}"')
            if status != "OK":
                dst.create(f'"{folder}"')
        except Exception:
            try:
                dst.create(f'"{folder}"')
            except Exception:
                pass
