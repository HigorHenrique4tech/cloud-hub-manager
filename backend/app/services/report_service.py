"""
Executive Report Service — generates monthly PDF reports and sends them by email.

PDF is built with reportlab (pure Python, no native dependencies).
Email is sent via smtplib using SMTP_* settings from config.

The PDF contains:
  1. Header: workspace name + period
  2. Bar chart: cost history last 3 months
  3. Cost summary per provider (if include_costs)
  4. Top anomalies (if include_anomalies)
  5. Top recommendations by saving potential (if include_recommendations)
  6. Schedule activity summary (if include_schedules)
  7. Connected cloud accounts inventory
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


# ── Default settings object (module-level so it can be reused) ────────────────

class _DefaultSettings:
    include_costs = True
    include_anomalies = True
    include_recommendations = True
    include_schedules = True


# ── Data collection ───────────────────────────────────────────────────────────


def _collect_summary_data(db: Session, workspace_id: UUID, period: str, report_settings) -> dict:
    """
    Collect data from all sources for the given period (YYYY-MM).
    Returns a dict that will be stored in executive_reports.summary_data.
    """
    from app.models.db_models import (
        FinOpsAnomaly, FinOpsRecommendation, FinOpsBudget, ScheduledAction,
        Workspace, CloudAccount, ExecutiveReport,
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

        # Delta vs previous month
        prev_month = month - 1 if month > 1 else 12
        prev_year = year if month > 1 else year - 1
        prev_period = f"{prev_year}-{prev_month:02d}"

        prev_report = (
            db.query(ExecutiveReport)
            .filter(
                ExecutiveReport.workspace_id == workspace_id,
                ExecutiveReport.period == prev_period,
                ExecutiveReport.status == "ready",
            )
            .first()
        )
        prev_spend = 0.0
        if prev_report and prev_report.summary_data:
            prev_spend = (prev_report.summary_data.get("costs") or {}).get("total_spend", 0.0)

        delta_pct = None
        if prev_spend > 0:
            delta_pct = round((total_spend - prev_spend) / prev_spend * 100, 1)

        # Cost history — last 3 months from existing reports
        history = []
        for i in range(3, 0, -1):
            hy = year if month - i > 0 else year - 1
            hm = (month - i) if month - i > 0 else (month - i + 12)
            hp = f"{hy}-{hm:02d}"
            hr = (
                db.query(ExecutiveReport)
                .filter(
                    ExecutiveReport.workspace_id == workspace_id,
                    ExecutiveReport.period == hp,
                    ExecutiveReport.status == "ready",
                )
                .first()
            )
            h_spend = 0.0
            if hr and hr.summary_data:
                h_spend = (hr.summary_data.get("costs") or {}).get("total_spend", 0.0)
            history.append({"period": hp, "spend": round(h_spend, 2)})
        history.append({"period": period, "spend": round(total_spend, 2)})

        data["costs"] = {
            "summary": cost_summary,
            "total_spend": round(total_spend, 2),
            "prev_period": prev_period,
            "prev_spend": round(prev_spend, 2),
            "delta_pct": delta_pct,
            "history": history,
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
        all_pending = db.query(FinOpsRecommendation).filter(
            FinOpsRecommendation.workspace_id == workspace_id,
            FinOpsRecommendation.status == "pending",
        ).all()
        potential_saving = sum(r.estimated_saving_monthly for r in all_pending)

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

    # ── Inventory (cloud accounts per provider) ───────────────────────────────
    accounts = db.query(CloudAccount).filter(
        CloudAccount.workspace_id == workspace_id,
        CloudAccount.is_active == True,
    ).all()
    inventory = {}
    for acc in accounts:
        prov = acc.provider.lower()
        inventory[prov] = inventory.get(prov, 0) + 1
    data["inventory"] = inventory

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
        from reportlab.graphics.shapes import Drawing, Rect, String
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
    body_style = ParagraphStyle(
        "Body", parent=styles["Normal"], fontSize=10,
    )
    meta_style = ParagraphStyle(
        "meta", parent=body_style, textColor=GRAY, fontSize=9,
    )
    footer_style = ParagraphStyle(
        "footer", parent=body_style, textColor=GRAY, fontSize=8, alignment=1,
    )

    period = data.get("period", "")
    workspace_name = data.get("workspace_name", "Workspace")

    # ── Header ────────────────────────────────────────────────────────────────
    story.append(Paragraph("Relatório Executivo", title_style))
    story.append(Paragraph(f"{workspace_name} — {period}", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=12))
    story.append(Paragraph(
        f"Gerado em {datetime.utcnow().strftime('%d/%m/%Y às %H:%M')} UTC",
        meta_style,
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

        # Delta vs previous month
        delta_pct = costs.get("delta_pct")
        if delta_pct is not None:
            prev_p = costs.get("prev_period", "mês anterior")
            prev_s = costs.get("prev_spend", 0)
            if delta_pct > 0:
                delta_html = f'<font color="red"><b>▲ {abs(delta_pct):.1f}%</b></font>'
            else:
                delta_html = f'<font color="green"><b>▼ {abs(delta_pct):.1f}%</b></font>'
            story.append(Paragraph(
                f"Variação vs {prev_p}: {delta_html} (US$ {prev_s:,.2f})",
                body_style,
            ))
        story.append(Spacer(1, 0.2 * cm))

        # Bar chart — cost history
        history = costs.get("history", [])
        if len(history) >= 2 and any(h["spend"] > 0 for h in history):
            dw, dh = 460, 140
            drawing = Drawing(dw, dh)
            max_spend = max(h["spend"] for h in history) or 1
            n = len(history)
            bar_w = 50
            gap = (dw - n * bar_w) / (n + 1)
            base_y = 28

            for i, h in enumerate(history):
                bar_h = max(2, int((h["spend"] / max_spend) * (dh - base_y - 18)))
                x = gap + i * (bar_w + gap)
                fill = colors.HexColor("#2563EB") if i < n - 1 else colors.HexColor("#1D4ED8")
                drawing.add(Rect(x, base_y, bar_w, bar_h,
                                 fillColor=fill, strokeColor=None))
                # period label
                drawing.add(String(x + bar_w / 2, 8,
                                   h["period"][5:] + "/" + h["period"][:4],
                                   fontName="Helvetica", fontSize=7,
                                   fillColor=colors.HexColor("#6B7280"),
                                   textAnchor="middle"))
                # value above bar
                if h["spend"] > 0:
                    drawing.add(String(x + bar_w / 2, base_y + bar_h + 3,
                                       f"${h['spend']:,.0f}",
                                       fontName="Helvetica-Bold", fontSize=7,
                                       fillColor=colors.HexColor("#1D4ED8"),
                                       textAnchor="middle"))

            story.append(Paragraph("Evolução de Custos", ParagraphStyle(
                "ChartTitle", parent=body_style, fontSize=9, textColor=GRAY,
            )))
            story.append(drawing)
            story.append(Spacer(1, 0.3 * cm))

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

    # ── Inventory ─────────────────────────────────────────────────────────────
    inventory = data.get("inventory")
    if inventory:
        story.append(Paragraph("Contas Cloud Conectadas", section_style))
        inv_rows = [["Provedor", "Contas Ativas"]]
        provider_labels = {
            "aws": "Amazon Web Services",
            "azure": "Microsoft Azure",
            "gcp": "Google Cloud Platform",
            "m365": "Microsoft 365",
        }
        for prov, count in sorted(inventory.items()):
            inv_rows.append([provider_labels.get(prov, prov.upper()), str(count)])

        t = Table(inv_rows, colWidths=[9 * cm, 5 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
            ("ALIGN", (1, 0), (1, -1), "CENTER"),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.8 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY))
    story.append(Paragraph(
        "Relatório gerado automaticamente pelo Cloud Hub Manager.",
        footer_style,
    ))

    doc.build(story)
    return buf.getvalue()


# ── Email HTML ─────────────────────────────────────────────────────────────────


def _build_rich_email_html(workspace_name: str, period: str, summary_data: dict) -> str:
    """Build a rich HTML email body with inline KPIs and anomaly table."""
    costs = summary_data.get("costs", {})
    total_spend = costs.get("total_spend", 0)
    delta_pct = costs.get("delta_pct")
    anomalies = summary_data.get("anomalies", [])
    recs = summary_data.get("recommendations", {})
    potential_saving = recs.get("total_potential_saving", 0)
    sched = summary_data.get("schedules", {})
    inventory = summary_data.get("inventory", {})

    # Delta badge
    if delta_pct is not None:
        arrow = "▲" if delta_pct > 0 else "▼"
        delta_color = "#EF4444" if delta_pct > 0 else "#10B981"
        delta_badge = (
            f'<span style="font-size:11px;color:{delta_color};font-weight:600;">'
            f'{arrow} {abs(delta_pct):.1f}% vs mês anterior</span>'
        )
    else:
        delta_badge = ""

    # Anomaly rows
    anomaly_rows = ""
    for i, a in enumerate(anomalies[:3]):
        bg = "#F9FAFB" if i % 2 else "#FFFFFF"
        anomaly_rows += (
            f"<tr style='background:{bg};'>"
            f"<td style='padding:8px 12px;border:1px solid #E5E7EB;font-size:13px;'>{a['provider'].upper()}</td>"
            f"<td style='padding:8px 12px;border:1px solid #E5E7EB;font-size:13px;'>{a['service']}</td>"
            f"<td style='padding:8px 12px;border:1px solid #E5E7EB;font-size:13px;color:#EF4444;font-weight:600;'>+{a['deviation_pct']}%</td>"
            f"</tr>"
        )
    if not anomaly_rows:
        anomaly_rows = (
            "<tr><td colspan='3' style='padding:12px;color:#9CA3AF;text-align:center;"
            "font-size:13px;'>Nenhuma anomalia detectada no período</td></tr>"
        )

    # Inventory pills
    provider_labels = {"aws": "AWS", "azure": "Azure", "gcp": "GCP", "m365": "M365"}
    inv_pills = " ".join(
        f'<span style="display:inline-block;background:#EFF6FF;color:#1D4ED8;'
        f'border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600;margin-right:6px;">'
        f'{provider_labels.get(p, p.upper())} {c}</span>'
        for p, c in sorted(inventory.items())
    ) if inventory else ""

    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             color:#374151;background:#F3F4F6;margin:0;padding:0;">
<div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;
            overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12);">

  <!-- Header -->
  <div style="background:#2563EB;padding:28px 32px;">
    <h1 style="margin:0 0 4px;font-size:22px;color:#fff;font-weight:700;">
      Relat&oacute;rio Executivo
    </h1>
    <p style="margin:0;font-size:14px;color:#BFDBFE;">
      {workspace_name} &mdash; {period}
    </p>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px;">
    <p style="font-size:14px;color:#6B7280;margin:0 0 24px;">
      Resumo do per&iacute;odo <strong>{period}</strong> para o workspace <strong>{workspace_name}</strong>.
    </p>

    <!-- KPI Cards -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td width="33%" style="padding-right:8px;">
          <div style="background:#EFF6FF;border-radius:10px;padding:18px;text-align:center;">
            <p style="margin:0 0 4px;font-size:10px;color:#6B7280;text-transform:uppercase;
                      letter-spacing:.06em;">Gasto Total</p>
            <p style="margin:0;font-size:24px;font-weight:700;color:#1D4ED8;">
              ${total_spend:,.2f}
            </p>
            <p style="margin:4px 0 0;font-size:11px;">{delta_badge}</p>
          </div>
        </td>
        <td width="33%" style="padding:0 4px;">
          <div style="background:#FEF3C7;border-radius:10px;padding:18px;text-align:center;">
            <p style="margin:0 0 4px;font-size:10px;color:#6B7280;text-transform:uppercase;
                      letter-spacing:.06em;">Anomalias</p>
            <p style="margin:0;font-size:24px;font-weight:700;color:#D97706;">
              {len(anomalies)}
            </p>
            <p style="margin:4px 0 0;font-size:11px;color:#92400E;">no per&iacute;odo</p>
          </div>
        </td>
        <td width="33%" style="padding-left:8px;">
          <div style="background:#D1FAE5;border-radius:10px;padding:18px;text-align:center;">
            <p style="margin:0 0 4px;font-size:10px;color:#6B7280;text-transform:uppercase;
                      letter-spacing:.06em;">Economia Potencial</p>
            <p style="margin:0;font-size:24px;font-weight:700;color:#059669;">
              ${potential_saving:,.2f}
            </p>
            <p style="margin:4px 0 0;font-size:11px;color:#065F46;">/m&ecirc;s</p>
          </div>
        </td>
      </tr>
    </table>

    <!-- Anomalies -->
    <h3 style="font-size:14px;font-weight:600;color:#111827;margin:0 0 10px;">
      Principais Anomalias
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;border:1px solid #E5E7EB;
                  border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background:#F3F4F6;">
          <th style="padding:8px 12px;border:1px solid #E5E7EB;font-size:12px;
                     text-align:left;color:#374151;">Provedor</th>
          <th style="padding:8px 12px;border:1px solid #E5E7EB;font-size:12px;
                     text-align:left;color:#374151;">Servi&ccedil;o</th>
          <th style="padding:8px 12px;border:1px solid #E5E7EB;font-size:12px;
                     text-align:left;color:#374151;">Desvio</th>
        </tr>
      </thead>
      <tbody>{anomaly_rows}</tbody>
    </table>

    <!-- Schedules + Inventory -->
    <div style="background:#F9FAFB;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:13px;color:#374151;">
        <strong>Agendamentos ativos:</strong>
        {sched.get('active_count', 0)}
        &nbsp;(AWS: {sched.get('by_provider', {}).get('aws', 0)},
        Azure: {sched.get('by_provider', {}).get('azure', 0)},
        GCP: {sched.get('by_provider', {}).get('gcp', 0)})
      </p>
      {f'<p style="margin:0;font-size:13px;color:#374151;"><strong>Contas conectadas:</strong> {inv_pills}</p>' if inv_pills else ""}
    </div>

    <p style="font-size:13px;color:#6B7280;margin:0 0 24px;">
      O PDF completo com todas as se&ccedil;&otilde;es est&aacute; em anexo.
    </p>

    <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 16px;">
    <p style="font-size:11px;color:#9CA3AF;margin:0;">
      E-mail gerado automaticamente pelo Cloud Hub Manager.<br>
      Para alterar as configura&ccedil;&otilde;es de envio, acesse as configura&ccedil;&otilde;es do workspace.
    </p>
  </div>
</div>
</body>
</html>
"""


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
        # Port 465 uses implicit SSL; all other ports use STARTTLS
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM, recipients, msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM, recipients, msg.as_string())

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
    ).first() or _DefaultSettings()

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


def retry_report(db: Session, report_id: UUID):
    """Re-run generation for an existing failed report (same period, same record)."""
    from app.models.db_models import ExecutiveReport, ExecutiveReportSettings

    report = db.query(ExecutiveReport).filter(ExecutiveReport.id == report_id).first()
    if not report:
        return

    workspace_id = report.workspace_id
    period = report.period

    report_settings = db.query(ExecutiveReportSettings).filter(
        ExecutiveReportSettings.workspace_id == workspace_id,
    ).first() or _DefaultSettings()

    try:
        summary_data = _collect_summary_data(db, workspace_id, period, report_settings)
        pdf_bytes = _generate_pdf(summary_data, report_settings)

        report.status = "ready"
        report.pdf_bytes = base64.b64encode(pdf_bytes).decode("ascii")
        report.summary_data = summary_data
        report.generated_at = datetime.utcnow()
        report.error = None
        db.commit()
        logger.info("Executive report retried OK for workspace %s period %s", workspace_id, period)

    except Exception as exc:
        logger.exception("Retry failed for report %s: %s", report_id, exc)
        report.status = "failed"
        report.error = str(exc)[:500]
        db.commit()


def send_report(db: Session, report_id: UUID, recipients: List[str]):
    """Send an already-generated report by email."""
    from app.models.db_models import ExecutiveReport

    report = db.query(ExecutiveReport).filter(ExecutiveReport.id == report_id).first()
    if not report or report.status != "ready":
        raise ValueError("Relatório não encontrado ou ainda não gerado.")

    pdf_bytes = base64.b64decode(report.pdf_bytes)
    workspace_name = (report.summary_data or {}).get("workspace_name", "Workspace")

    subject = f"Relatório Executivo — {workspace_name} — {report.period}"
    body_html = _build_rich_email_html(workspace_name, report.period, report.summary_data or {})

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
