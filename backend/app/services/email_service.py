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
