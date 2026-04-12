"""Celery task — orquestra a migração completa de um projeto."""
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional

from sqlalchemy import update as sa_update

from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.models.db_models import (
    MigrationProject, MigrationMailbox, MigrationLog,
)
from app.services.migration_service import decrypt_project_configs
from app.workers.engines import get_engine

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _add_project_log(db, project_id: str, message: str,
                     level: str = "info", mailbox_id: str = None):
    log = MigrationLog(
        id=uuid.uuid4(),
        project_id=project_id,
        mailbox_id=mailbox_id,
        level=level,
        message=message,
    )
    db.add(log)
    db.commit()


def _refresh_project(db, project_id: str) -> Optional[MigrationProject]:
    db.expire_all()
    return db.query(MigrationProject).filter(MigrationProject.id == project_id).first()


# ── Notificações ──────────────────────────────────────────────────────────────

def _notify_migration_completed(db, project, completed_count: int, failed_count: int):
    """Dispara email + push notification ao responsável pelo projeto."""
    try:
        from app.models.db_models import User, Workspace
        from app.services.email_service import send_migration_completed_email
        from app.services.notification_service import push_notification
        from app.services.branding_service import get_branding_for_workspace

        workspace = db.query(Workspace).filter(Workspace.id == project.workspace_id).first()
        user = db.query(User).filter(User.id == project.created_by).first()
        if not user:
            return

        branding = None
        try:
            branding = get_branding_for_workspace(db, str(project.workspace_id))
        except Exception:
            pass

        # Email
        send_migration_completed_email(
            to_email=user.email,
            user_name=user.name or user.email,
            project_name=project.name,
            completed_count=completed_count,
            failed_count=failed_count,
            project_id=str(project.id),
            branding=branding,
        )

        # Push (in-app)
        status_msg = (
            f"Migração '{project.name}' concluída: {completed_count} caixas migradas, {failed_count} falhas."
            if failed_count > 0
            else f"Migração '{project.name}' concluída com sucesso: {completed_count} caixas migradas."
        )
        push_notification(
            db,
            workspace_id=str(project.workspace_id),
            notification_type="migration",
            message=status_msg,
            link_to=f"/m365/migration/{project.id}",
        )

        # Fire event para canais (Teams/Telegram/Email)
        from app.services.notification_channel_service import fire_event
        event_key = "migration.failed" if (failed_count > 0 and completed_count == 0) else "migration.completed"
        fire_event(db, str(project.workspace_id), event_key, {
            "project_name": project.name,
            "completed_count": completed_count,
            "failed_count": failed_count,
            "type": project.migration_type,
            "status": "Falhou" if event_key == "migration.failed" else "Concluída",
        })
    except Exception as exc:
        logger.warning(f"Falha ao enviar notificação de conclusão de migração: {exc}")


# ── Migração de uma caixa individual ─────────────────────────────────────────

def _migrate_one_mailbox(project_id: str, mailbox_id: str,
                         migration_type: str,
                         source_cfg: dict, dest_cfg: dict) -> dict:
    """
    Executado em thread separada.
    Abre sua própria sessão de DB — seguro para ThreadPoolExecutor.
    Retorna {"ok": bool, "mailbox_id": str, "error": str|None}
    """
    db = SessionLocal()
    try:
        mb = db.query(MigrationMailbox).filter(MigrationMailbox.id == mailbox_id).first()
        if not mb:
            return {"ok": False, "mailbox_id": mailbox_id, "error": "Mailbox não encontrada"}

        # Marca como running
        mb.status = "running"
        mb.phase = "initial"
        if not mb.started_at:
            mb.started_at = datetime.utcnow()
        db.commit()

        # ── Fase 1: Assessment ────────────────────────────────────────────────
        engine = get_engine(migration_type, source_cfg, dest_cfg, db=db, mailbox=mb)

        try:
            assessment = engine.assess()
            mb.items_total = assessment.get("total_messages", 0)
            mb.size_bytes = assessment.get("estimated_size_bytes", 0)
            db.commit()
            engine.add_log(
                f"Assessment: {mb.items_total} mensagens, "
                f"{round((mb.size_bytes or 0) / 1_048_576, 1)} MB estimados."
            )
        except Exception as e:
            logger.warning(f"Assessment falhou para {mb.source_email}: {e} — continuando sem totais.")

        # ── Fase 2: Migração inicial ──────────────────────────────────────────

        def on_progress(migrated: int, total: int, size_delta: int):
            # Verifica pausa a cada callback de progresso
            db.expire(mb)
            proj = _refresh_project(db, project_id)
            if proj and proj.status == "paused":
                raise InterruptedError("Migração pausada pelo usuário.")
            mb.items_migrated = migrated
            if total:
                mb.items_total = total
            db.commit()

        engine.migrate_mailbox(on_progress)

        # ── Fase 3: Delta sync ────────────────────────────────────────────────
        mb.phase = "delta"
        db.commit()
        engine.add_log("Iniciando delta sync...")
        try:
            engine.delta_sync(on_progress)
        except Exception as e:
            engine.add_log(f"Delta sync falhou (não crítico): {e}", "warning")

        # ── Fase 4: Verificação ───────────────────────────────────────────────
        mb.phase = "verify"
        db.commit()
        engine.add_log("Iniciando verificação pós-migração...")
        try:
            verify_result = engine.verify()
            mb.verify_result = verify_result
            mb.verified_at = datetime.utcnow()
            mb.phase = "done"
            engine.add_log(
                f"Verificação concluída: ok={verify_result.get('ok')}, "
                f"faltando={verify_result.get('missing_count', 0)}",
                level="info" if verify_result.get("ok") else "warning",
            )
        except Exception as e:
            engine.add_log(f"Verificação falhou: {e}", "warning")
            mb.phase = "done"

        # Finaliza caixa com sucesso
        mb.status = "completed"
        mb.completed_at = datetime.utcnow()
        db.commit()

        # Atualiza contadores atomicamente para evitar race condition com as outras threads.
        update_vals = {MigrationProject.completed_count: MigrationProject.completed_count + 1}
        if mb.verify_result and mb.verify_result.get("ok"):
            update_vals[MigrationProject.verified_count] = MigrationProject.verified_count + 1
        db.execute(
            sa_update(MigrationProject)
            .where(MigrationProject.id == project_id)
            .values(**update_vals)
        )
        db.commit()

        return {"ok": True, "mailbox_id": mailbox_id, "error": None}

    except InterruptedError:
        mb.status = "paused"
        db.commit()
        return {"ok": True, "mailbox_id": mailbox_id, "error": None, "paused": True}

    except Exception as exc:
        logger.exception(f"Falha na migração de {mailbox_id}: {exc}")
        try:
            mb.status = "failed"
            mb.error_message = str(exc)[:500]
            mb.completed_at = datetime.utcnow()
            db.commit()

            db.execute(
                sa_update(MigrationProject)
                .where(MigrationProject.id == project_id)
                .values(failed_count=MigrationProject.failed_count + 1)
            )
            db.commit()

            _add_project_log(db, project_id, f"Falha em {mb.source_email}: {exc}",
                             level="error", mailbox_id=mailbox_id)
        except Exception:
            pass
        return {"ok": False, "mailbox_id": mailbox_id, "error": str(exc)}

    finally:
        db.close()


# ── Task principal ────────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.workers.migration_worker.run_migration_project",
    max_retries=0,        # a task em si não deve ser retentada — o mecanismo de retomada é interno
    acks_late=True,
)
def run_migration_project(self, project_id: str,
                           verify_only: bool = False,
                           delta_only: bool = False):
    """
    Orquestra a migração completa de um projeto.
    Executa até 5 mailboxes em paralelo via ThreadPoolExecutor.
    """
    logger.info(f"[Migration] Iniciando projeto {project_id}")
    db = SessionLocal()

    try:
        project = _refresh_project(db, project_id)
        if not project:
            logger.error(f"Projeto {project_id} não encontrado.")
            return

        if project.status != "running":
            logger.info(f"Projeto {project_id} não está em 'running' (status={project.status}), abortando.")
            return

        # Descriptografa configs usando a chave per-org do workspace
        try:
            source_cfg, dest_cfg = decrypt_project_configs(db, project)
            if not source_cfg:
                raise ValueError("source_config vazio ou inválido após descriptografia.")
        except Exception as e:
            project.status = "failed"
            db.commit()
            _add_project_log(db, project_id, f"Configuração inválida ou não foi possível descriptografar: {e}", "error")
            return

        migration_type = project.migration_type

        # Filtra mailboxes conforme modo de operação
        if verify_only:
            mailboxes = db.query(MigrationMailbox).filter(
                MigrationMailbox.project_id == project_id,
                MigrationMailbox.status == "completed",
                MigrationMailbox.verified_at.is_(None),
            ).all()
        elif delta_only:
            mailboxes = db.query(MigrationMailbox).filter(
                MigrationMailbox.project_id == project_id,
                MigrationMailbox.status == "completed",
            ).all()
        else:
            mailboxes = db.query(MigrationMailbox).filter(
                MigrationMailbox.project_id == project_id,
                MigrationMailbox.status.in_(["pending", "paused", "failed"]),
            ).all()

        if not mailboxes:
            _add_project_log(db, project_id, "Nenhuma caixa pendente para migrar.")
            project.status = "completed"
            project.completed_at = datetime.utcnow()
            db.commit()
            return

        mailbox_ids = [str(mb.id) for mb in mailboxes]
        _add_project_log(db, project_id,
                         f"Iniciando migração de {len(mailbox_ids)} caixa(s). "
                         f"Tipo: {migration_type}.")

        # Push start notification
        try:
            from app.services.notification_service import push_notification
            from app.services.notification_channel_service import fire_event
            push_notification(
                db,
                workspace_id=str(project.workspace_id),
                notification_type="migration",
                message=f"Migração '{project.name}' iniciada: {len(mailbox_ids)} caixa(s) em processamento.",
                link_to=f"/m365/migration/{project_id}",
            )
            fire_event(db, str(project.workspace_id), "migration.started", {
                "project_name": project.name,
                "type": migration_type,
                "pending_count": len(mailbox_ids),
                "status": "Em execução",
            })
        except Exception:
            pass

        db.close()
        db = None  # threads abrem suas próprias sessões

        # Executa até 5 mailboxes em paralelo
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = {
                pool.submit(
                    _migrate_one_mailbox,
                    project_id, mb_id, migration_type, source_cfg, dest_cfg
                ): mb_id
                for mb_id in mailbox_ids
            }

            for future in as_completed(futures):
                try:
                    result = future.result()
                    if not result.get("ok"):
                        logger.warning(f"Mailbox {futures[future]} falhou: {result.get('error')}")
                except Exception as exc:
                    logger.exception(f"Exceção não tratada na thread de {futures[future]}: {exc}")

                # Checa se projeto foi cancelado por fora
                check_db = SessionLocal()
                try:
                    proj = _refresh_project(check_db, project_id)
                    if proj and proj.status not in ("running", "paused"):
                        logger.info(f"Projeto {project_id} cancelado externamente. Encerrando threads.")
                        pool.shutdown(wait=False, cancel_futures=True)
                        return
                finally:
                    check_db.close()

        # Finaliza projeto
        final_db = SessionLocal()
        try:
            project = _refresh_project(final_db, project_id)
            if project and project.status == "running":
                failed = project.failed_count or 0
                completed = project.completed_count or 0
                if failed > 0 and completed == 0:
                    project.status = "failed"
                elif failed > 0:
                    project.status = "completed"  # parcialmente completado
                else:
                    project.status = "completed"
                project.completed_at = datetime.utcnow()
                final_db.commit()
                _add_project_log(
                    final_db, project_id,
                    f"Migração concluída. Completadas: {completed}, Falhas: {failed}.",
                    level="info" if failed == 0 else "warning",
                )
                # Notificações de conclusão
                _notify_migration_completed(final_db, project, completed, failed)
        finally:
            final_db.close()

    except Exception as exc:
        logger.exception(f"[Migration] Erro fatal no projeto {project_id}: {exc}")
        if db:
            try:
                project = _refresh_project(db, project_id)
                if project:
                    project.status = "failed"
                    db.commit()
                    _add_project_log(db, project_id, f"Erro fatal: {exc}", "error")
            except Exception:
                pass
    finally:
        if db:
            db.close()
