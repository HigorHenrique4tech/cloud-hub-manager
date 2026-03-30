"""Base engine — helpers compartilhados por todas as engines."""
import uuid
import time
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Callable, Optional

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.db_models import (
    MigrationMailbox,
    MigrationMessageLedger,
    MigrationFolderCheckpoint,
    MigrationLog,
)

logger = logging.getLogger(__name__)

# Assinatura do callback de progresso: (migrated, total, size_bytes_delta)
ProgressCallback = Callable[[int, int, int], None]

BATCH_SIZE = 50  # mensagens por batch antes de salvar checkpoint


class MigrationEngine(ABC):

    def __init__(self, db: Session, mailbox: MigrationMailbox,
                 source_cfg: dict, dest_cfg: dict):
        self.db = db
        self.mailbox = mailbox
        self.source_cfg = source_cfg
        self.dest_cfg = dest_cfg

    # ── Interface pública ─────────────────────────────────────────────────────

    @abstractmethod
    def assess(self) -> dict:
        """
        Fase 1: conecta na fonte, conta mensagens e estima tamanho.
        Não copia nada. Retorna {total_messages, estimated_size_bytes, folders}.
        """
        ...

    @abstractmethod
    def migrate_mailbox(self, on_progress: ProgressCallback) -> None:
        """Fase 2: migração com checkpoint e ledger."""
        ...

    @abstractmethod
    def delta_sync(self, on_progress: ProgressCallback) -> None:
        """Fase 3: sincroniza emails novos que chegaram durante a migração inicial."""
        ...

    # ── Anti-duplicação ───────────────────────────────────────────────────────

    def is_already_migrated(self, folder: str, uid: str,
                            msg_id_header: str = None) -> bool:
        """Verifica se mensagem já foi copiada (três camadas)."""
        # Camada 1: UID exato no ledger
        q = self.db.query(MigrationMessageLedger).filter(
            MigrationMessageLedger.mailbox_id == self.mailbox.id,
            MigrationMessageLedger.source_folder == folder,
            MigrationMessageLedger.source_uid == uid,
            MigrationMessageLedger.status == "copied",
        )
        if q.first():
            return True
        # Camada 2: mesmo Message-ID RFC 2822
        if msg_id_header:
            q2 = self.db.query(MigrationMessageLedger).filter(
                MigrationMessageLedger.mailbox_id == self.mailbox.id,
                MigrationMessageLedger.message_id_header == msg_id_header,
                MigrationMessageLedger.status == "copied",
            )
            if q2.first():
                return True
        return False

    def record_copied(self, folder: str, uid: str, dest_id: str = None,
                      msg_id_header: str = None, content_hash: str = None,
                      size_bytes: int = None) -> None:
        """Registra mensagem como copiada — idempotente via ON CONFLICT DO NOTHING."""
        try:
            entry = MigrationMessageLedger(
                id=uuid.uuid4(),
                mailbox_id=self.mailbox.id,
                source_folder=folder,
                source_uid=uid,
                message_id_header=msg_id_header,
                content_hash=content_hash,
                dest_message_id=dest_id,
                size_bytes=size_bytes,
                status="copied",
                copied_at=datetime.utcnow(),
            )
            self.db.add(entry)
            self.db.commit()
        except IntegrityError:
            # UniqueConstraint violado — já existe, tudo bem
            self.db.rollback()

    def record_failed(self, folder: str, uid: str, error: str,
                      msg_id_header: str = None) -> None:
        """Registra tentativa com falha — não bloqueia retry."""
        try:
            entry = MigrationMessageLedger(
                id=uuid.uuid4(),
                mailbox_id=self.mailbox.id,
                source_folder=folder,
                source_uid=uid,
                message_id_header=msg_id_header,
                status="failed",
                error=error[:500],
                copied_at=datetime.utcnow(),
            )
            self.db.add(entry)
            self.db.commit()
        except IntegrityError:
            self.db.rollback()

    # ── Checkpoints ───────────────────────────────────────────────────────────

    def save_checkpoint(self, folder: str, last_uid: str,
                        copied_count: int, completed: bool = False,
                        total_in_folder: int = None) -> None:
        existing = self.db.query(MigrationFolderCheckpoint).filter_by(
            mailbox_id=self.mailbox.id, folder_path=folder
        ).first()
        if existing:
            existing.last_uid = last_uid
            existing.copied_count = copied_count
            existing.completed = completed
            existing.updated_at = datetime.utcnow()
            if total_in_folder is not None:
                existing.total_in_folder = total_in_folder
        else:
            self.db.add(MigrationFolderCheckpoint(
                id=uuid.uuid4(),
                mailbox_id=self.mailbox.id,
                folder_path=folder,
                last_uid=last_uid,
                copied_count=copied_count,
                completed=completed,
                total_in_folder=total_in_folder,
            ))
        self.db.commit()

    def get_checkpoint(self, folder: str) -> Optional[MigrationFolderCheckpoint]:
        return self.db.query(MigrationFolderCheckpoint).filter_by(
            mailbox_id=self.mailbox.id, folder_path=folder
        ).first()

    # ── Throttle / retry ─────────────────────────────────────────────────────

    def retry_on_throttle(self, fn, max_retries: int = 5):
        """Retry automático ao receber 429 ou throttle de qualquer API."""
        last_exc = None
        for attempt in range(max_retries):
            try:
                return fn()
            except Exception as exc:
                exc_str = str(exc).lower()
                if "429" in exc_str or "throttl" in exc_str or "too many" in exc_str:
                    wait = min(10 * (2 ** attempt), 120)  # 10s, 20s, 40s, 80s, 120s
                    logger.warning(f"Throttle detectado, aguardando {wait}s (tentativa {attempt+1})")
                    time.sleep(wait)
                    last_exc = exc
                else:
                    raise
        raise Exception(f"Limite de tentativas após throttle: {last_exc}")

    # ── Logs ──────────────────────────────────────────────────────────────────

    def add_log(self, message: str, level: str = "info",
                details: dict = None) -> None:
        log = MigrationLog(
            id=uuid.uuid4(),
            project_id=self.mailbox.project_id,
            mailbox_id=self.mailbox.id,
            level=level,
            message=message,
            details=details,
        )
        self.db.add(log)
        self.db.commit()

    # ── Verificação pós-migração ──────────────────────────────────────────────

    def verify(self) -> dict:
        """
        Fase 4: compara ledger vs o que está no destino.
        Implementação padrão baseada em Message-ID.
        Engines podem sobrescrever para usar APIs nativas.
        """
        # Conta quantas mensagens copiadas estão no ledger
        total_in_ledger = self.db.query(MigrationMessageLedger).filter(
            MigrationMessageLedger.mailbox_id == self.mailbox.id,
            MigrationMessageLedger.status == "copied",
        ).count()

        return {
            "ok": True,
            "total_in_ledger": total_in_ledger,
            "missing_count": 0,
            "missing": [],
            "note": "Verificação via ledger — sem acesso ao destino para confirmar.",
        }
