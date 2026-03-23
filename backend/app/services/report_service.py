"""
Executive Report Service — generates monthly PDF reports and sends them by email.

PDF is built with reportlab (pure Python, no native dependencies).
Email is sent via smtplib using SMTP_* settings from config.

The PDF contains:
  1. Header (every page): logo + title on blue band
  2. KPI summary cards: Gasto Total, Anomalias, Economia Potencial
  3. Cost summary + bar chart (if include_costs)
  4. Top anomalies (if include_anomalies)
  5. Top recommendations by saving potential (if include_recommendations)
  6. Schedule activity summary (if include_schedules)
  7. Connected cloud accounts inventory
  8. Footer (every page): CloudAtlas branding + page number
"""
import base64
import io
import logging
import os
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
from app.services.branding_service import get_branding, DEFAULT_BRANDING

logger = logging.getLogger(__name__)

# ── Logo path ─────────────────────────────────────────────────────────────────
_LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.png")


def _load_logo() -> Optional[bytes]:
    """Load logo bytes from disk. Returns None if not found."""
    try:
        with open(_LOGO_PATH, "rb") as f:
            return f.read()
    except Exception:
        return None


def _load_org_logo(branding: dict = None) -> Optional[bytes]:
    """Load org logo from branding base64 or fall back to default."""
    if branding and branding.get("is_white_labeled"):
        # Try to fetch org's logo from DB via branding URL
        # For PDF, we need the base64 data directly, not the URL
        # The branding dict doesn't contain base64 directly, so fall back to default
        pass
    return _load_logo()


# ── Default settings object ───────────────────────────────────────────────────

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


def _generate_pdf(data: dict, report_settings, logo_bytes: Optional[bytes] = None, branding: dict = None) -> bytes:
    """Build a styled PDF from summary data using reportlab. Returns raw PDF bytes."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib.utils import ImageReader
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, KeepTogether,
        )
        from reportlab.graphics.shapes import Drawing, Rect, String, Line
    except ImportError:
        raise RuntimeError(
            "reportlab não instalado. Adicione 'reportlab' ao requirements.txt e reinstale."
        )

    PAGE_W, PAGE_H = A4          # 595.27 × 841.89 pt
    HEADER_H  = 72               # height of header band
    FOOTER_H  = 22               # height of footer band
    L_MARGIN  = R_MARGIN = 2 * cm
    CONTENT_W = PAGE_W - L_MARGIN - R_MARGIN   # ≈ 481.89 pt

    # ── Colour palette ────────────────────────────────────────────────────────
    BLUE       = colors.HexColor((branding or {}).get("color_primary", "#2563EB"))
    BLUE_DARK  = colors.HexColor((branding or {}).get("color_primary", "#1D4ED8") if (branding or {}).get("color_primary") else "#1D4ED8")
    BLUE_LIGHT = colors.HexColor("#EFF6FF")
    BLUE_BAR   = colors.HexColor("#93C5FD")
    GRAY       = colors.HexColor("#6B7280")
    GRAY_LIGHT = colors.HexColor("#F9FAFB")
    SLATE      = colors.HexColor("#374151")
    RED        = colors.HexColor("#EF4444")
    GREEN      = colors.HexColor("#10B981")
    AMBER      = colors.HexColor("#F59E0B")

    period         = data.get("period", "")
    workspace_name = data.get("workspace_name", "Workspace")

    # ── Per-page canvas callback (header + footer) ────────────────────────────
    def _draw_page(canvas, doc):
        canvas.saveState()

        # ── Header band (blue) ────────────────────────────────────────────────
        canvas.setFillColor(BLUE)
        canvas.rect(0, PAGE_H - HEADER_H, PAGE_W, HEADER_H, fill=1, stroke=0)

        # White logo pocket on left edge
        LOGO_BOX = 72
        canvas.setFillColor(colors.white)
        canvas.rect(0, PAGE_H - HEADER_H, LOGO_BOX, HEADER_H, fill=1, stroke=0)

        if logo_bytes:
            try:
                img_reader = ImageReader(io.BytesIO(logo_bytes))
                canvas.drawImage(
                    img_reader,
                    6, PAGE_H - HEADER_H + 6,
                    width=LOGO_BOX - 12, height=HEADER_H - 12,
                    preserveAspectRatio=True, mask="auto",
                )
            except Exception:
                pass

        # Title and subtitle on blue part
        text_x = LOGO_BOX + 14
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 16)
        canvas.drawString(text_x, PAGE_H - 34, "Relatório Executivo")
        canvas.setFont("Helvetica", 9.5)
        canvas.setFillColor(colors.HexColor("#BFDBFE"))
        canvas.drawString(text_x, PAGE_H - 52, f"{workspace_name}   ·   {period}")

        # "CloudAtlas" wordmark in header right corner
        canvas.setFillColor(colors.HexColor("#DBEAFE"))
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawRightString(PAGE_W - 16, PAGE_H - 42, (branding or {}).get("platform_name", "CloudAtlas"))

        # ── Footer band ───────────────────────────────────────────────────────
        canvas.setFillColor(colors.HexColor("#F3F4F6"))
        canvas.rect(0, 0, PAGE_W, FOOTER_H, fill=1, stroke=0)

        _platform = (branding or {}).get("platform_name", "CloudAtlas")
        if (branding or {}).get("powered_by", True):
            canvas.setFillColor(BLUE)
            canvas.setFont("Helvetica-Bold", 7)
            canvas.drawString(16, 7, _platform)

        canvas.setFillColor(GRAY)
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(
            PAGE_W / 2, 7,
            "Relatório gerado automaticamente · Para alterar as configurações de envio, acesse seu workspace."
        )
        canvas.drawRightString(PAGE_W - 16, 7, f"Pág. {doc.page}   ·   {period}")

        canvas.restoreState()

    # ── Document template ─────────────────────────────────────────────────────
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=L_MARGIN, rightMargin=R_MARGIN,
        topMargin=HEADER_H + 16,
        bottomMargin=FOOTER_H + 14,
    )

    styles = getSampleStyleSheet()

    body_style = ParagraphStyle(
        "Body", parent=styles["Normal"],
        fontSize=9.5, textColor=SLATE, leading=14,
    )
    meta_style = ParagraphStyle(
        "Meta", parent=body_style,
        fontSize=8.5, textColor=GRAY,
    )
    chart_label_style = ParagraphStyle(
        "ChartLabel", parent=meta_style,
        spaceAfter=4,
    )

    # ── Section header helper ─────────────────────────────────────────────────
    def _section_header(text: str):
        style = ParagraphStyle(
            "SH", parent=styles["Normal"],
            fontSize=11, textColor=BLUE, fontName="Helvetica-Bold",
        )
        t = Table([[Paragraph(text, style)]], colWidths=[CONTENT_W])
        t.setStyle(TableStyle([
            ("LINEBEFORE",     (0, 0), (0, -1), 3, BLUE),
            ("BACKGROUND",     (0, 0), (-1, -1), BLUE_LIGHT),
            ("LEFTPADDING",    (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",   (0, 0), (-1, -1), 8),
            ("TOPPADDING",     (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 5),
        ]))
        return t

    # ── Table style helper ─────────────────────────────────────────────────────
    def _table_style():
        return TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  BLUE),
            ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
            ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 8.5),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, GRAY_LIGHT]),
            ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ])

    # ── Story ─────────────────────────────────────────────────────────────────
    story = []

    costs     = data.get("costs")
    anomalies = data.get("anomalies", [])
    recs_data = data.get("recommendations", {})

    total_spend     = costs.get("total_spend", 0) if costs else 0
    delta_pct       = costs.get("delta_pct") if costs else None
    potential_saving = recs_data.get("total_potential_saving", 0) if recs_data else 0
    anom_count      = len(anomalies) if anomalies else 0

    # Generated timestamp
    story.append(Paragraph(
        f"Gerado em {datetime.utcnow().strftime('%d/%m/%Y às %H:%M')} UTC   ·   Workspace: <b>{workspace_name}</b>",
        meta_style,
    ))
    story.append(Spacer(1, 0.35 * cm))

    # ── KPI Cards row ─────────────────────────────────────────────────────────
    delta_str = ""
    if delta_pct is not None:
        arrow = "▲" if delta_pct > 0 else "▼"
        dc = "#EF4444" if delta_pct > 0 else "#10B981"
        delta_str = f'<font color="{dc}"><b>{arrow} {abs(delta_pct):.1f}%</b></font>'

    col = CONTENT_W / 3

    def _kpi(label, value_html, sub_html, bg):
        return Paragraph(
            f'<para align="center">'
            f'<font color="#6B7280" size="7.5">{label}</font><br/>'
            f'{value_html}<br/>'
            f'{sub_html}'
            f'</para>',
            body_style,
        )

    kpi_table = Table(
        [[
            _kpi("GASTO TOTAL",
                 f'<font color="#1D4ED8" size="19"><b>${total_spend:,.2f}</b></font>',
                 delta_str or '<font color="#9CA3AF" size="8">vs mês anterior</font>',
                 "#EFF6FF"),
            _kpi("ANOMALIAS",
                 f'<font color="#D97706" size="19"><b>{anom_count}</b></font>',
                 '<font color="#92400E" size="8">no período</font>',
                 "#FFFBEB"),
            _kpi("ECONOMIA POTENCIAL",
                 f'<font color="#059669" size="19"><b>${potential_saving:,.2f}</b></font>',
                 '<font color="#065F46" size="8">/mês disponível</font>',
                 "#D1FAE5"),
        ]],
        colWidths=[col, col, col],
        rowHeights=[62],
    )
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (0, 0), colors.HexColor("#EFF6FF")),
        ("BACKGROUND",    (1, 0), (1, 0), colors.HexColor("#FFFBEB")),
        ("BACKGROUND",    (2, 0), (2, 0), colors.HexColor("#D1FAE5")),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEABOVE",     (0, 0), (-1, 0), 0.3, colors.HexColor("#E5E7EB")),
        ("LINEBELOW",     (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("LINEBEFORE",    (0, 0), (0, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("LINEAFTER",     (-1, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("INNERGRID",     (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 0.4 * cm))

    # ── Costs ─────────────────────────────────────────────────────────────────
    if costs:
        story.append(_section_header("Resumo de Custos"))
        story.append(Spacer(1, 0.2 * cm))

        delta_text = ""
        if delta_pct is not None:
            prev_p = costs.get("prev_period", "mês anterior")
            prev_s = costs.get("prev_spend", 0)
            arrow  = "▲" if delta_pct > 0 else "▼"
            color  = "red" if delta_pct > 0 else "green"
            delta_text = (
                f' — vs {prev_p}: <font color="{color}"><b>{arrow} {abs(delta_pct):.1f}%</b></font>'
                f' (US$ {prev_s:,.2f})'
            )
        story.append(Paragraph(
            f"Gasto total estimado: <b>US$ {total_spend:,.2f}</b>{delta_text}",
            body_style,
        ))
        story.append(Spacer(1, 0.25 * cm))

        # Bar chart
        history = costs.get("history", [])
        if len(history) >= 2 and any(h["spend"] > 0 for h in history):
            DW, DH = CONTENT_W, 128
            drawing   = Drawing(DW, DH)
            max_spend = max(h["spend"] for h in history) or 1
            n         = len(history)
            bar_w     = min(54, int(DW * 0.55 / n))
            gap       = (DW - n * bar_w) / (n + 1)
            base_y    = 28

            # Subtle grid lines
            for frac in (0.25, 0.5, 0.75, 1.0):
                gy = base_y + frac * (DH - base_y - 18)
                drawing.add(Line(0, gy, DW, gy,
                                 strokeColor=colors.HexColor("#E5E7EB"), strokeWidth=0.5))

            for i, h in enumerate(history):
                bar_h = max(3, int((h["spend"] / max_spend) * (DH - base_y - 20)))
                x     = gap + i * (bar_w + gap)
                fill  = BLUE_DARK if i == n - 1 else BLUE_BAR
                drawing.add(Rect(x, base_y, bar_w, bar_h, fillColor=fill, strokeColor=None))

                # Month label
                label = h["period"][5:] + "/" + h["period"][:4]
                drawing.add(String(x + bar_w / 2, 12, label,
                                   fontName="Helvetica", fontSize=7,
                                   fillColor=GRAY, textAnchor="middle"))
                # Value above bar
                if h["spend"] > 0:
                    drawing.add(String(x + bar_w / 2, base_y + bar_h + 4,
                                       f"${h['spend']:,.0f}",
                                       fontName="Helvetica-Bold", fontSize=7.5,
                                       fillColor=BLUE_DARK, textAnchor="middle"))

            story.append(Paragraph("Evolução de Custos (últimos meses)", chart_label_style))
            story.append(drawing)
            story.append(Spacer(1, 0.15 * cm))

        summary = costs.get("summary", [])
        if summary:
            cw = [CONTENT_W * f for f in (0.14, 0.30, 0.19, 0.19, 0.18)]
            table_data = [["Provedor", "Orçamento", "Limite (US$)", "Gasto (US$)", "% Usado"]]
            for row in summary:
                pct = row["pct_used"]
                pc  = "#10B981" if pct < 70 else ("#F59E0B" if pct < 90 else "#EF4444")
                table_data.append([
                    row["provider"].upper(),
                    row["budget_name"],
                    f"${row['budget_amount']:,.2f}",
                    f"${row['last_spend']:,.2f}",
                    Paragraph(f'<font color="{pc}"><b>{pct}%</b></font>', body_style),
                ])
            t = Table(table_data, colWidths=cw)
            ts = _table_style()
            ts.add("ALIGN", (2, 0), (-1, -1), "RIGHT")
            t.setStyle(ts)
            story.append(t)

    # ── Anomalies ─────────────────────────────────────────────────────────────
    if anomalies is not None:
        story.append(Spacer(1, 0.35 * cm))
        story.append(_section_header("Anomalias Detectadas"))
        story.append(Spacer(1, 0.2 * cm))

        if not anomalies:
            story.append(Paragraph(
                '<font color="#10B981"><b>✓</b></font>  Nenhuma anomalia detectada no período.',
                body_style,
            ))
        else:
            cw = [CONTENT_W * f for f in (0.13, 0.27, 0.14, 0.16, 0.16, 0.14)]
            table_data = [["Provedor", "Serviço", "Data", "Baseline", "Real", "Desvio"]]
            for a in anomalies:
                dev = a["deviation_pct"]
                dc  = "#EF4444" if dev > 50 else ("#F59E0B" if dev > 20 else "#10B981")
                table_data.append([
                    a["provider"].upper(),
                    a["service"],
                    a["detected_date"],
                    f"${a['baseline_cost']:,.2f}",
                    f"${a['actual_cost']:,.2f}",
                    Paragraph(f'<font color="{dc}"><b>+{dev}%</b></font>', body_style),
                ])
            t = Table(table_data, colWidths=cw)
            t.setStyle(_table_style())
            story.append(t)

    # ── Recommendations ───────────────────────────────────────────────────────
    if recs_data is not None:
        story.append(Spacer(1, 0.35 * cm))
        story.append(_section_header("Oportunidades de Economia"))
        story.append(Spacer(1, 0.2 * cm))

        potential = recs_data.get("total_potential_saving", 0)
        story.append(Paragraph(
            f"Potencial de economia total: <b>US$ {potential:,.2f}/mês</b>",
            body_style,
        ))
        story.append(Spacer(1, 0.2 * cm))

        top = recs_data.get("top", [])
        if not top:
            story.append(Paragraph("Nenhuma recomendação pendente.", body_style))
        else:
            cw = [CONTENT_W * f for f in (0.13, 0.30, 0.24, 0.14, 0.19)]
            table_data = [["Provedor", "Recurso", "Tipo", "Severidade", "Economia/mês"]]
            for r in top:
                sev = r["severity"]
                sc  = "#EF4444" if sev == "high" else ("#F59E0B" if sev == "medium" else "#10B981")
                sl  = {"high": "Alta", "medium": "Média", "low": "Baixa"}.get(sev, sev)
                table_data.append([
                    r["provider"].upper(),
                    r["resource_name"][:28],
                    r["recommendation_type"].replace("_", " ").title(),
                    Paragraph(f'<font color="{sc}"><b>{sl}</b></font>', body_style),
                    f"${r['saving_monthly']:,.2f}",
                ])
            t = Table(table_data, colWidths=cw)
            ts = _table_style()
            ts.add("ALIGN", (4, 0), (4, -1), "RIGHT")
            t.setStyle(ts)
            story.append(t)

    # ── Schedules ─────────────────────────────────────────────────────────────
    sched = data.get("schedules")
    if sched is not None:
        story.append(Spacer(1, 0.35 * cm))
        story.append(_section_header("Agendamentos Ativos"))
        story.append(Spacer(1, 0.2 * cm))
        by_prov = sched.get("by_provider", {})
        story.append(Paragraph(
            f"Total de agendamentos ativos: <b>{sched.get('active_count', 0)}</b>"
            f"   (AWS: {by_prov.get('aws', 0)}, Azure: {by_prov.get('azure', 0)},"
            f" GCP: {by_prov.get('gcp', 0)})",
            body_style,
        ))

    # ── Inventory ─────────────────────────────────────────────────────────────
    inventory = data.get("inventory")
    if inventory:
        story.append(Spacer(1, 0.35 * cm))
        story.append(_section_header("Contas Cloud Conectadas"))
        story.append(Spacer(1, 0.2 * cm))
        provider_labels = {
            "aws":   "Amazon Web Services (AWS)",
            "azure": "Microsoft Azure",
            "gcp":   "Google Cloud Platform (GCP)",
            "m365":  "Microsoft 365",
        }
        inv_rows = [["Provedor", "Contas Ativas"]]
        for prov, count in sorted(inventory.items()):
            inv_rows.append([provider_labels.get(prov, prov.upper()), str(count)])

        t = Table(inv_rows, colWidths=[CONTENT_W * 0.72, CONTENT_W * 0.28])
        ts = _table_style()
        ts.add("ALIGN", (1, 0), (1, -1), "CENTER")
        t.setStyle(ts)
        story.append(t)

    doc.build(story, onFirstPage=_draw_page, onLaterPages=_draw_page)
    return buf.getvalue()


# ── Email HTML ─────────────────────────────────────────────────────────────────


def _build_rich_email_html(
    workspace_name: str,
    period: str,
    summary_data: dict,
    logo_bytes: Optional[bytes] = None,
    branding: dict = None,
) -> str:
    """Build a rich HTML email body with logo, KPI cards, anomalies and recommendations."""
    costs          = summary_data.get("costs", {})
    total_spend    = costs.get("total_spend", 0)
    delta_pct      = costs.get("delta_pct")
    anomalies      = summary_data.get("anomalies", [])
    recs           = summary_data.get("recommendations", {})
    potential_saving = recs.get("total_potential_saving", 0)
    sched          = summary_data.get("schedules", {})
    inventory      = summary_data.get("inventory", {})

    _platform = (branding or {}).get("platform_name", "CloudAtlas")

    # Logo img tag (inline base64) or text fallback
    if logo_bytes:
        logo_b64 = base64.b64encode(logo_bytes).decode()
        logo_img = (
            f'<img src="data:image/png;base64,{logo_b64}" '
            f'height="44" alt="{_platform}" style="display:block;" />'
        )
    else:
        logo_img = f'<span style="font-size:20px;font-weight:800;color:#1D4ED8;">{_platform}</span>'

    # Delta badge
    if delta_pct is not None:
        arrow       = "▲" if delta_pct > 0 else "▼"
        delta_color = "#EF4444" if delta_pct > 0 else "#10B981"
        delta_badge = (
            f'<span style="font-size:11px;color:{delta_color};font-weight:600;">'
            f'{arrow} {abs(delta_pct):.1f}% vs mês anterior</span>'
        )
    else:
        delta_badge = '<span style="font-size:11px;color:#9CA3AF;">vs mês anterior</span>'

    # Anomaly rows (top 3)
    anomaly_rows = ""
    for i, a in enumerate(anomalies[:3]):
        bg  = "#F9FAFB" if i % 2 else "#FFFFFF"
        dev = a["deviation_pct"]
        dc  = "#EF4444" if dev > 50 else ("#F59E0B" if dev > 20 else "#16A34A")
        anomaly_rows += (
            f"<tr style='background:{bg};'>"
            f"<td style='padding:9px 14px;border:1px solid #E5E7EB;font-size:13px;font-weight:600;'>{a['provider'].upper()}</td>"
            f"<td style='padding:9px 14px;border:1px solid #E5E7EB;font-size:13px;'>{a['service']}</td>"
            f"<td style='padding:9px 14px;border:1px solid #E5E7EB;font-size:13px;'>{a.get('detected_date','')}</td>"
            f"<td style='padding:9px 14px;border:1px solid #E5E7EB;font-size:13px;color:{dc};font-weight:700;'>+{dev}%</td>"
            f"</tr>"
        )
    if not anomaly_rows:
        anomaly_rows = (
            "<tr><td colspan='4' style='padding:14px;color:#9CA3AF;text-align:center;"
            "font-size:13px;'>✓ Nenhuma anomalia detectada no período</td></tr>"
        )

    # Recommendations rows (top 3)
    top_recs  = (recs.get("top") or [])[:3]
    rec_rows  = ""
    sev_labels = {"high": "Alta", "medium": "Média", "low": "Baixa"}
    for i, r in enumerate(top_recs):
        bg  = "#F9FAFB" if i % 2 else "#FFFFFF"
        sev = r.get("severity", "low")
        sc  = "#EF4444" if sev == "high" else ("#F59E0B" if sev == "medium" else "#10B981")
        sl  = sev_labels.get(sev, sev)
        rec_rows += (
            f"<tr style='background:{bg};'>"
            f"<td style='padding:9px 14px;border:1px solid #E5E7EB;font-size:13px;font-weight:600;'>{r['provider'].upper()}</td>"
            f"<td style='padding:9px 14px;border:1px solid #E5E7EB;font-size:13px;'>{r.get('resource_name','')[:32]}</td>"
            f"<td style='padding:9px 14px;border:1px solid #E5E7EB;font-size:13px;color:{sc};font-weight:700;'>{sl}</td>"
            f"<td style='padding:9px 14px;border:1px solid #E5E7EB;font-size:13px;color:#059669;font-weight:700;'>${r.get('saving_monthly',0):,.2f}/mês</td>"
            f"</tr>"
        )
    if not rec_rows:
        rec_rows = (
            "<tr><td colspan='4' style='padding:14px;color:#9CA3AF;text-align:center;"
            "font-size:13px;'>Nenhuma recomendação pendente</td></tr>"
        )

    # Inventory pills
    provider_labels = {"aws": "AWS", "azure": "Azure", "gcp": "GCP", "m365": "M365"}
    inv_pills = " ".join(
        f'<span style="display:inline-block;background:#EFF6FF;color:#1D4ED8;'
        f'border:1px solid #BFDBFE;border-radius:20px;padding:3px 12px;'
        f'font-size:12px;font-weight:600;margin:2px;">'
        f'{provider_labels.get(p, p.upper())} · {c}</span>'
        for p, c in sorted(inventory.items())
    ) if inventory else ""

    # Schedules summary
    aws_s   = sched.get("by_provider", {}).get("aws", 0)
    azure_s = sched.get("by_provider", {}).get("azure", 0)
    gcp_s   = sched.get("by_provider", {}).get("gcp", 0)

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
             color:#374151;background:#F3F4F6;margin:0;padding:20px 0;">

<div style="max-width:640px;margin:0 auto;">

  <!-- Card wrapper -->
  <div style="background:#ffffff;border-radius:16px;overflow:hidden;
              box-shadow:0 2px 8px rgba(0,0,0,.10);">

    <!-- Header: white logo row + blue title row -->
    <div style="background:#ffffff;padding:20px 32px 12px;border-bottom:1px solid #E5E7EB;">
      {logo_img}
    </div>
    <div style="background:#2563EB;padding:20px 32px 22px;">
      <h1 style="margin:0 0 4px;font-size:22px;color:#ffffff;font-weight:700;letter-spacing:-.3px;">
        Relat&oacute;rio Executivo
      </h1>
      <p style="margin:0;font-size:14px;color:#BFDBFE;">
        {workspace_name} &nbsp;&mdash;&nbsp; {period}
      </p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">

      <p style="font-size:14px;color:#6B7280;margin:0 0 24px;">
        Resumo do per&iacute;odo <strong>{period}</strong> para o workspace <strong>{workspace_name}</strong>.
        O PDF completo est&aacute; em anexo.
      </p>

      <!-- KPI Cards -->
      <table width="100%" cellpadding="0" cellspacing="6" style="margin-bottom:28px;">
        <tr>
          <td width="33%" style="vertical-align:top;">
            <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;
                        padding:18px 12px;text-align:center;">
              <p style="margin:0 0 6px;font-size:10px;color:#6B7280;text-transform:uppercase;
                        letter-spacing:.08em;font-weight:600;">Gasto Total</p>
              <p style="margin:0;font-size:24px;font-weight:800;color:#1D4ED8;">
                ${total_spend:,.2f}
              </p>
              <p style="margin:6px 0 0;font-size:11px;">{delta_badge}</p>
            </div>
          </td>
          <td width="33%" style="vertical-align:top;">
            <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;
                        padding:18px 12px;text-align:center;">
              <p style="margin:0 0 6px;font-size:10px;color:#6B7280;text-transform:uppercase;
                        letter-spacing:.08em;font-weight:600;">Anomalias</p>
              <p style="margin:0;font-size:24px;font-weight:800;color:#D97706;">
                {len(anomalies)}
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#92400E;">no per&iacute;odo</p>
            </div>
          </td>
          <td width="33%" style="vertical-align:top;">
            <div style="background:#D1FAE5;border:1px solid #6EE7B7;border-radius:12px;
                        padding:18px 12px;text-align:center;">
              <p style="margin:0 0 6px;font-size:10px;color:#6B7280;text-transform:uppercase;
                        letter-spacing:.08em;font-weight:600;">Economia Potencial</p>
              <p style="margin:0;font-size:24px;font-weight:800;color:#059669;">
                ${potential_saving:,.2f}
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#065F46;">/m&ecirc;s dispon&iacute;vel</p>
            </div>
          </td>
        </tr>
      </table>

      <!-- Anomalies -->
      <h3 style="font-size:14px;font-weight:700;color:#111827;margin:0 0 10px;
                 padding-left:10px;border-left:3px solid #2563EB;">
        Principais Anomalias
      </h3>
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border-collapse:collapse;border-radius:8px;overflow:hidden;
                    margin-bottom:26px;border:1px solid #E5E7EB;">
        <thead>
          <tr style="background:#2563EB;">
            <th style="padding:9px 14px;font-size:11px;text-align:left;color:#fff;font-weight:600;">Provedor</th>
            <th style="padding:9px 14px;font-size:11px;text-align:left;color:#fff;font-weight:600;">Servi&ccedil;o</th>
            <th style="padding:9px 14px;font-size:11px;text-align:left;color:#fff;font-weight:600;">Data</th>
            <th style="padding:9px 14px;font-size:11px;text-align:left;color:#fff;font-weight:600;">Desvio</th>
          </tr>
        </thead>
        <tbody>{anomaly_rows}</tbody>
      </table>

      <!-- Recommendations -->
      <h3 style="font-size:14px;font-weight:700;color:#111827;margin:0 0 10px;
                 padding-left:10px;border-left:3px solid #10B981;">
        Oportunidades de Economia &mdash; top 3
      </h3>
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border-collapse:collapse;border-radius:8px;overflow:hidden;
                    margin-bottom:26px;border:1px solid #E5E7EB;">
        <thead>
          <tr style="background:#059669;">
            <th style="padding:9px 14px;font-size:11px;text-align:left;color:#fff;font-weight:600;">Provedor</th>
            <th style="padding:9px 14px;font-size:11px;text-align:left;color:#fff;font-weight:600;">Recurso</th>
            <th style="padding:9px 14px;font-size:11px;text-align:left;color:#fff;font-weight:600;">Severidade</th>
            <th style="padding:9px 14px;font-size:11px;text-align:left;color:#fff;font-weight:600;">Economia</th>
          </tr>
        </thead>
        <tbody>{rec_rows}</tbody>
      </table>

      <!-- Schedules + Inventory -->
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;
                  padding:16px 18px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:13px;color:#374151;">
          <strong>Agendamentos ativos:</strong>
          &nbsp;{sched.get('active_count', 0)}
          &nbsp;
          <span style="font-size:12px;color:#6B7280;">
            (AWS: {aws_s} &nbsp;|&nbsp; Azure: {azure_s} &nbsp;|&nbsp; GCP: {gcp_s})
          </span>
        </p>
        {f'<p style="margin:0;font-size:13px;color:#374151;"><strong>Contas conectadas:</strong>&nbsp; {inv_pills}</p>' if inv_pills else ""}
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:8px;">
        <a href="#" style="display:inline-block;background:#2563EB;color:#ffffff;
                           text-decoration:none;font-size:14px;font-weight:600;
                           padding:12px 28px;border-radius:8px;letter-spacing:.2px;">
          Abrir {_platform} &rarr;
        </a>
      </div>

    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:16px 32px;text-align:center;">
      {'<p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#1D4ED8;">' + _platform + '</p>' if (branding or {}).get("powered_by", True) else ''}
      <p style="margin:0;font-size:11px;color:#9CA3AF;">
        E-mail gerado automaticamente. Para alterar as configura&ccedil;&otilde;es de envio,
        acesse as configura&ccedil;&otilde;es do workspace.
      </p>
    </div>

  </div>
</div>
</body>
</html>"""


# ── Email sending ─────────────────────────────────────────────────────────────


def _send_email(recipients: List[str], subject: str, body_html: str, pdf_bytes: bytes, period: str):
    """Send PDF report via SMTP."""
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured — skipping email send.")
        return

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = ", ".join(recipients)

    msg.attach(MIMEText(body_html, "html", "utf-8"))

    attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
    attachment.add_header(
        "Content-Disposition",
        "attachment",
        filename=f"relatorio-executivo-{period}.pdf",
    )
    msg.attach(attachment)

    try:
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


def generate_report(db: Session, workspace_id: UUID, period: str, branding: dict = None, logo_bytes: bytes = None) -> "ExecutiveReport":
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
        if logo_bytes is None:
            logo_bytes = _load_org_logo(branding)
        summary_data = _collect_summary_data(db, workspace_id, period, report_settings)
        pdf_bytes    = _generate_pdf(summary_data, report_settings, logo_bytes, branding=branding)

        report.status       = "ready"
        report.pdf_bytes    = base64.b64encode(pdf_bytes).decode("ascii")
        report.summary_data = summary_data
        report.generated_at = datetime.utcnow()
        db.commit()
        logger.info("Executive report generated for workspace %s period %s", workspace_id, period)

    except Exception as exc:
        logger.exception("Failed to generate executive report: %s", exc)
        report.status = "failed"
        report.error  = str(exc)[:500]
        db.commit()

    db.refresh(report)
    return report


def retry_report(db: Session, report_id: UUID, branding: dict = None, logo_bytes: bytes = None):
    """Re-run generation for an existing failed report (same period, same record)."""
    from app.models.db_models import ExecutiveReport, ExecutiveReportSettings

    report = db.query(ExecutiveReport).filter(ExecutiveReport.id == report_id).first()
    if not report:
        return

    workspace_id = report.workspace_id
    period       = report.period

    report_settings = db.query(ExecutiveReportSettings).filter(
        ExecutiveReportSettings.workspace_id == workspace_id,
    ).first() or _DefaultSettings()

    try:
        if logo_bytes is None:
            logo_bytes = _load_org_logo(branding)
        summary_data = _collect_summary_data(db, workspace_id, period, report_settings)
        pdf_bytes    = _generate_pdf(summary_data, report_settings, logo_bytes, branding=branding)

        report.status       = "ready"
        report.pdf_bytes    = base64.b64encode(pdf_bytes).decode("ascii")
        report.summary_data = summary_data
        report.generated_at = datetime.utcnow()
        report.error        = None
        db.commit()
        logger.info("Executive report retried OK for workspace %s period %s", workspace_id, period)

    except Exception as exc:
        logger.exception("Retry failed for report %s: %s", report_id, exc)
        report.status = "failed"
        report.error  = str(exc)[:500]
        db.commit()


def send_report(db: Session, report_id: UUID, recipients: List[str], branding: dict = None, logo_bytes: bytes = None):
    """Send an already-generated report by email."""
    from app.models.db_models import ExecutiveReport

    report = db.query(ExecutiveReport).filter(ExecutiveReport.id == report_id).first()
    if not report or report.status != "ready":
        raise ValueError("Relatório não encontrado ou ainda não gerado.")

    pdf_bytes      = base64.b64decode(report.pdf_bytes)
    workspace_name = (report.summary_data or {}).get("workspace_name", "Workspace")
    if logo_bytes is None:
        logo_bytes = _load_org_logo(branding)

    subject   = f"Relatório Executivo — {workspace_name} — {report.period}"
    body_html = _build_rich_email_html(
        workspace_name, report.period, report.summary_data or {}, logo_bytes, branding=branding,
    )

    _send_email(recipients, subject, body_html, pdf_bytes, report.period)

    report.sent_at    = datetime.utcnow()
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
        now               = datetime.utcnow()
        first_of_month    = now.replace(day=1)
        last_month        = first_of_month - timedelta(days=1)
        period            = last_month.strftime("%Y-%m")

        settings_list = db.query(ExecutiveReportSettings).filter(
            ExecutiveReportSettings.is_enabled == True,
        ).all()

        logger.info(
            "Monthly reports job: generating %d reports for period %s",
            len(settings_list), period,
        )

        for rs in settings_list:
            if not rs.recipients:
                continue
            try:
                report = generate_report(db, rs.workspace_id, period)
                if report.status == "ready":
                    send_report(db, report.id, rs.recipients)
            except Exception as exc:
                logger.exception(
                    "Failed to generate/send report for workspace %s: %s",
                    rs.workspace_id, exc,
                )

    finally:
        db.close()
