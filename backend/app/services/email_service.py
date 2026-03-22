import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Internal SMTP sender ────────────────────────────────────────────────────

def _send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an email via SMTP. Returns True on success.

    To switch to SendGrid later, replace this function body with:
        import sendgrid
        sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
        ...
    """
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Email to %s not sent.", to_email)
        return True  # Treat as success in dev

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"CloudAtlas <{settings.SMTP_FROM}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        # Port 465 uses implicit SSL; all other ports use STARTTLS
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM, to_email, msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM, to_email, msg.as_string())

        logger.info("Email sent to %s: %s", to_email, subject)
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, e)
        return False


# ── Email templates ──────────────────────────────────────────────────────────

_FOOTER = """
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #cbd5e1; font-size: 11px; text-align: center;">
      CloudAtlas — Gerenciamento multi-cloud centralizado
    </p>
"""


def send_verification_email(to_email: str, user_name: str, token: str) -> bool:
    """Send an email verification link."""
    verify_url = f"{settings.FRONTEND_URL}/verify/{token}"

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Verification link: %s", verify_url)
        return True

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Bem-vindo ao CloudAtlas!</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        Para ativar sua conta, clique no botão abaixo:
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{verify_url}"
           style="display: inline-block; padding: 12px 32px; background-color: #3b82f6;
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Confirmar meu email
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px;">
        Se o botão não funcionar, copie e cole este link:<br/>
        <a href="{verify_url}" style="color: #3b82f6;">{verify_url}</a>
      </p>
      <p style="color: #94a3b8; font-size: 12px;">Este link expira em 24 horas.</p>
      {_FOOTER}
    </div>
    """
    return _send_email(to_email, "CloudAtlas — Confirme seu email", html)


def send_invite_email(
    to_email: str,
    org_name: str,
    inviter_name: str,
    role: str,
    token: str,
) -> bool:
    """Send an organization invite email with a join link."""
    invite_url = f"{settings.FRONTEND_URL}/invite/{token}"

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Invite link: %s", invite_url)
        return True

    role_labels = {
        "owner": "Owner",
        "admin": "Administrador",
        "operator": "Operador",
        "viewer": "Visualizador",
        "billing": "Faturamento",
    }
    role_label = role_labels.get(role, role)

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Você foi convidado!</h2>
      <p style="color: #64748b; font-size: 14px;">
        <strong>{inviter_name}</strong> convidou você para a organização
        <strong>{org_name}</strong> no CloudAtlas como <strong>{role_label}</strong>.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{invite_url}"
           style="display: inline-block; padding: 12px 32px; background-color: #3b82f6;
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Aceitar convite
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px;">
        Se o botão não funcionar, copie e cole este link:<br/>
        <a href="{invite_url}" style="color: #3b82f6;">{invite_url}</a>
      </p>
      <p style="color: #94a3b8; font-size: 12px;">Este convite expira em 7 dias.</p>
      {_FOOTER}
    </div>
    """
    return _send_email(to_email, f"CloudAtlas — Convite para {org_name}", html)


def send_org_member_added_email(
    to_email: str,
    user_name: str,
    org_name: str,
    role: str,
    inviter_name: str,
) -> bool:
    """Notify an existing user that they were added to an organization."""
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Org added notification not sent to %s.", to_email)
        return True

    role_labels = {
        "owner": "Owner",
        "admin": "Administrador",
        "operator": "Operador",
        "viewer": "Visualizador",
        "billing": "Faturamento",
    }
    role_label = role_labels.get(role, role)
    dashboard_url = f"{settings.FRONTEND_URL}/dashboard"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Você foi adicionado a uma organização!</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        <strong>{inviter_name}</strong> adicionou você à organização
        <strong>{org_name}</strong> no CloudAtlas como <strong>{role_label}</strong>.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{dashboard_url}"
           style="display: inline-block; padding: 12px 32px; background-color: #3b82f6;
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Acessar o CloudAtlas
        </a>
      </div>
      {_FOOTER}
    </div>
    """
    return _send_email(to_email, f"CloudAtlas — Você foi adicionado a {org_name}", html)


def send_otp_email(to_email: str, user_name: str, otp_code: str) -> bool:
    """Send a 6-digit OTP code for MFA login verification."""
    subject = "Seu código de verificação — CloudAtlas"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Verificação em dois fatores</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        Use o código abaixo para completar seu login no CloudAtlas:
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <div style="display: inline-block; font-size: 40px; font-weight: bold; letter-spacing: 12px;
                    color: #1d4ed8; background: #eff6ff; padding: 20px 32px;
                    border-radius: 12px; border: 1px solid #bfdbfe;">
          {otp_code}
        </div>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">
        Este código expira em <strong>5 minutos</strong>.<br/>
        Se não foi você quem tentou fazer login, ignore este email.
      </p>
      {_FOOTER}
    </div>
    """
    return _send_email(to_email, subject, html)


def send_alert_email(
    to_email: str,
    user_name: str,
    alert_name: str,
    provider: str,
    current_value: str,
    threshold: str,
) -> bool:
    """Send a cost alert notification email."""
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Alert '%s' not emailed.", alert_name)
        return True

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #dc2626; margin-bottom: 8px;">Alerta de Custo Disparado</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        O alerta <strong>{alert_name}</strong> foi acionado:
      </p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: #991b1b; font-size: 14px; margin: 0;">
          <strong>Provider:</strong> {provider}<br/>
          <strong>Valor atual:</strong> {current_value}<br/>
          <strong>Limite configurado:</strong> {threshold}
        </p>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{settings.FRONTEND_URL}/costs"
           style="display: inline-block; padding: 12px 32px; background-color: #3b82f6;
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Ver custos
        </a>
      </div>
      {_FOOTER}
    </div>
    """
    return _send_email(to_email, f"CloudAtlas — Alerta: {alert_name}", html)


def send_budget_alert_email(
    to_email: str,
    user_name: str,
    budget_name: str,
    provider: str,
    current_spend: float,
    budget_amount: float,
    pct: float,
) -> bool:
    """Send a budget threshold alert email."""
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Budget alert '%s' not emailed.", budget_name)
        return True

    pct_display = f"{pct * 100:.1f}%"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #dc2626; margin-bottom: 8px;">Limite de Orçamento Atingido</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        O orçamento <strong>{budget_name}</strong> atingiu o limite de alerta configurado:
      </p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: #991b1b; font-size: 14px; margin: 0;">
          <strong>Provider:</strong> {provider.upper()}<br/>
          <strong>Gasto atual:</strong> ${current_spend:,.2f}<br/>
          <strong>Orçamento definido:</strong> ${budget_amount:,.2f}<br/>
          <strong>Percentual utilizado:</strong> {pct_display}
        </p>
      </div>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 12px; margin: 16px 0;">
        <div style="background: #e2e8f0; border-radius: 4px; height: 12px; overflow: hidden;">
          <div style="background: #dc2626; height: 12px; width: {min(pct * 100, 100):.0f}%;"></div>
        </div>
        <p style="color: #64748b; font-size: 11px; margin: 4px 0 0 0; text-align: right;">{pct_display} do orçamento utilizado</p>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{settings.FRONTEND_URL}/finops"
           style="display: inline-block; padding: 12px 32px; background-color: #3b82f6;
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Ver Orçamentos no FinOps
        </a>
      </div>
      {_FOOTER}
    </div>
    """
    return _send_email(to_email, f"CloudAtlas — Orçamento '{budget_name}' em alerta ({pct_display})", html)


def send_report_email(
    to_email: str,
    org_name: str,
    ws_name: str,
    period_label: str,
    report_data: dict,
) -> bool:
    """Send a weekly/monthly cost report email.

    report_data keys:
      costs           – dict[provider, float]  (optional, shown if include_costs)
      budgets         – list[dict]              (optional, shown if include_budgets)
      finops_savings  – float                   (optional)
      top_recs        – list[dict(title, saving)] (optional, shown if include_finops)
    """
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Report email to %s not sent.", to_email)
        return True

    costs = report_data.get("costs", {})
    budgets = report_data.get("budgets", [])
    finops_savings = report_data.get("finops_savings", 0.0)
    top_recs = report_data.get("top_recs", [])

    # Build costs section
    costs_html = ""
    if costs:
        rows = "".join(
            f"<tr><td style='padding:6px 12px;border-bottom:1px solid #e2e8f0'>{p.upper()}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>${v:,.2f}</td></tr>"
            for p, v in costs.items()
        )
        total = sum(costs.values())
        costs_html = f"""
        <h3 style="color:#1e293b;font-size:15px;margin:24px 0 8px">Custos por Provedor</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#475569">
          <thead><tr style="background:#f8fafc">
            <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Provedor</th>
            <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #e2e8f0">Gasto</th>
          </tr></thead>
          <tbody>{rows}</tbody>
          <tfoot><tr style="background:#f8fafc;font-weight:bold">
            <td style="padding:6px 12px">Total</td>
            <td style="padding:6px 12px;text-align:right">${total:,.2f}</td>
          </tr></tfoot>
        </table>
        """

    # Build budgets section
    budgets_html = ""
    if budgets:
        budget_items = ""
        for b in budgets:
            pct = b.get("pct", 0.0)
            pct_display = f"{pct * 100:.1f}%"
            color = "#16a34a" if pct < 0.75 else ("#d97706" if pct < 0.90 else "#dc2626")
            bar_pct = min(pct * 100, 100)
            budget_items += f"""
            <div style="margin-bottom:12px;padding:10px;border:1px solid #e2e8f0;border-radius:6px">
              <div style="display:flex;justify-content:space-between;font-size:13px;color:#1e293b;margin-bottom:4px">
                <strong>{b.get('name','')}</strong>
                <span style="color:{color}">{pct_display}</span>
              </div>
              <div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
                <div style="background:{color};height:8px;width:{bar_pct:.0f}%"></div>
              </div>
              <div style="font-size:11px;color:#94a3b8;margin-top:3px">
                ${b.get('last_spend') or 0:,.2f} de ${b.get('amount',0):,.2f} ({b.get('period','monthly')})
              </div>
            </div>
            """
        budgets_html = f"""
        <h3 style="color:#1e293b;font-size:15px;margin:24px 0 8px">Status dos Orçamentos</h3>
        {budget_items}
        """

    # Build FinOps section
    finops_html = ""
    if top_recs:
        recs_html = "".join(
            f"<li style='margin-bottom:6px;color:#475569;font-size:13px'>"
            f"{r.get('title','')} — <strong style='color:#16a34a'>economia estimada: ${r.get('saving',0):,.2f}/mês</strong></li>"
            for r in top_recs[:3]
        )
        finops_html = f"""
        <h3 style="color:#1e293b;font-size:15px;margin:24px 0 8px">Top Recomendações FinOps</h3>
        <p style="color:#64748b;font-size:13px;margin:0 0 8px">
          Economia total identificada: <strong style="color:#16a34a">${finops_savings:,.2f}/mês</strong>
        </p>
        <ul style="margin:0;padding-left:20px">{recs_html}</ul>
        """

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 4px;">Relatório de Custos Cloud</h2>
      <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px;">
        {org_name} · {ws_name} · {period_label}
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
      {costs_html}
      {budgets_html}
      {finops_html}
      <div style="text-align: center; margin: 32px 0;">
        <a href="{settings.FRONTEND_URL}/finops"
           style="display: inline-block; padding: 12px 32px; background-color: #3b82f6;
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Abrir CloudAtlas
        </a>
      </div>
      {_FOOTER}
    </div>
    """
    return _send_email(to_email, f"CloudAtlas — Relatório {period_label} · {org_name}", html)


# ── GDAP Invite ───────────────────────────────────────────────────────────────

_GDAP_ROLE_NAMES = {
    "729827e3-9c14-49f7-bb1b-9608f156bbb8": "Helpdesk Administrator",
    "f023fd81-a637-4b56-95fd-791ac0226033": "Service Support Administrator",
    "fe930be7-5e62-47db-91af-98c3a49a38b1": "User Administrator",
    "29232cdf-9323-42fd-afe2-4b33bb6ef9bb": "Exchange Administrator",
    "69091246-20e8-4a56-aa4d-066075b2a7a8": "Teams Administrator",
    "f28a1f50-f6e7-4571-818b-6a12f2af6b6c": "SharePoint Administrator",
    "194ae4cb-b126-40b2-bd5b-6091b380977d": "Security Administrator",
    "4d6ac14f-3453-41d0-bef9-a3e0c569773a": "License Administrator",
}


def send_gdap_invite_email(
    to_email: str,
    relationship_name: str,
    role_ids: list,
    invite_url: str,
    org_name: str,
) -> bool:
    """Send a GDAP delegation invite to a customer's Global Admin."""
    role_labels = [_GDAP_ROLE_NAMES.get(rid, rid) for rid in role_ids]
    roles_html = "".join(f"<li>{r}</li>" for r in role_labels) if role_labels else "<li>Roles configuradas</li>"
    html_body = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;">
      <div style="background:#1e293b;border-radius:12px;padding:32px;">
        <h1 style="color:#38bdf8;font-size:22px;margin:0 0 8px;">Convite de Administração Delegada</h1>
        <p style="color:#94a3b8;margin:0 0 24px;">{org_name} está solicitando acesso delegado ao seu tenant Microsoft 365.</p>
        <div style="background:#0f172a;border-radius:8px;padding:20px;margin-bottom:24px;">
          <p style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Relação</p>
          <p style="color:#f1f5f9;font-size:16px;font-weight:600;margin:0;">{relationship_name}</p>
        </div>
        <div style="background:#0f172a;border-radius:8px;padding:20px;margin-bottom:24px;">
          <p style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">Permissões solicitadas</p>
          <ul style="color:#cbd5e1;margin:0;padding-left:20px;line-height:1.8;">{roles_html}</ul>
        </div>
        <a href="{invite_url}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">Revisar e Aprovar Acesso →</a>
        <p style="color:#475569;font-size:12px;margin-top:24px;">⚠️ Este link expira em <strong>30 dias</strong>. Você deve ser o Administrador Global do seu tenant para aprovar.<br>Após aprovação, {org_name} terá acesso às permissões listadas acima.</p>
        <hr style="border:none;border-top:1px solid #334155;margin:24px 0;">
        <p style="color:#334155;font-size:11px;">Enviado via CloudAtlas por {org_name}</p>
      </div>
    </div>
    """
    return _send_email(to_email, f"[{org_name}] Convite de Administração Delegada M365 — {relationship_name}", html_body)


# ── Billing email templates ─────────────────────────────────────────────────


def _billing_base(title_icon: str, title: str, accent: str, body_content: str) -> str:
    """Shared billing email wrapper with professional dark header."""
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,{accent},#1e293b);padding:28px 32px;">
        <h1 style="color:#ffffff;font-size:20px;margin:0;">{title_icon} {title}</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:6px 0 0;">CloudAtlas — Gestão Multi-Cloud</p>
      </div>
      <div style="padding:32px;">
        {body_content}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;" />
        <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0;">
          Este email foi enviado automaticamente pelo CloudAtlas.<br>
          Em caso de dúvidas, entre em contato com nosso suporte.
        </p>
      </div>
    </div>
    """


def _fmt_brl(v: float) -> str:
    """Format as BRL currency string."""
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def send_billing_invoice_email(
    to_email: str,
    client_name: str,
    amount: float,
    period_type: str,
    period_ref: str,
    due_date: str | None,
    notes: str | None = None,
    payment_url: str | None = None,
) -> bool:
    """Send an invoice/billing notification email."""
    period_label = "Mensal" if period_type == "monthly" else "Anual"
    due_str = due_date if due_date else "Não definido"

    notes_html = ""
    if notes:
        notes_html = f"""
        <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin-top:20px;">
          <p style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Observações</p>
          <p style="color:#334155;font-size:14px;margin:0;white-space:pre-wrap;">{notes}</p>
        </div>
        """

    body = f"""
        <p style="color:#334155;font-size:15px;margin:0 0 24px;">
          Olá <strong>{client_name}</strong>,
        </p>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
          Segue abaixo os detalhes da sua cobrança:
        </p>

        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:14px 20px;color:#64748b;font-size:13px;">Valor</td>
              <td style="padding:14px 20px;text-align:right;color:#0f172a;font-size:18px;font-weight:700;">{_fmt_brl(amount)}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:14px 20px;color:#64748b;font-size:13px;">Período</td>
              <td style="padding:14px 20px;text-align:right;color:#334155;font-size:14px;font-weight:500;">{period_label} — {period_ref}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:14px 20px;color:#64748b;font-size:13px;">Vencimento</td>
              <td style="padding:14px 20px;text-align:right;color:#334155;font-size:14px;font-weight:500;">{due_str}</td>
            </tr>
            <tr>
              <td style="padding:14px 20px;color:#64748b;font-size:13px;">Status</td>
              <td style="padding:14px 20px;text-align:right;">
                <span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">Pendente</span>
              </td>
            </tr>
          </table>
        </div>

        {notes_html}

        <div style="text-align:center;margin-top:28px;">
          {'<a href="' + payment_url + '" style="display:inline-block;background:linear-gradient(135deg,#22c55e,#16a34a);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-weight:700;font-size:16px;letter-spacing:0.5px;">💳 Pagar via PIX</a>' if payment_url else '<a href="' + settings.FRONTEND_URL + '" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:14px;">Acessar Plataforma</a>'}
        </div>
        {'<p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:12px;">Clique no botão acima para realizar o pagamento de forma rápida e segura.</p>' if payment_url else ''}
    """

    html = _billing_base("💰", "Nova Cobrança", "#3b82f6", body)
    return _send_email(to_email, f"[CloudAtlas] Cobrança {period_label} — {period_ref} — {_fmt_brl(amount)}", html)


def send_billing_reminder_email(
    to_email: str,
    client_name: str,
    amount: float,
    period_ref: str,
    due_date: str | None,
    days_info: str = "",
    is_overdue: bool = False,
) -> bool:
    """Send a payment reminder (before due date or after overdue)."""
    accent = "#ef4444" if is_overdue else "#f59e0b"
    title = "Cobrança em Atraso" if is_overdue else "Lembrete de Vencimento"
    icon = "⚠️" if is_overdue else "🔔"
    due_str = due_date if due_date else "—"

    if is_overdue:
        message = f"Identificamos que a cobrança abaixo está <strong style='color:#ef4444;'>em atraso</strong>. Por favor, regularize o pagamento o mais breve possível."
    else:
        message = f"Este é um lembrete de que a cobrança abaixo <strong style='color:#f59e0b;'>vence em breve</strong>."

    body = f"""
        <p style="color:#334155;font-size:15px;margin:0 0 20px;">
          Olá <strong>{client_name}</strong>,
        </p>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
          {message}
        </p>

        <div style="background:#ffffff;border:2px solid {accent};border-radius:12px;padding:24px;text-align:center;">
          <p style="color:#64748b;font-size:13px;margin:0 0 8px;">Valor</p>
          <p style="color:#0f172a;font-size:28px;font-weight:800;margin:0 0 16px;">{_fmt_brl(amount)}</p>
          <div style="display:inline-block;background:{'#fef2f2' if is_overdue else '#fffbeb'};padding:8px 16px;border-radius:8px;">
            <span style="color:{accent};font-size:13px;font-weight:600;">
              Vencimento: {due_str} {f'— {days_info}' if days_info else ''}
            </span>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:12px 0 0;">Referência: {period_ref}</p>
        </div>

        <div style="text-align:center;margin-top:28px;">
          <a href="{settings.FRONTEND_URL}"
             style="display:inline-block;background:{accent};color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:14px;">
            {'Regularizar Pagamento' if is_overdue else 'Acessar Plataforma'}
          </a>
        </div>
    """

    html = _billing_base(icon, title, accent, body)
    subject_prefix = "ATRASO" if is_overdue else "LEMBRETE"
    return _send_email(to_email, f"[CloudAtlas] {subject_prefix} — Cobrança {period_ref} — {_fmt_brl(amount)}", html)


def send_billing_status_email(
    to_email: str,
    client_name: str,
    amount: float,
    period_ref: str,
    new_status: str,
    paid_at: str | None = None,
) -> bool:
    """Send a status change notification (payment confirmed, cancelled, etc)."""
    status_config = {
        "paid":      {"label": "Pagamento Confirmado", "icon": "✅", "accent": "#22c55e", "bg": "#f0fdf4", "text_color": "#166534"},
        "cancelled": {"label": "Cobrança Cancelada",   "icon": "❌", "accent": "#6b7280", "bg": "#f9fafb", "text_color": "#374151"},
        "overdue":   {"label": "Cobrança em Atraso",   "icon": "⚠️", "accent": "#ef4444", "bg": "#fef2f2", "text_color": "#991b1b"},
        "pending":   {"label": "Cobrança Reaberta",    "icon": "🔄", "accent": "#3b82f6", "bg": "#eff6ff", "text_color": "#1e40af"},
    }
    cfg = status_config.get(new_status, status_config["pending"])

    extra_info = ""
    if new_status == "paid" and paid_at:
        extra_info = f"""
        <tr>
          <td style="padding:12px 20px;color:#64748b;font-size:13px;">Pago em</td>
          <td style="padding:12px 20px;text-align:right;color:#334155;font-size:14px;">{paid_at}</td>
        </tr>
        """

    body = f"""
        <p style="color:#334155;font-size:15px;margin:0 0 24px;">
          Olá <strong>{client_name}</strong>,
        </p>

        <div style="background:{cfg['bg']};border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <p style="font-size:40px;margin:0 0 8px;">{cfg['icon']}</p>
          <p style="color:{cfg['text_color']};font-size:18px;font-weight:700;margin:0;">{cfg['label']}</p>
        </div>

        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:12px 20px;color:#64748b;font-size:13px;">Valor</td>
              <td style="padding:12px 20px;text-align:right;color:#0f172a;font-size:16px;font-weight:700;">{_fmt_brl(amount)}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:12px 20px;color:#64748b;font-size:13px;">Referência</td>
              <td style="padding:12px 20px;text-align:right;color:#334155;font-size:14px;">{period_ref}</td>
            </tr>
            {extra_info}
          </table>
        </div>

        <div style="text-align:center;margin-top:28px;">
          <a href="{settings.FRONTEND_URL}"
             style="display:inline-block;background:{cfg['accent']};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">
            Acessar Plataforma
          </a>
        </div>
    """

    html = _billing_base(cfg["icon"], cfg["label"], cfg["accent"], body)
    return _send_email(to_email, f"[CloudAtlas] {cfg['label']} — {period_ref} — {_fmt_brl(amount)}", html)


# ── Trial reminder ──────────────────────────────────────────────────────────


def send_trial_reminder_email(
    to_email: str,
    user_name: str,
    days_remaining: int,
    savings_found: float | None,
    trial_end_date: str,
) -> bool:
    """Send a trial expiry reminder email with optional FinOps savings summary."""
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Trial reminder not sent to %s.", to_email)
        return True

    # Color scheme based on urgency
    if days_remaining <= 1:
        accent, bg, label = "#dc2626", "#fef2f2", "Último dia"
        header_text = "Seu trial Pro termina hoje!"
    elif days_remaining <= 3:
        accent, bg, label = "#f59e0b", "#fffbeb", "3 dias"
        header_text = f"Seu trial Pro termina em {days_remaining} dias"
    else:
        accent, bg, label = "#22c55e", "#f0fdf4", "7 dias"
        header_text = f"Seu trial Pro termina em {days_remaining} dias"

    # Savings card (only if FinOps found savings)
    savings_html = ""
    if savings_found and savings_found > 0:
        savings_html = f"""
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="color: #166534; font-size: 13px; margin: 0 0 4px 0; font-weight: 600;">
            💰 Economia encontrada pelo Cloud Atlas
          </p>
          <p style="color: #15803d; font-size: 24px; font-weight: 700; margin: 0;">
            ${savings_found:,.2f}<span style="font-size: 13px; font-weight: 400;">/mês</span>
          </p>
          <p style="color: #166534; font-size: 12px; margin: 4px 0 0 0;">
            em recomendações de otimização de custos identificadas
          </p>
        </div>
        """

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 0;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, {accent}, {accent}cc); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <p style="color: rgba(255,255,255,0.9); font-size: 13px; margin: 0 0 4px 0;">⏳ TRIAL PRO — {label}</p>
        <h1 style="color: #ffffff; font-size: 22px; margin: 0;">{header_text}</h1>
      </div>

      <!-- Body -->
      <div style="padding: 24px 32px; background: #ffffff;">
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Olá <strong>{user_name}</strong>,
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Seu período de trial do plano <strong>Pro</strong> termina em
          <strong style="color: {accent};">{trial_end_date}</strong>.
          Após essa data, sua organização voltará ao plano Free com recursos limitados.
        </p>

        {savings_html}

        <div style="background: {bg}; border: 1px solid {accent}33; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="color: #334155; font-size: 13px; margin: 0; font-weight: 600;">
            O que você perde ao expirar:
          </p>
          <ul style="color: #475569; font-size: 13px; margin: 8px 0 0 0; padding-left: 20px; line-height: 1.8;">
            <li>FinOps — orçamentos, scans e relatórios automáticos</li>
            <li>Advisor — recomendações de custo, segurança e performance</li>
            <li>Agendamentos — start/stop automático de recursos</li>
            <li>Webhooks — integrações com Teams, Slack e mais</li>
            <li>Limites ampliados — até 10 workspaces e 20 contas cloud</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="{settings.FRONTEND_URL}/billing"
             style="display: inline-block; padding: 14px 40px; background-color: {accent};
                    color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700;
                    font-size: 15px;">
            Fazer upgrade agora
          </a>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          Plano Pro a partir de R$ 497/mês
        </p>
      </div>

      <!-- Footer -->
      <div style="padding: 16px 32px; background: #f8fafc; border-radius: 0 0 12px 12px;">
        {_FOOTER}
      </div>
    </div>
    """
    subject = f"CloudAtlas — Seu trial Pro termina em {days_remaining} dia{'s' if days_remaining != 1 else ''}"
    return _send_email(to_email, subject, html)
