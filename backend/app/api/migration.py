"""Migration365 API — project and mailbox management."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.services import migration_service as svc
from app.services.plan_service import (
    check_migration_access, get_migration_license_summary,
    consume_migration_license,
)

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/migration",
    tags=["Migration365"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = None
    migration_type: str   # google_workspace | exchange_onprem | tenant_to_tenant | imap
    source_config: dict   # credentials / connection info for source
    destination_config: dict


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    source_config: Optional[dict] = None
    destination_config: Optional[dict] = None


class BulkAddMailboxesRequest(BaseModel):
    mailboxes: list[dict]  # [{source_email, destination_email?, display_name?}]


class SetStatusRequest(BaseModel):
    status: str   # draft | ready | running | paused | completed | failed


class ScheduleRequest(BaseModel):
    scheduled_at: str  # ISO 8601 datetime string


# ── License purchase schemas ─────────────────────────────────────────────────

class PurchaseLicensesRequest(BaseModel):
    quantity: int   # number of licenses to purchase
    notes: Optional[str] = None


# ── Migration access helper ──────────────────────────────────────────────────

def _require_migration_plan(db: Session, org_id):
    """Raise 403 if the org cannot use Migration365."""
    allowed, remaining, message = check_migration_access(db, org_id)
    if not allowed:
        raise HTTPException(status_code=403, detail=message)
    return allowed, remaining, message


# ── License info ─────────────────────────────────────────────────────────────

@ws_router.get("/license-summary")
async def license_summary(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return migration license summary for the current org."""
    return get_migration_license_summary(db, member.organization_id)


@ws_router.post("/licenses/request", status_code=201)
async def request_licenses(
    body: PurchaseLicensesRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Request migration licenses (Enterprise only). Requires admin approval."""
    from app.models.db_models import Organization, MigrationLicense
    from app.services.plan_service import get_effective_plan, PLAN_HIERARCHY, PLAN_PRICES

    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")

    effective = get_effective_plan(org)

    if effective == "enterprise_migration":
        raise HTTPException(status_code=400,
                            detail="Seu plano já inclui migrações ilimitadas. Não é necessário solicitar licenças.")

    if PLAN_HIERARCHY.get(effective, 0) < PLAN_HIERARCHY["enterprise"]:
        raise HTTPException(status_code=403,
                            detail="Licenças Migration365 requerem plano Enterprise ou superior.")

    if body.quantity < 1 or body.quantity > 10000:
        raise HTTPException(status_code=400, detail="Quantidade deve ser entre 1 e 10.000.")

    unit_price = PLAN_PRICES.get("migration_license_unit", 7000)
    total = unit_price * body.quantity

    import uuid
    license_record = MigrationLicense(
        id=uuid.uuid4(),
        organization_id=member.organization_id,
        purchased_by=member.user.id,
        status="pending",
        licenses_purchased=body.quantity,
        licenses_used=0,
        amount_cents=total,
        unit_price_cents=unit_price,
        is_active=False,
        notes=body.notes,
    )
    db.add(license_record)
    db.commit()
    db.refresh(license_record)

    return {
        "id": str(license_record.id),
        "status": license_record.status,
        "licenses_purchased": license_record.licenses_purchased,
        "unit_price_cents": license_record.unit_price_cents,
        "amount_cents": license_record.amount_cents,
        "notes": license_record.notes,
        "created_at": license_record.created_at.isoformat() if license_record.created_at else None,
    }


@ws_router.get("/licenses/history")
async def license_history(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Return all license purchase records for the current org."""
    from app.models.db_models import MigrationLicense

    records = (
        db.query(MigrationLicense)
        .filter(MigrationLicense.organization_id == member.organization_id)
        .order_by(MigrationLicense.created_at.desc())
        .all()
    )
    return {
        "licenses": [
            {
                "id": str(r.id),
                "status": r.status,
                "licenses_purchased": r.licenses_purchased,
                "licenses_used": r.licenses_used,
                "licenses_remaining": r.licenses_purchased - r.licenses_used if r.status == "approved" else 0,
                "unit_price_cents": r.unit_price_cents,
                "amount_cents": r.amount_cents,
                "is_active": r.is_active,
                "notes": r.notes,
                "admin_notes": r.admin_notes,
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ]
    }


# ── Projects ──────────────────────────────────────────────────────────────────

@ws_router.get("/projects")
async def list_projects(
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    return svc.list_projects(db, str(member.workspace_id))


@ws_router.post("/projects", status_code=201)
async def create_project(
    body: CreateProjectRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    _require_migration_plan(db, member.organization_id)
    return svc.create_project(
        db,
        workspace_id=str(member.workspace_id),
        user_id=str(member.user_id),
        name=body.name,
        description=body.description,
        migration_type=body.migration_type,
        source_config=body.source_config,
        destination_config=body.destination_config,
    )


@ws_router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project


@ws_router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    body: UpdateProjectRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    project = svc.update_project(
        db, str(member.workspace_id), project_id,
        **{k: v for k, v in body.dict().items() if v is not None}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project


@ws_router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    if not svc.delete_project(db, str(member.workspace_id), project_id):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")


@ws_router.post("/projects/{project_id}/status")
async def set_project_status(
    project_id: str,
    body: SetStatusRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    valid = {"draft", "ready", "running", "paused", "completed", "failed"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {', '.join(valid)}")

    # Ao iniciar migração, verificar acesso e consumir licenças
    if body.status == "running":
        allowed, remaining, msg = _require_migration_plan(db, member.organization_id)
        # Consumir licenças (para plano enterprise com licenças avulsas)
        project_data = svc.get_project(db, str(member.workspace_id), project_id)
        if project_data:
            pending_count = project_data.get("mailbox_count", 0) - project_data.get("completed_count", 0) - project_data.get("failed_count", 0)
            if pending_count > 0 and remaining is not None:
                if not consume_migration_license(db, member.organization_id, pending_count):
                    raise HTTPException(
                        status_code=403,
                        detail=f"Licenças insuficientes. Necessário: {pending_count}, disponível: {remaining}. Compre mais licenças."
                    )

    project = svc.set_project_status(db, str(member.workspace_id), project_id, body.status)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    # Dispara o worker Celery ao iniciar migração
    if body.status == "running":
        _dispatch_migration_worker(project_id)

    return project


@ws_router.get("/projects/{project_id}/stats")
async def get_project_stats(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Retorna métricas detalhadas do projeto incluindo contagens por fase."""
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return svc.get_project_stats(db, str(member.workspace_id), project_id)


# ── Mailboxes ─────────────────────────────────────────────────────────────────

@ws_router.get("/projects/{project_id}/mailboxes")
async def list_mailboxes(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    return svc.list_mailboxes(db, str(member.workspace_id), project_id)


@ws_router.post("/projects/{project_id}/mailboxes")
async def add_mailboxes(
    project_id: str,
    body: BulkAddMailboxesRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    return svc.bulk_add_mailboxes(
        db, str(member.workspace_id), project_id, body.mailboxes
    )


@ws_router.post("/projects/{project_id}/mailboxes/import-csv")
async def import_csv_preview(
    project_id: str,
    file: UploadFile = File(...),
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """
    Faz parse do CSV enviado e retorna preview sem persistir nada.
    Colunas aceitas (case-insensitive): source_email, destination_email, display_name.
    Primeira coluna é sempre tratada como source_email se o header não for reconhecido.
    """
    import csv, io

    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # remove BOM se presente
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    # Normaliza headers
    if reader.fieldnames:
        reader.fieldnames = [f.strip().lower().replace(" ", "_") for f in reader.fieldnames]

    valid, invalid = [], []
    EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    import re

    # Para migrações de arquivo, não exigir formato de e-mail
    is_file_migration = project.get("migration_type", "") in (
        "onedrive_to_onedrive", "sharepoint_to_sharepoint", "teams_chat",
    )

    for i, row in enumerate(reader, start=2):  # linha 1 = header
        # Tenta encontrar source_email por nome ou primeira coluna
        src = (row.get("source_email") or row.get("email") or
               row.get("origem") or next(iter(row.values()), "")).strip()
        if not is_file_migration:
            src = src.lower()
        dst = (row.get("destination_email") or row.get("destino") or "").strip() or None
        if dst and not is_file_migration:
            dst = dst.lower()
        name = (row.get("display_name") or row.get("nome") or row.get("name") or "").strip() or None

        if not src:
            invalid.append({"line": i, "reason": "identificador vazio"})
            continue
        if not is_file_migration and not re.match(EMAIL_RE, src):
            invalid.append({"line": i, "value": src, "reason": "e-mail inválido"})
            continue

        valid.append({"source_email": src, "destination_email": dst, "display_name": name})

    return {
        "valid": valid,
        "invalid": invalid,
        "total_rows": len(valid) + len(invalid),
    }


@ws_router.delete("/projects/{project_id}/mailboxes/{mailbox_id}", status_code=204)
async def delete_mailbox(
    project_id: str,
    mailbox_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    if not svc.delete_mailbox(db, str(member.workspace_id), project_id, mailbox_id):
        raise HTTPException(status_code=404, detail="Caixa de correio não encontrada.")


@ws_router.post("/projects/{project_id}/mailboxes/{mailbox_id}/pause")
async def pause_mailbox(
    project_id: str,
    mailbox_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Pausa uma caixa individual em execução."""
    mb = svc.pause_mailbox(db, str(member.workspace_id), project_id, mailbox_id)
    if not mb:
        raise HTTPException(status_code=404, detail="Caixa não encontrada ou não está em execução.")
    return mb


@ws_router.post("/projects/{project_id}/mailboxes/{mailbox_id}/retry")
async def retry_mailbox(
    project_id: str,
    mailbox_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Reseta uma caixa individual (failed/paused) para pending e redispara o worker se necessário."""
    mb = svc.retry_mailbox(db, str(member.workspace_id), project_id, mailbox_id)
    if not mb:
        raise HTTPException(status_code=404, detail="Caixa não encontrada ou não está em estado de falha/pausa.")

    # Se projeto não está rodando, dispara worker para pegar a caixa resetada
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if project and project["status"] not in ("running",):
        svc.set_project_status(db, str(member.workspace_id), project_id, "running")
        _dispatch_migration_worker(project_id)

    return mb


@ws_router.get("/projects/{project_id}/mailboxes/{mailbox_id}/ledger")
async def get_mailbox_ledger(
    project_id: str,
    mailbox_id: str,
    limit: int = 200,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Retorna o ledger de mensagens de uma caixa — útil para auditoria."""
    return svc.get_mailbox_ledger(db, str(member.workspace_id), project_id, mailbox_id, limit=limit)


# ── Operações de execução ─────────────────────────────────────────────────────

@ws_router.post("/projects/{project_id}/verify")
async def verify_project(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """
    Dispara verificação pós-migração em todas as mailboxes completadas.
    A verificação é assíncrona — monitore via GET /mailboxes.
    """
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    if project["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=400,
                            detail="Verificação disponível apenas após migração completa.")
    _dispatch_migration_worker(project_id, verify_only=True)
    return {"message": "Verificação iniciada.", "project_id": project_id}


@ws_router.post("/projects/{project_id}/delta")
async def delta_sync_project(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Dispara delta sync para capturar emails novos desde a migração inicial."""
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    _dispatch_migration_worker(project_id, delta_only=True)
    return {"message": "Delta sync iniciado.", "project_id": project_id}


# ── Relatório exportável ──────────────────────────────────────────────────────

@ws_router.get("/projects/{project_id}/report")
async def export_report(
    project_id: str,
    format: str = "csv",   # csv | pdf
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    """Exporta relatório do projeto em CSV ou PDF."""
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    mailboxes = svc.list_mailboxes(db, str(member.workspace_id), project_id)
    logs_errors = svc.list_logs(db, str(member.workspace_id), project_id, limit=500)

    if format == "csv":
        import csv, io
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "source_email", "destination_email", "display_name",
            "status", "phase", "items_total", "items_migrated",
            "size_mb", "verify_ok", "error_message",
            "started_at", "completed_at",
        ])
        for mb in mailboxes:
            verify_ok = (
                mb.get("verify_result", {}) or {}
            ).get("ok", "") if mb.get("verify_result") else ""
            writer.writerow([
                mb.get("source_email", ""),
                mb.get("destination_email", "") or "",
                mb.get("display_name", "") or "",
                mb.get("status", ""),
                mb.get("phase", "") or "",
                mb.get("items_total", "") or "",
                mb.get("items_migrated", ""),
                mb.get("size_mb", "") or "",
                verify_ok,
                mb.get("error_message", "") or "",
                mb.get("started_at", "") or "",
                mb.get("completed_at", "") or "",
            ])
        buf.seek(0)
        filename = f"migration_{project_id[:8]}.csv"
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    elif format == "pdf":
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.lib.units import cm
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            import io as _io

            buf = _io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=A4,
                                    leftMargin=2*cm, rightMargin=2*cm,
                                    topMargin=2*cm, bottomMargin=2*cm)
            styles = getSampleStyleSheet()
            story = []

            # Título
            title_style = ParagraphStyle("title", parent=styles["Heading1"],
                                         fontSize=16, textColor=colors.HexColor("#1e3a5f"))
            story.append(Paragraph(f"Relatório de Migração", title_style))
            story.append(Paragraph(project["name"], styles["Heading2"]))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))
            story.append(Spacer(1, 0.3*cm))

            # Resumo
            from datetime import datetime as _dt
            now_str = _dt.utcnow().strftime("%d/%m/%Y %H:%M UTC")
            summary_data = [
                ["Tipo", project.get("migration_type", ""), "Gerado em", now_str],
                ["Status", project.get("status", ""), "Origem", project.get("source_label", "") or "—"],
                ["Total de caixas", str(project.get("mailbox_count", 0)),
                 "Concluídas", str(project.get("completed_count", 0))],
                ["Com falha", str(project.get("failed_count", 0)),
                 "Verificadas", str(project.get("verified_count", 0))],
            ]
            summary_table = Table(summary_data, colWidths=[4*cm, 5.5*cm, 4*cm, 5.5*cm])
            summary_table.setStyle(TableStyle([
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
                ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#64748b")),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.append(summary_table)
            story.append(Spacer(1, 0.5*cm))

            # Tabela de caixas
            story.append(Paragraph("Caixas de Correio", styles["Heading3"]))
            story.append(Spacer(1, 0.2*cm))

            STATUS_PT = {
                "completed": "Concluído", "failed": "Falha",
                "pending": "Aguardando", "running": "Em execução",
                "paused": "Pausado", "skipped": "Ignorado",
            }
            mb_headers = ["Origem", "Destino", "Status", "Progresso", "Verificado", "Erro"]
            mb_rows = [mb_headers]
            for mb in mailboxes:
                progress_str = f"{mb.get('items_migrated', 0)}/{mb.get('items_total', 0) or '?'}"
                verify_str = "✓" if (mb.get("verify_result") or {}).get("ok") else ("✗" if mb.get("verify_result") else "—")
                error_str = (mb.get("error_message") or "")[:40]
                mb_rows.append([
                    mb.get("source_email", "")[:30],
                    (mb.get("destination_email") or "—")[:30],
                    STATUS_PT.get(mb.get("status", ""), mb.get("status", "")),
                    progress_str,
                    verify_str,
                    error_str,
                ])

            mb_table = Table(mb_rows, colWidths=[4.5*cm, 4.5*cm, 2.5*cm, 2.5*cm, 2*cm, 3*cm])
            mb_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(mb_table)

            doc.build(story)
            buf.seek(0)
            filename = f"migration_{project_id[:8]}.pdf"
            return StreamingResponse(
                buf,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )
        except ImportError:
            raise HTTPException(status_code=500, detail="reportlab não instalado.")
    else:
        raise HTTPException(status_code=400, detail="Formato inválido. Use 'csv' ou 'pdf'.")


# ── Logs ──────────────────────────────────────────────────────────────────────

@ws_router.get("/projects/{project_id}/logs")
async def list_logs(
    project_id: str,
    limit: int = 100,
    member: MemberContext = Depends(require_permission("m365.view")),
    db: Session = Depends(get_db),
):
    return svc.list_logs(db, str(member.workspace_id), project_id, limit=limit)


# ── Agendamento ──────────────────────────────────────────────────────────────

@ws_router.post("/projects/{project_id}/schedule")
async def schedule_project(
    project_id: str,
    body: ScheduleRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Agenda o início automático da migração para uma data/hora futura."""
    from datetime import datetime, timezone
    try:
        scheduled_at = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
        scheduled_at_utc = scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(status_code=400, detail="scheduled_at inválido. Use formato ISO 8601.")

    if scheduled_at_utc <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="scheduled_at deve ser uma data/hora futura.")

    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    if project["status"] not in ("draft", "ready", "paused"):
        raise HTTPException(status_code=400, detail="Projeto não pode ser agendado no status atual.")

    # Persiste scheduled_at no projeto
    updated = svc.update_project(db, str(member.workspace_id), project_id,
                                  scheduled_at=scheduled_at_utc)

    # Cria job APScheduler
    try:
        from apscheduler.triggers.date import DateTrigger
        from app.services.scheduler_service import scheduler

        def _run_scheduled_migration():
            _dispatch_migration_worker(project_id)
            notify_db = None
            try:
                from app.database import SessionLocal as _SL
                notify_db = _SL()
                svc.set_project_status(notify_db, str(member.workspace_id), project_id, "running")
            except Exception:
                pass
            finally:
                if notify_db:
                    notify_db.close()

        scheduler.add_job(
            _run_scheduled_migration,
            trigger=DateTrigger(run_date=scheduled_at_utc),
            id=f"migration-schedule-{project_id}",
            replace_existing=True,
        )
    except Exception as exc:
        logger.warning(f"APScheduler não disponível para agendamento: {exc}")

    return updated


@ws_router.delete("/projects/{project_id}/schedule", status_code=204)
async def cancel_schedule(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Cancela o agendamento de início automático."""
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    svc.update_project(db, str(member.workspace_id), project_id, scheduled_at=None)

    try:
        from app.services.scheduler_service import scheduler
        scheduler.remove_job(f"migration-schedule-{project_id}")
    except Exception:
        pass  # job pode já não existir


# ── Worker health & test connection ──────────────────────────────────────────

@ws_router.get("/worker-health")
async def worker_health(
    member: MemberContext = Depends(require_permission("m365.view")),
):
    """
    Verifica se Redis e o worker Celery de migração estão acessíveis.
    Retorna em até ~2s (timeout interno do inspect).
    """
    import redis as redis_lib
    from app.core.config import settings

    # 1. Redis
    redis_status = "unreachable"
    try:
        r = redis_lib.from_url(settings.REDIS_URL,
                               socket_connect_timeout=2, socket_timeout=2)
        r.ping()
        redis_status = "ok"
    except Exception:
        pass

    # 2. Celery worker
    worker_status = "unknown"
    queued_tasks = 0
    debug_info = {}
    if redis_status == "ok":
        try:
            from app.workers.celery_app import celery_app

            # inspect.ping() — broadcast para todos os workers
            try:
                insp = celery_app.control.inspect(timeout=5)
                ping_result = insp.ping()
                debug_info["ping"] = str(ping_result)[:200] if ping_result else "empty"
                if ping_result:
                    worker_status = "ok"
                    try:
                        reserved = insp.reserved() or {}
                        queued_tasks = sum(len(v) for v in reserved.values())
                    except Exception:
                        pass
            except Exception as e:
                debug_info["ping_error"] = str(e)[:100]

            # Fallback: checar Redis keys diretamente
            if worker_status != "ok":
                try:
                    r = redis_lib.from_url(settings.REDIS_URL,
                                           socket_connect_timeout=2, socket_timeout=2)
                    # Listar todas as _kombu.binding.* keys para diagnóstico
                    all_bindings = {}
                    for key in r.scan_iter("_kombu.binding.*", count=100):
                        key_str = key.decode() if isinstance(key, bytes) else key
                        members = r.smembers(key)
                        all_bindings[key_str] = len(members)

                    debug_info["redis_bindings"] = all_bindings

                    if "_kombu.binding.migration" in all_bindings:
                        worker_status = "ok"
                    elif any("celery" in k for k in all_bindings):
                        worker_status = "ok"
                    else:
                        worker_status = "offline"
                except Exception as e:
                    debug_info["redis_fallback_error"] = str(e)[:100]
                    worker_status = "offline"

        except Exception as e:
            debug_info["celery_import_error"] = str(e)[:100]
            worker_status = "unknown"

    logger.info("worker-health: redis=%s worker=%s debug=%s",
                redis_status, worker_status, debug_info)

    return {
        "redis": redis_status,
        "worker": worker_status,
        "queued_tasks": queued_tasks,
        "debug": debug_info,
    }


class TestConnectionRequest(BaseModel):
    migration_type: str
    source_config: dict


@ws_router.post("/test-connection")
async def test_connection(
    body: TestConnectionRequest,
    member: MemberContext = Depends(require_permission("m365.manage")),
):
    """
    Testa a conexão com a origem sem persistir nada.
    As credenciais ficam apenas em memória durante o request.
    """
    try:
        from app.workers.engines import get_engine
        engine = get_engine(body.migration_type, body.source_config, {})
        result = engine.test_connection()
        return result
    except NotImplementedError:
        return {"ok": True, "message": "Tipo de conexão não requer teste prévio."}
    except Exception as exc:
        return {"ok": False, "message": str(exc)}


# ── Retry failed mailboxes ────────────────────────────────────────────────────

@ws_router.post("/projects/{project_id}/retry-failed")
async def retry_failed(
    project_id: str,
    member: MemberContext = Depends(require_permission("m365.manage")),
    db: Session = Depends(get_db),
):
    """Reseta mailboxes com status=failed → pending e redispara o worker."""
    project = svc.get_project(db, str(member.workspace_id), project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    if project["status"] == "running":
        raise HTTPException(status_code=400,
                            detail="Projeto já está em execução.")

    result = svc.retry_failed_mailboxes(db, str(member.workspace_id), project_id)
    if result.get("reset_count", 0) == 0:
        raise HTTPException(status_code=400,
                            detail="Nenhuma caixa com falha encontrada.")

    _dispatch_migration_worker(project_id)
    return result


# ── Helper: dispatch Celery ───────────────────────────────────────────────────

def _dispatch_migration_worker(project_id: str, verify_only: bool = False,
                                delta_only: bool = False):
    """
    Tenta despachar a task Celery.
    Se Redis não estiver disponível, registra warning mas não quebra a API.
    """
    try:
        from app.workers.migration_worker import run_migration_project
        run_migration_project.apply_async(
            args=[project_id],
            kwargs={"verify_only": verify_only, "delta_only": delta_only},
            queue="migration",
            task_id=f"migration-{project_id}",
        )
        logger.info(f"Migration task despachada para projeto {project_id}")
    except Exception as exc:
        logger.error(
            f"Falha ao despachar migration task para {project_id}: {exc}. "
            "Verifique se o Redis e o worker Celery estão rodando."
        )
