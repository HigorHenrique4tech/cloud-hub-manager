"""
Executive Report Service — generates monthly PDF reports and sends them by email.

PDF is built with reportlab (pure Python, no native dependencies).
Email is sent via smtplib using SMTP_* settings from config.

The PDF contains:
  1. Header: workspace name + period
  2. Cost summary per provider (if include_costs)
  3. Top anomalies (if include_anomalies)
  4. Top recommendations by saving potential (if include_recommendations)
  5. Schedule activity summary (if include_schedules)
"""
import base64
import io
import logging
import smtplib
import uuid
from datetime import datetime, timedelta
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Data collection ───────────────────────────────────────────────────────────


def _collect_summary_data(db: Session, workspace_id: UUID, period: str, report_settings) -> dict:
    """
    Collect data from all sources for the given period (YYYY-MM).
    Returns a dict that will be stored in executive_reports.summary_data.
    """
    from app.models.db_models import (
        FinOpsAnomaly, FinOpsRecommendation, FinOpsBudget, ScheduledAction,
        Workspace, CloudAccount,
    )

    year, month = map(int, period.split("-"))
    period_start = datetime(year, month, 1)
    period_end = (period_start.replace(day=28) + timedelta(days=4)).replace(day=1)

    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    workspace_name = workspace.name if workspace else str(workspace_id)

    data = {
        "workspace_name": workspace_name,
        "period": period,
        "generated_at": datetime.utcnow().isoformat(),
    }

    # ── Costs ────────────────────────────────────────────────────────────────
    if report_settings.include_costs:
        budgets = db.query(FinOpsBudget).filter(
            FinOpsBudget.workspace_id == workspace_id,
            FinOpsBudget.is_active == True,
        ).all()

        cost_summary = []
        total_spend = 0.0
        for b in budgets:
            spend = b.last_spend or 0.0
            total_spend += spend
            cost_summary.append({
                "provider": b.provider,
                "budget_name": b.name,
                "budget_amount": b.amount,
                "last_spend": round(spend, 2),
                "pct_used": round((spend / b.amount * 100) if b.amount > 0 else 0, 1),
            })

        data["costs"] = {
            "summary": cost_summary,
            "total_spend": round(total_spend, 2),
        }

    # ── Anomalies ─────────────────────────────────────────────────────────────
    if report_settings.include_anomalies:
        anomalies = (
            db.query(FinOpsAnomaly)
            .filter(
                FinOpsAnomaly.workspace_id == workspace_id,
                FinOpsAnomaly.detected_date >= period_start,
                FinOpsAnomaly.detected_date < period_end,
            )
            .order_by(FinOpsAnomaly.deviation_pct.desc())
            .limit(5)
            .all()
        )
        data["anomalies"] = [
            {
                "provider": a.provider,
                "service": a.service_name,
                "detected_date": a.detected_date.strftime("%d/%m/%Y") if a.detected_date else "",
                "baseline_cost": round(a.baseline_cost, 2),
                "actual_cost": round(a.actual_cost, 2),
                "deviation_pct": round(a.deviation_pct, 1),
                "status": a.status,
            }
            for a in anomalies
        ]

    # ── Recommendations ───────────────────────────────────────────────────────
    if report_settings.include_recommendations:
        recs = (
            db.query(FinOpsRecommendation)
            .filter(
                FinOpsRecommendation.workspace_id == workspace_id,
                FinOpsRecommendation.status == "pending",
            )
            .order_by(FinOpsRecommendation.estimated_saving_monthly.desc())
            .limit(5)
            .all()
        )
        total_potential = (
            db.query(FinOpsRecommendation)
            .filter(
                FinOpsRecommendation.workspace_id == workspace_id,
                FinOpsRecommendation.status == "pending",
            )
        )
        potential_saving = sum(r.estimated_saving_monthly for r in total_potential.all())

        data["recommendations"] = {
            "top": [
                {
                    "provider": r.provider,
                    "resource_name": r.resource_name,
                    "recommendation_type": r.recommendation_type,
                    "severity": r.severity,
                    "saving_monthly": round(r.estimated_saving_monthly, 2),
                    "reasoning": r.reasoning[:120] + "..." if len(r.reasoning) > 120 else r.reasoning,
                }
                for r in recs
            ],
            "total_potential_saving": round(potential_saving, 2),
        }

    # ── Schedules ─────────────────────────────────────────────────────────────
    if report_settings.include_schedules:
        schedules = db.query(ScheduledAction).filter(
            ScheduledAction.workspace_id == workspace_id,
            ScheduledAction.is_enabled == True,
        ).all()
        data["schedules"] = {
            "active_count": len(schedules),
            "by_provider": {
                "aws": sum(1 for s in schedules if s.provider == "aws"),
                "azure": sum(1 for s in schedules if s.provider == "azure"),
                "gcp": sum(1 for s in schedules if s.provider == "gcp"),
            },
        }

    return data


# ── PDF generation ────────────────────────────────────────────────────────────


def _generate_pdf(data: dict, report_settings) -> bytes:
    """Build a PDF from summary data using reportlab. Returns raw PDF bytes."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
        )
    except ImportError:
        raise RuntimeError(
            "reportlab não instalado. Adicione 'reportlab' ao requirements.txt e reinstale."
        )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    story = []

    BLUE = colors.HexColor("#2563EB")
    GRAY = colors.HexColor("#6B7280")
    LIGHT_GRAY = colors.HexColor("#F3F4F6")
    RED = colors.HexColor("#EF4444")
    GREEN = colors.HexColor("#10B981")
    YELLOW = colors.HexColor("#F59E0B")

    title_style = ParagraphStyle(
        "Title", parent=styles["Heading1"],
        fontSize=22, textColor=BLUE, spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"],
        fontSize=11, textColor=GRAY, spaceAfter=12,
    )
    section_style = ParagraphStyle(
        "Section", parent=styles["Heading2"],
        fontSize=13, textColor=BLUE, spaceBefore=16, spaceAfter=8,
    )
    body_style = styles["Normal"]
    body_style.fontSize = 10

    period = data.get("period", "")
    workspace_name = data.get("workspace_name", "Workspace")

    # ── Header ────────────────────────────────────────────────────────────────
    story.append(Paragraph("Relatório Executivo", title_style))
    story.append(Paragraph(f"{workspace_name} — {period}", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=12))
    story.append(Paragraph(
        f"Gerado em {datetime.utcnow().strftime('%d/%m/%Y às %H:%M')} UTC",
        ParagraphStyle("meta", parent=body_style, textColor=GRAY, fontSize=9),
    ))
    story.append(Spacer(1, 0.4 * cm))

    # ── Costs ────────────────────────────────────────────────────────────────
    costs = data.get("costs")
    if costs:
        story.append(Paragraph("Resumo de Custos", section_style))

        total_spend = costs.get("total_spend", 0)
        story.append(Paragraph(
            f"<b>Gasto total estimado no período: US$ {total_spend:,.2f}</b>",
            body_style,
        ))
        story.append(Spacer(1, 0.2 * cm))

        summary = costs.get("summary", [])
        if summary:
            table_data = [["Provedor", "Orçamento", "Limite (US$)", "Gasto (US$)", "% Usado"]]
            for row in summary:
                pct = row["pct_used"]
                pct_color = "green" if pct < 70 else ("orange" if pct < 90 else "red")
                table_data.append([
                    row["provider"].upper(),
                    row["budget_name"],
                    f"${row['budget_amount']:,.2f}",
                    f"${row['last_spend']:,.2f}",
                    Paragraph(f'<font color="{pct_color}"><b>{pct}%</b></font>', body_style),
                ])

            t = Table(table_data, colWidths=[3 * cm, 5 * cm, 3.5 * cm, 3.5 * cm, 3 * cm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)

    # ── Anomalies ─────────────────────────────────────────────────────────────
    anomalies = data.get("anomalies")
    if anomalies is not None:
        story.append(Paragraph("Anomalias Detectadas", section_style))
        if not anomalies:
            story.append(Paragraph("Nenhuma anomalia detectada no período.", body_style))
        else:
            table_data = [["Provedor", "Serviço", "Data", "Baseline", "Real", "Desvio"]]
            for a in anomalies:
                dev = a["deviation_pct"]
                dev_color = "red" if dev > 50 else ("orange" if dev > 20 else "green")
                table_data.append([
                    a["provider"].upper(),
                    a["service"],
                    a["detected_date"],
                    f"${a['baseline_cost']:,.2f}",
                    f"${a['actual_cost']:,.2f}",
                    Paragraph(f'<font color="{dev_color}"><b>+{dev}%</b></font>', body_style),
                ])
            t = Table(table_data, colWidths=[2.5 * cm, 5 * cm, 2.5 * cm, 3 * cm, 3 * cm, 3 * cm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)

    # ── Recommendations ───────────────────────────────────────────────────────
    recs_data = data.get("recommendations")
    if recs_data is not None:
        story.append(Paragraph("Oportunidades de Economia", section_style))
        potential = recs_data.get("total_potential_saving", 0)
        story.append(Paragraph(
            f"<b>Potencial de economia total: US$ {potential:,.2f}/mês</b>",
            body_style,
        ))
        story.append(Spacer(1, 0.2 * cm))

        top = recs_data.get("top", [])
        if not top:
            story.append(Paragraph("Nenhuma recomendação pendente.", body_style))
        else:
            table_data = [["Provedor", "Recurso", "Tipo", "Severidade", "Economia/mês"]]
            for r in top:
                sev = r["severity"]
                sev_color = "red" if sev == "high" else ("orange" if sev == "medium" else "green")
                table_data.append([
                    r["provider"].upper(),
                    r["resource_name"][:30],
                    r["recommendation_type"].replace("_", " ").title(),
                    Paragraph(f'<font color="{sev_color}"><b>{sev.title()}</b></font>', body_style),
                    f"${r['saving_monthly']:,.2f}",
                ])
            t = Table(table_data, colWidths=[2.5 * cm, 5.5 * cm, 4 * cm, 3 * cm, 3 * cm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
                ("ALIGN", (4, 0), (4, -1), "RIGHT"),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(t)

    # ── Schedules ─────────────────────────────────────────────────────────────
    sched = data.get("schedules")
    if sched is not None:
        story.append(Paragraph("Agendamentos Ativos", section_style))
        by_prov = sched.get("by_provider", {})
        story.append(Paragraph(
            f"Total de agendamentos ativos: <b>{sched.get('active_count', 0)}</b> "
            f"(AWS: {by_prov.get('aws', 0)}, Azure: {by_prov.get('azure', 0)}, "
            f"GCP: {by_prov.get('gcp', 0)})",
            body_style,
        ))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.8 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY))
    story.append(Paragraph(
        "Relatório gerado automaticamente pelo Cloud Hub Manager.",
        ParagraphStyle("footer", parent=body_style, textColor=GRAY, fontSize=8, alignment=1),
    ))

    doc.build(story)
    return buf.getvalue()


# ── Email sending ─────────────────────────────────────────────────────────────


def _send_email(recipients: List[str], subject: str, body_html: str, pdf_bytes: bytes, period: str):
    """Send PDF report via SMTP."""
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured — skipping email send.")
        return

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = ", ".join(recipients)

    msg.attach(MIMEText(body_html, "html", "utf-8"))

    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header(
        "Content-Disposition",
        "attachment",
        filename=f"relatorio-executivo-{period}.pdf",
    )
    msg.attach(attachment)

    try:
        if settings.SMTP_USE_TLS:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30)

        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

        server.sendmail(settings.SMTP_FROM, recipients, msg.as_string())
        server.quit()
        logger.info("Executive report sent to %s for period %s", recipients, period)
    except Exception as exc:
        logger.error("Failed to send executive report email: %s", exc)
        raise


# ── Main functions ────────────────────────────────────────────────────────────


def generate_report(db: Session, workspace_id: UUID, period: str) -> "ExecutiveReport":
    """
    Generate an ExecutiveReport for the given workspace and period.
    Creates a DB record, generates PDF, stores base64-encoded bytes.
    """
    from app.models.db_models import ExecutiveReport, ExecutiveReportSettings

    report_settings = db.query(ExecutiveReportSettings).filter(
        ExecutiveReportSettings.workspace_id == workspace_id,
    ).first()

    if not report_settings:
        # Use defaults
        class _DefaultSettings:
            include_costs = True
            include_anomalies = True
            include_recommendations = True
            include_schedules = True
        report_settings = _DefaultSettings()

    # Create report record
    report = ExecutiveReport(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        period=period,
        status="generating",
        created_at=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    try:
        summary_data = _collect_summary_data(db, workspace_id, period, report_settings)
        pdf_bytes = _generate_pdf(summary_data, report_settings)

        report.status = "ready"
        report.pdf_bytes = base64.b64encode(pdf_bytes).decode("ascii")
        report.summary_data = summary_data
        report.generated_at = datetime.utcnow()
        db.commit()
        logger.info("Executive report generated for workspace %s period %s", workspace_id, period)

    except Exception as exc:
        logger.exception("Failed to generate executive report: %s", exc)
        report.status = "failed"
        report.error = str(exc)[:500]
        db.commit()

    db.refresh(report)
    return report


def send_report(db: Session, report_id: UUID, recipients: List[str]):
    """Send an already-generated report by email."""
    from app.models.db_models import ExecutiveReport

    report = db.query(ExecutiveReport).filter(ExecutiveReport.id == report_id).first()
    if not report or report.status != "ready":
        raise ValueError("Relatório não encontrado ou ainda não gerado.")

    pdf_bytes = base64.b64decode(report.pdf_bytes)
    workspace_name = (report.summary_data or {}).get("workspace_name", "Workspace")

    subject = f"Relatório Executivo — {workspace_name} — {report.period}"
    body_html = f"""
    <html><body style="font-family: sans-serif; color: #374151;">
    <h2 style="color: #2563EB;">Relatório Executivo — {report.period}</h2>
    <p>Olá,</p>
    <p>Segue em anexo o relatório executivo mensal do workspace <strong>{workspace_name}</strong>
    referente ao período <strong>{report.period}</strong>.</p>
    <p>O relatório inclui resumo de custos, anomalias detectadas, oportunidades de economia
    e status dos agendamentos.</p>
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;">
    <p style="font-size: 12px; color: #9CA3AF;">
    Este e-mail foi gerado automaticamente pelo Cloud Hub Manager.<br>
    Para alterar as configurações de envio, acesse as configurações do workspace.
    </p>
    </body></html>
    """

    _send_email(recipients, subject, body_html, pdf_bytes, report.period)

    report.sent_at = datetime.utcnow()
    report.recipients = recipients
    db.commit()


# ── APScheduler job ───────────────────────────────────────────────────────────


def monthly_reports_job():
    """
    APScheduler entry point — runs on the 1st of each month at 08:00 UTC.
    Generates and sends executive reports for all enabled workspaces.
    """
    from app.database import SessionLocal
    from app.models.db_models import ExecutiveReportSettings

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        # Report is for the PREVIOUS month
        first_of_this_month = now.replace(day=1)
        last_month = first_of_this_month - timedelta(days=1)
        period = last_month.strftime("%Y-%m")

        settings_list = db.query(ExecutiveReportSettings).filter(
            ExecutiveReportSettings.is_enabled == True,
        ).all()

        logger.info("Monthly reports job: generating %d reports for period %s", len(settings_list), period)

        for rs in settings_list:
            if not rs.recipients:
                continue
            try:
                report = generate_report(db, rs.workspace_id, period)
                if report.status == "ready":
                    send_report(db, report.id, rs.recipients)
            except Exception as exc:
                logger.exception(
                    "Failed to generate/send report for workspace %s: %s", rs.workspace_id, exc
                )

    finally:
        db.close()
