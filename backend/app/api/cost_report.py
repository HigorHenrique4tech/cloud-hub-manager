"""
Cost Report API — generates professional PDF and CSV reports for cloud cost analysis.

PDF is built server-side with ReportLab for consistent, high-quality output
independent of the browser. Includes header/footer branding, KPI cards,
daily trend chart, top-services table, provider breakdown, and suggestions.
"""
import asyncio
import csv
import io
import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import MemberContext, require_permission
from app.database import get_db
from app.models.db_models import CloudAccount, Workspace
from app.services.auth_service import decrypt_for_account
from app.services.branding_service import get_branding_for_workspace

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/costs",
    tags=["Cost Report"],
)

_LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.png")


def _load_logo() -> Optional[bytes]:
    try:
        with open(_LOGO_PATH, "rb") as f:
            return f.read()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Helpers — build cloud services from workspace credentials
# ---------------------------------------------------------------------------

async def _run(fn, *args, _timeout=120, **kwargs):
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(fn, *args, **kwargs),
            timeout=_timeout,
        )
    except asyncio.TimeoutError:
        return None
    except Exception:
        return None


def _get_cloud_accounts(db: Session, workspace_id, provider: str):
    return (
        db.query(CloudAccount)
        .filter(
            CloudAccount.workspace_id == workspace_id,
            CloudAccount.provider == provider,
            CloudAccount.is_active == True,
        )
        .order_by(CloudAccount.created_at.desc())
        .all()
    )


async def _fetch_costs(db: Session, workspace_id, start_date: str, end_date: str):
    """Fetch cost data from all providers, returning a combined dict."""
    results = {"aws": None, "azure": None, "gcp": None}

    # AWS
    aws_accounts = _get_cloud_accounts(db, workspace_id, "aws")
    if aws_accounts:
        try:
            from app.services.aws_service import AWSService
            data = decrypt_for_account(db, aws_accounts[0])
            svc = AWSService(
                access_key=data.get("access_key_id", ""),
                secret_key=data.get("secret_access_key", ""),
                region=data.get("region", "us-east-1"),
            )
            results["aws"] = await _run(svc.get_cost_and_usage, start_date, end_date, "DAILY")
        except Exception as e:
            logger.warning("Cost report: AWS fetch failed: %s", e)

    # Azure
    azure_accounts = _get_cloud_accounts(db, workspace_id, "azure")
    if azure_accounts:
        try:
            from app.services.azure_service import AzureService
            data = decrypt_for_account(db, azure_accounts[0])
            svc = AzureService(
                subscription_id=data.get("subscription_id", ""),
                tenant_id=data.get("tenant_id", ""),
                client_id=data.get("client_id", ""),
                client_secret=data.get("client_secret", ""),
            )
            results["azure"] = await _run(svc.get_cost_by_subscription, start_date, end_date, "Daily")
        except Exception as e:
            logger.warning("Cost report: Azure fetch failed: %s", e)

    # GCP
    gcp_accounts = _get_cloud_accounts(db, workspace_id, "gcp")
    if gcp_accounts:
        try:
            from app.services.gcp_service import GCPService
            data = decrypt_for_account(db, gcp_accounts[0])
            svc = GCPService(
                project_id=data.get("project_id", ""),
                client_email=data.get("client_email", ""),
                private_key=data.get("private_key", ""),
                private_key_id=data.get("private_key_id", ""),
            )
            results["gcp"] = await _run(svc.get_cost_and_usage, start_date, end_date)
        except Exception as e:
            logger.warning("Cost report: GCP fetch failed: %s", e)

    return results


def _combine_costs(raw: dict) -> dict:
    """Combine raw provider results into a merged dataset."""
    aws = raw.get("aws") if (raw.get("aws") or {}).get("success") else None
    azure = raw.get("azure") if (raw.get("azure") or {}).get("success") else None
    gcp = raw.get("gcp") if (raw.get("gcp") or {}).get("success") else None

    # Daily timeline
    daily_map = {}
    for prov, data, key in [("aws", aws, "aws"), ("azure", azure, "azure"), ("gcp", gcp, "gcp")]:
        if data and data.get("daily"):
            for d in data["daily"]:
                if d["date"] not in daily_map:
                    daily_map[d["date"]] = {"date": d["date"], "aws": 0, "azure": 0, "gcp": 0}
                daily_map[d["date"]][key] = d.get("total", 0)

    combined = sorted(daily_map.values(), key=lambda x: x["date"])
    for d in combined:
        d["total"] = round(d["aws"] + d["azure"] + d["gcp"], 4)

    # By service
    svc_map = {}
    for prefix, data in [("AWS", aws), ("Azure", azure), ("GCP", gcp)]:
        if data and data.get("by_service"):
            for s in data["by_service"]:
                name = f"{prefix} / {s['name']}"
                svc_map[name] = svc_map.get(name, 0) + s.get("amount", 0)

    by_service = sorted(
        [{"name": k, "amount": round(v, 4)} for k, v in svc_map.items()],
        key=lambda x: x["amount"],
        reverse=True,
    )[:10]

    aws_total = aws.get("total", 0) if aws else 0
    azure_total = azure.get("total", 0) if azure else 0
    gcp_total = gcp.get("total", 0) if gcp else 0
    total = round(aws_total + azure_total + gcp_total, 4)

    return {
        "aws_total": aws_total,
        "azure_total": azure_total,
        "gcp_total": gcp_total,
        "gcp_estimated": bool(gcp and gcp.get("estimated")),
        "total": total,
        "combined": combined,
        "by_service": by_service,
    }


# ---------------------------------------------------------------------------
# Suggestions (server-side version of ReportSuggestions logic)
# ---------------------------------------------------------------------------

def _generate_suggestions(data: dict, days: int) -> list:
    total = data.get("total", 0)
    if total == 0:
        return []

    suggestions = []
    services = data.get("by_service", [])

    import re

    compute_total = sum(s["amount"] for s in services if re.search(r"EC2|Compute|Virtual Machine|VMs?", s["name"], re.I))
    if compute_total / total > 0.35:
        suggestions.append({
            "type": "warning",
            "title": "Alto gasto em computacao",
            "description": f"{compute_total / total * 100:.0f}% do custo (${compute_total:,.2f}) esta em instancias de computacao. Considere Reserved Instances ou Savings Plans para economizar ate 60%.",
            "saving": compute_total * 0.4,
        })

    storage_total = sum(s["amount"] for s in services if re.search(r"S3|Storage|Blob|Disk", s["name"], re.I))
    if storage_total / total > 0.20:
        suggestions.append({
            "type": "info",
            "title": "Custo de armazenamento elevado",
            "description": f"${storage_total:,.2f} em armazenamento ({storage_total / total * 100:.0f}% do total). Politicas de ciclo de vida e camadas inteligentes podem reduzir ate 40%.",
            "saving": storage_total * 0.3,
        })

    db_total = sum(s["amount"] for s in services if re.search(r"RDS|SQL|Database|Aurora|Cosmos", s["name"], re.I))
    if db_total / total > 0.20:
        suggestions.append({
            "type": "warning",
            "title": "Alto custo em bancos de dados",
            "description": f"${db_total:,.2f} em banco de dados. Avalie Reserved Instances para RDS ou migracao para servicos serverless.",
            "saving": db_total * 0.35,
        })

    top1 = services[0] if services else None
    if top1 and top1["amount"] / total > 0.60:
        suggestions.append({
            "type": "warning",
            "title": "Concentracao excessiva em um servico",
            "description": f'"{top1["name"]}" representa {top1["amount"] / total * 100:.0f}% do custo total. Revise dimensionamento e utilizacao.',
            "saving": top1["amount"] * 0.15,
        })

    avg_daily = total / max(days, 1)
    if avg_daily > 200:
        suggestions.append({
            "type": "info",
            "title": "Implantar tagging e alocacao de custos",
            "description": f"Com gasto medio de ${avg_daily:,.2f}/dia, tags de ambiente permitem identificar e eliminar recursos desnecessarios.",
            "saving": avg_daily * 0.10 * 30,
        })

    return suggestions[:5]


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------

def _generate_cost_pdf(
    data: dict,
    start_date: str,
    end_date: str,
    days: int,
    workspace_name: str,
    logo_bytes: Optional[bytes] = None,
    branding: Optional[dict] = None,
) -> bytes:
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

    PAGE_W, PAGE_H = A4
    HEADER_H = 72
    FOOTER_H = 22
    L_MARGIN = R_MARGIN = 2 * cm
    CONTENT_W = PAGE_W - L_MARGIN - R_MARGIN

    # Colour palette
    PRIMARY = colors.HexColor((branding or {}).get("color_primary", "#2563EB"))
    PRIMARY_DARK = colors.HexColor("#1D4ED8")
    BLUE_LIGHT = colors.HexColor("#EFF6FF")
    BLUE_BAR = colors.HexColor("#93C5FD")
    GRAY = colors.HexColor("#6B7280")
    GRAY_LIGHT = colors.HexColor("#F9FAFB")
    SLATE = colors.HexColor("#374151")
    GREEN = colors.HexColor("#10B981")
    AMBER = colors.HexColor("#F59E0B")
    RED = colors.HexColor("#EF4444")
    ORANGE = colors.HexColor("#F97316")
    SKY = colors.HexColor("#0EA5E9")
    EMERALD = colors.HexColor("#10B981")

    _platform = (branding or {}).get("platform_name", "CloudAtlas")
    generated_at = datetime.utcnow().strftime("%d/%m/%Y as %H:%M UTC")

    total = data.get("total", 0)
    aws_total = data.get("aws_total", 0)
    azure_total = data.get("azure_total", 0)
    gcp_total = data.get("gcp_total", 0)
    combined = data.get("combined", [])
    by_service = data.get("by_service", [])
    avg_daily = total / max(days, 1)
    projection = avg_daily * 30

    suggestions = _generate_suggestions(data, days)
    total_saving = sum(s.get("saving", 0) for s in suggestions if s.get("saving"))

    # -- Page callbacks --
    def _draw_page(canvas, doc):
        canvas.saveState()

        # Header band
        canvas.setFillColor(PRIMARY)
        canvas.rect(0, PAGE_H - HEADER_H, PAGE_W, HEADER_H, fill=1, stroke=0)

        # Logo pocket
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

        text_x = LOGO_BOX + 14
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 16)
        canvas.drawString(text_x, PAGE_H - 34, "Relatorio de Custos Cloud")
        canvas.setFont("Helvetica", 9.5)
        canvas.setFillColor(colors.HexColor("#BFDBFE"))
        canvas.drawString(text_x, PAGE_H - 52, f"{workspace_name}   |   {start_date} a {end_date}")

        # Platform name
        canvas.setFillColor(colors.HexColor("#DBEAFE"))
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawRightString(PAGE_W - 16, PAGE_H - 42, _platform)

        # Footer band
        canvas.setFillColor(colors.HexColor("#F3F4F6"))
        canvas.rect(0, 0, PAGE_W, FOOTER_H, fill=1, stroke=0)

        canvas.setFillColor(PRIMARY)
        canvas.setFont("Helvetica-Bold", 7)
        canvas.drawString(16, 7, _platform)

        canvas.setFillColor(GRAY)
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(
            PAGE_W / 2, 7,
            "Relatorio gerado automaticamente | Dados de billing das APIs dos provedores cloud.",
        )
        canvas.drawRightString(PAGE_W - 16, 7, f"Pag. {doc.page}   |   {generated_at}")

        canvas.restoreState()

    # -- Document template --
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=L_MARGIN, rightMargin=R_MARGIN,
        topMargin=HEADER_H + 16,
        bottomMargin=FOOTER_H + 14,
    )

    styles = getSampleStyleSheet()
    body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=9.5, textColor=SLATE, leading=14)
    meta_style = ParagraphStyle("Meta", parent=body_style, fontSize=8.5, textColor=GRAY)
    chart_label = ParagraphStyle("ChartLabel", parent=meta_style, spaceAfter=4)

    def _section_header(text: str):
        style = ParagraphStyle("SH", parent=styles["Normal"], fontSize=11, textColor=PRIMARY, fontName="Helvetica-Bold")
        t = Table([[Paragraph(text, style)]], colWidths=[CONTENT_W])
        t.setStyle(TableStyle([
            ("LINEBEFORE", (0, 0), (0, -1), 3, PRIMARY),
            ("BACKGROUND", (0, 0), (-1, -1), BLUE_LIGHT),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return t

    def _table_style():
        return TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_LIGHT]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])

    # -- Story --
    story = []

    # Generated timestamp
    story.append(Paragraph(
        f"Gerado em {generated_at}   |   Workspace: <b>{workspace_name}</b>   |   Periodo: <b>{start_date}</b> a <b>{end_date}</b>",
        meta_style,
    ))
    story.append(Spacer(1, 0.35 * cm))

    # -- KPI Cards --
    col = CONTENT_W / 4
    top_svc_name = by_service[0]["name"] if by_service else "-"
    top_svc_val = by_service[0]["amount"] if by_service else 0

    def _kpi(label, value_html, sub_html):
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
            _kpi("CUSTO TOTAL",
                 f'<font color="#1D4ED8" size="17"><b>${total:,.2f}</b></font>',
                 f'<font color="#9CA3AF" size="7.5">no periodo</font>'),
            _kpi("MEDIA DIARIA",
                 f'<font color="#059669" size="17"><b>${avg_daily:,.2f}</b></font>',
                 f'<font color="#065F46" size="7.5">{days} dias</font>'),
            _kpi("PROJECAO MENSAL",
                 f'<font color="#7C3AED" size="17"><b>${projection:,.2f}</b></font>',
                 f'<font color="#5B21B6" size="7.5">baseado na media</font>'),
            _kpi("MAIOR SERVICO",
                 f'<font color="#EA580C" size="17"><b>${top_svc_val:,.2f}</b></font>',
                 f'<font color="#9CA3AF" size="7.5">{top_svc_name[:24]}</font>'),
        ]],
        colWidths=[col, col, col, col],
        rowHeights=[62],
    )
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#EFF6FF")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#D1FAE5")),
        ("BACKGROUND", (2, 0), (2, 0), colors.HexColor("#EDE9FE")),
        ("BACKGROUND", (3, 0), (3, 0), colors.HexColor("#FFF7ED")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEABOVE", (0, 0), (-1, 0), 0.3, colors.HexColor("#E5E7EB")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("LINEBEFORE", (0, 0), (0, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("LINEAFTER", (-1, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 0.4 * cm))

    # -- Provider Breakdown --
    providers = []
    if aws_total > 0:
        providers.append(("AWS", aws_total, ORANGE, "#FFF7ED"))
    if azure_total > 0:
        providers.append(("Azure", azure_total, SKY, "#F0F9FF"))
    if gcp_total > 0:
        label = "GCP (est.)" if data.get("gcp_estimated") else "GCP"
        providers.append((label, gcp_total, EMERALD, "#D1FAE5"))

    if providers:
        story.append(_section_header("Distribuicao por Provedor"))
        story.append(Spacer(1, 0.2 * cm))

        prov_cols = CONTENT_W / max(len(providers), 1)
        prov_cells = []
        for name, val, col_color, bg_hex in providers:
            pct = (val / total * 100) if total > 0 else 0
            prov_cells.append(Paragraph(
                f'<para align="center">'
                f'<font color="#6B7280" size="8"><b>{name}</b></font><br/>'
                f'<font color="#111827" size="14"><b>${val:,.2f}</b></font><br/>'
                f'<font color="#6B7280" size="8">{pct:.1f}% do total</font>'
                f'</para>',
                body_style,
            ))

        prov_table = Table([prov_cells], colWidths=[prov_cols] * len(providers), rowHeights=[56])
        prov_style_cmds = [
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
            ("BOX", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ]
        for i, (_, _, _, bg_hex) in enumerate(providers):
            prov_style_cmds.append(("BACKGROUND", (i, 0), (i, 0), colors.HexColor(bg_hex)))
        prov_table.setStyle(TableStyle(prov_style_cmds))
        story.append(prov_table)
        story.append(Spacer(1, 0.4 * cm))

    # -- Daily Trend Chart --
    if len(combined) >= 2:
        story.append(_section_header("Evolucao Diaria de Custos"))
        story.append(Spacer(1, 0.2 * cm))

        DW, DH = CONTENT_W, 140
        drawing = Drawing(DW, DH)
        max_val = max((d["total"] for d in combined), default=1) or 1
        n = len(combined)
        bar_w = min(12, max(2, int(DW * 0.8 / n)))
        gap = (DW - n * bar_w) / (n + 1)
        base_y = 28

        # Grid lines
        for frac in (0.25, 0.5, 0.75, 1.0):
            gy = base_y + frac * (DH - base_y - 18)
            drawing.add(Line(0, gy, DW, gy,
                             strokeColor=colors.HexColor("#E5E7EB"), strokeWidth=0.5))
            val_at = max_val * frac
            drawing.add(String(DW - 2, gy + 2, f"${val_at:,.0f}",
                               fontName="Helvetica", fontSize=6,
                               fillColor=GRAY, textAnchor="end"))

        for i, d in enumerate(combined):
            bar_h = max(2, int((d["total"] / max_val) * (DH - base_y - 20)))
            x = gap + i * (bar_w + gap)

            # Stacked bars: AWS (orange) + Azure (sky) + GCP (green)
            y_offset = base_y
            for prov_key, prov_color in [("aws", ORANGE), ("azure", SKY), ("gcp", EMERALD)]:
                pv = d.get(prov_key, 0)
                if pv > 0 and total > 0:
                    ph = max(1, int((pv / max_val) * (DH - base_y - 20)))
                    drawing.add(Rect(x, y_offset, bar_w, ph, fillColor=prov_color, strokeColor=None))
                    y_offset += ph

            # Date labels (show every Nth)
            show_every = max(1, n // 15)
            if i % show_every == 0:
                label = d["date"][5:]  # MM-DD
                drawing.add(String(x + bar_w / 2, 10, label,
                                   fontName="Helvetica", fontSize=5.5,
                                   fillColor=GRAY, textAnchor="middle"))

        story.append(Paragraph("Custos diarios por provedor (barras empilhadas)", chart_label))
        story.append(drawing)
        story.append(Spacer(1, 0.15 * cm))

        # Legend
        legend_items = []
        if aws_total > 0:
            legend_items.append(('<font color="#F97316"><b>&#9632;</b></font> AWS', body_style))
        if azure_total > 0:
            legend_items.append(('<font color="#0EA5E9"><b>&#9632;</b></font> Azure', body_style))
        if gcp_total > 0:
            legend_items.append(('<font color="#10B981"><b>&#9632;</b></font> GCP', body_style))
        if legend_items:
            legend_text = "    ".join(f[0] for f in legend_items)
            story.append(Paragraph(legend_text, ParagraphStyle("Legend", parent=meta_style, alignment=1)))
            story.append(Spacer(1, 0.3 * cm))

    # -- Top Services Table --
    if by_service:
        story.append(_section_header(f"Top {len(by_service)} Servicos por Custo"))
        story.append(Spacer(1, 0.2 * cm))

        cw = [CONTENT_W * f for f in (0.06, 0.42, 0.18, 0.12, 0.22)]
        table_data = [["#", "Servico", "Custo (USD)", "%", "Barra"]]
        for i, s in enumerate(by_service):
            pct = (s["amount"] / total * 100) if total > 0 else 0
            bar_w_pct = min(100, pct)
            # Use colored block char as a simple bar
            bar_chars = int(bar_w_pct / 5)
            bar_str = "█" * bar_chars
            table_data.append([
                str(i + 1),
                s["name"][:35],
                f"${s['amount']:,.2f}",
                f"{pct:.1f}%",
                Paragraph(f'<font color="#6366F1" size="7">{bar_str}</font>', body_style),
            ])

        # Total row
        table_data.append([
            "",
            Paragraph('<b>TOTAL</b>', body_style),
            Paragraph(f'<b>${total:,.2f}</b>', body_style),
            Paragraph('<b>100%</b>', body_style),
            "",
        ])

        t = Table(table_data, colWidths=cw)
        ts = _table_style()
        ts.add("ALIGN", (0, 0), (0, -1), "CENTER")
        ts.add("ALIGN", (2, 0), (3, -1), "RIGHT")
        t.setStyle(ts)
        story.append(t)
        story.append(Spacer(1, 0.3 * cm))

    # -- Daily Data Table --
    if combined:
        story.append(_section_header("Dados Diarios Completos"))
        story.append(Spacer(1, 0.2 * cm))

        has_aws = aws_total > 0
        has_azure = azure_total > 0
        has_gcp = gcp_total > 0

        headers = ["Data"]
        col_fracs = [0.20]
        if has_aws:
            headers.append("AWS (USD)")
            col_fracs.append(0.20)
        if has_azure:
            headers.append("Azure (USD)")
            col_fracs.append(0.20)
        if has_gcp:
            headers.append("GCP (USD)")
            col_fracs.append(0.20)
        headers.append("Total (USD)")
        col_fracs.append(0.20)

        # Normalize column fractions
        frac_sum = sum(col_fracs)
        col_widths = [CONTENT_W * (f / frac_sum) for f in col_fracs]

        table_data = [headers]
        for d in combined:
            row = [d["date"]]
            if has_aws:
                row.append(f"${d['aws']:,.2f}" if d["aws"] else "-")
            if has_azure:
                row.append(f"${d['azure']:,.2f}" if d["azure"] else "-")
            if has_gcp:
                row.append(f"${d['gcp']:,.2f}" if d["gcp"] else "-")
            row.append(f"${d['total']:,.2f}")
            table_data.append(row)

        # Totals row
        total_row = [Paragraph('<b>TOTAL</b>', body_style)]
        if has_aws:
            total_row.append(Paragraph(f'<b>${aws_total:,.2f}</b>', body_style))
        if has_azure:
            total_row.append(Paragraph(f'<b>${azure_total:,.2f}</b>', body_style))
        if has_gcp:
            total_row.append(Paragraph(f'<b>${gcp_total:,.2f}</b>', body_style))
        total_row.append(Paragraph(f'<b>${total:,.2f}</b>', body_style))
        table_data.append(total_row)

        t = Table(table_data, colWidths=col_widths)
        ts = _table_style()
        ts.add("ALIGN", (1, 0), (-1, -1), "RIGHT")
        # Bold total row
        ts.add("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F3F4F6"))
        ts.add("LINEABOVE", (0, -1), (-1, -1), 1.5, colors.HexColor("#9CA3AF"))
        t.setStyle(ts)
        story.append(t)
        story.append(Spacer(1, 0.3 * cm))

    # -- Suggestions --
    if suggestions:
        story.append(_section_header("Sugestoes de Otimizacao"))
        story.append(Spacer(1, 0.2 * cm))

        if total_saving > 0:
            story.append(Paragraph(
                f'Economia potencial total estimada: <b><font color="#059669">${total_saving:,.2f}/mes</font></b>',
                body_style,
            ))
            story.append(Spacer(1, 0.15 * cm))

        type_colors = {"warning": "#F59E0B", "info": "#3B82F6", "success": "#10B981"}
        type_icons = {"warning": "!", "info": "i", "success": "✓"}

        for s in suggestions:
            tc = type_colors.get(s["type"], "#6B7280")
            icon = type_icons.get(s["type"], "•")
            saving_text = ""
            if s.get("saving"):
                saving_text = f'  |  <font color="#059669"><b>Economia: ~${s["saving"]:,.2f}/mes</b></font>'

            block = KeepTogether([
                Paragraph(
                    f'<font color="{tc}" size="10"><b>[{icon}] {s["title"]}</b></font>',
                    body_style,
                ),
                Paragraph(
                    f'{s["description"]}{saving_text}',
                    ParagraphStyle("SugBody", parent=body_style, fontSize=8.5, leftIndent=12),
                ),
                Spacer(1, 0.15 * cm),
            ])
            story.append(block)

    # -- Build PDF --
    doc.build(story, onFirstPage=_draw_page, onLaterPages=_draw_page)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# CSV generation
# ---------------------------------------------------------------------------

def _generate_cost_csv(
    data: dict,
    start_date: str,
    end_date: str,
    days: int,
    workspace_name: str,
    platform_name: str = "CloudAtlas",
) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    total = data.get("total", 0)
    aws_total = data.get("aws_total", 0)
    azure_total = data.get("azure_total", 0)
    gcp_total = data.get("gcp_total", 0)
    combined = data.get("combined", [])
    by_service = data.get("by_service", [])
    avg_daily = total / max(days, 1)

    gen_date = datetime.utcnow().strftime("%d/%m/%Y %H:%M UTC")

    # Header
    writer.writerow([f"Relatorio de Custos {platform_name}", "", "", "", ""])
    writer.writerow([f"Periodo: {start_date} a {end_date}", "", "", "", ""])
    writer.writerow([f"Workspace: {workspace_name}", "", "", "", ""])
    writer.writerow([f"Gerado em: {gen_date}", "", "", "", ""])
    writer.writerow([])

    # Summary
    writer.writerow(["=== RESUMO ===", "", "", "", ""])
    writer.writerow(["Custo Total (USD)", f"{total:.2f}"])
    writer.writerow(["Media Diaria (USD)", f"{avg_daily:.2f}"])
    writer.writerow(["Projecao 30 dias (USD)", f"{avg_daily * 30:.2f}"])
    writer.writerow(["Total de dias", str(days)])
    writer.writerow(["AWS (USD)", f"{aws_total:.2f}"])
    writer.writerow(["Azure (USD)", f"{azure_total:.2f}"])
    writer.writerow(["GCP (USD)", f"{gcp_total:.2f}"])
    writer.writerow([])

    # Daily
    writer.writerow(["=== CUSTOS DIARIOS ===", "", "", "", ""])
    writer.writerow(["Data", "AWS (USD)", "Azure (USD)", "GCP (USD)", "Total (USD)"])
    for d in combined:
        writer.writerow([
            d["date"],
            f"{d['aws']:.2f}" if d["aws"] else "0.00",
            f"{d['azure']:.2f}" if d["azure"] else "0.00",
            f"{d['gcp']:.2f}" if d["gcp"] else "0.00",
            f"{d['total']:.2f}",
        ])
    writer.writerow(["TOTAL", f"{aws_total:.2f}", f"{azure_total:.2f}", f"{gcp_total:.2f}", f"{total:.2f}"])
    writer.writerow([])

    # Services
    writer.writerow(["=== CUSTOS POR SERVICO ===", "", "", "", ""])
    writer.writerow(["Servico", "Valor (USD)", "% do Total", "", ""])
    for s in by_service:
        pct = (s["amount"] / total * 100) if total > 0 else 0
        writer.writerow([s["name"], f"{s['amount']:.2f}", f"{pct:.1f}%"])
    writer.writerow(["TOTAL", f"{total:.2f}", "100.0%"])

    return output.getvalue()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@ws_router.get("/report")
async def cost_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    format: str = Query("pdf", description="pdf or csv"),
    member: MemberContext = Depends(require_permission("costs.view")),
    db: Session = Depends(get_db),
):
    """Generate a professional cost analysis report (PDF or CSV)."""
    # Compute days
    from datetime import date as dt_date
    try:
        d_start = dt_date.fromisoformat(start_date)
        d_end = dt_date.fromisoformat(end_date)
        days = max((d_end - d_start).days, 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de data invalido. Use YYYY-MM-DD.")

    # Workspace name
    ws = db.query(Workspace).filter(Workspace.id == member.workspace_id).first()
    workspace_name = ws.name if ws else "Workspace"

    # Fetch costs from all providers
    raw = await _fetch_costs(db, member.workspace_id, start_date, end_date)
    data = _combine_costs(raw)

    branding = get_branding_for_workspace(db, member.workspace_id)
    platform_name = branding.get("platform_name", "CloudAtlas")

    if format.lower() == "csv":
        csv_content = _generate_cost_csv(data, start_date, end_date, days, workspace_name, platform_name)
        filename = f"custos-cloud-{start_date}-a-{end_date}.csv"
        return StreamingResponse(
            io.BytesIO(("\uFEFF" + csv_content).encode("utf-8")),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # PDF
    logo_bytes = _load_logo()
    pdf_bytes = _generate_cost_pdf(
        data, start_date, end_date, days,
        workspace_name, logo_bytes, branding,
    )
    filename = f"custos-cloud-{start_date}-a-{end_date}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
