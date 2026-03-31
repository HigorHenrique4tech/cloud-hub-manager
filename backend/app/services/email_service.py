import smtplib
import logging
import time
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Per-email cooldown (prevents email spam regardless of IP) ────────────────
# Tracks last send time per (email, category) to enforce minimum intervals.

_email_cooldowns: dict[str, float] = {}
_cooldown_lock = threading.Lock()

# Cooldown windows in seconds per email category
_COOLDOWN_SECONDS = {
    "otp": 60,              # 1 OTP per minute per email
    "verification": 60,     # 1 verification per minute per email
    "password_reset": 60,   # 1 reset per minute per email
    "default": 10,          # General emails: 10s cooldown
}

# Maximum entries before cleanup (prevent unbounded memory growth)
_MAX_COOLDOWN_ENTRIES = 10_000


def _cleanup_cooldowns():
    """Remove entries older than 5 minutes to prevent memory leak."""
    cutoff = time.monotonic() - 300
    expired = [k for k, v in _email_cooldowns.items() if v < cutoff]
    for k in expired:
        del _email_cooldowns[k]


def check_email_cooldown(email: str, category: str = "default") -> bool:
    """Check if we can send an email to this address in this category.
    Returns True if allowed, False if rate-limited."""
    key = f"{email.lower()}:{category}"
    window = _COOLDOWN_SECONDS.get(category, _COOLDOWN_SECONDS["default"])
    now = time.monotonic()

    with _cooldown_lock:
        if len(_email_cooldowns) > _MAX_COOLDOWN_ENTRIES:
            _cleanup_cooldowns()

        last_sent = _email_cooldowns.get(key)
        if last_sent and (now - last_sent) < window:
            logger.warning("Email cooldown active for %s (category=%s)", email, category)
            return False
        _email_cooldowns[key] = now
        return True


# ── Internal SMTP sender ────────────────────────────────────────────────────

def _send_email(to_email: str, subject: str, html_body: str, sender_name: str = "CloudAtlas") -> bool:
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
        msg["From"] = f"{sender_name} <{settings.SMTP_FROM}>"
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


def _branded_footer(branding: dict = None) -> str:
    """Return footer HTML with optional white-label branding."""
    if not branding:
        return _FOOTER
    name = branding.get("platform_name", "CloudAtlas")
    powered = ""
    if branding.get("powered_by", True):
        powered = " · Powered by CloudAtlas"
    return f"""
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="color: #cbd5e1; font-size: 11px; text-align: center;">
      {name} — Gerenciamento multi-cloud centralizado{powered}
    </p>
    """


def _brand_name(branding: dict = None) -> str:
    """Return platform name from branding or default."""
    if branding:
        return branding.get("platform_name", "CloudAtlas")
    return "CloudAtlas"


def _brand_color(branding: dict = None) -> str:
    """Return primary color from branding or default."""
    if branding:
        return branding.get("color_primary", "#3b82f6")
    return "#3b82f6"


def _brand_sender(branding: dict = None) -> str:
    """Return email sender name from branding or default."""
    if branding:
        return branding.get("email_sender_name", "CloudAtlas")
    return "CloudAtlas"


def send_verification_email(to_email: str, user_name: str, token: str, branding: dict = None) -> bool:
    """Send an email verification link."""
    verify_url = f"{settings.FRONTEND_URL}/verify/{token}"

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Verification link: %s", verify_url)
        return True

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Bem-vindo ao {_brand_name(branding)}!</h2>
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
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(to_email, f"{_brand_name(branding)} — Confirme seu email", html, sender_name=_brand_sender(branding))


def send_invite_email(
    to_email: str,
    org_name: str,
    inviter_name: str,
    role: str,
    token: str,
    branding: dict = None,
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
        <strong>{org_name}</strong> no {_brand_name(branding)} como <strong>{role_label}</strong>.
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
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(to_email, f"{_brand_name(branding)} — Convite para {org_name}", html, sender_name=_brand_sender(branding))


def send_org_member_added_email(
    to_email: str,
    user_name: str,
    org_name: str,
    role: str,
    inviter_name: str,
    branding: dict = None,
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
        <strong>{org_name}</strong> no {_brand_name(branding)} como <strong>{role_label}</strong>.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{dashboard_url}"
           style="display: inline-block; padding: 12px 32px; background-color: #3b82f6;
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Acessar o {_brand_name(branding)}
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(to_email, f"{_brand_name(branding)} — Você foi adicionado a {org_name}", html, sender_name=_brand_sender(branding))


def send_otp_email(to_email: str, user_name: str, otp_code: str, branding: dict = None) -> bool:
    """Send a 6-digit OTP code for MFA login verification."""
    subject = f"Seu código de verificação — {_brand_name(branding)}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Verificação em dois fatores</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        Use o código abaixo para completar seu login no {_brand_name(branding)}:
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
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(to_email, subject, html, sender_name=_brand_sender(branding))


def send_alert_email(
    to_email: str,
    user_name: str,
    alert_name: str,
    provider: str,
    current_value: str,
    threshold: str,
    branding: dict = None,
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
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(to_email, f"{_brand_name(branding)} — Alerta: {alert_name}", html, sender_name=_brand_sender(branding))


def send_budget_alert_email(
    to_email: str,
    user_name: str,
    budget_name: str,
    provider: str,
    current_spend: float,
    budget_amount: float,
    pct: float,
    branding: dict = None,
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
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(to_email, f"{_brand_name(branding)} — Orçamento '{budget_name}' em alerta ({pct_display})", html, sender_name=_brand_sender(branding))


def send_report_email(
    to_email: str,
    org_name: str,
    ws_name: str,
    period_label: str,
    report_data: dict,
    branding: dict = None,
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
          Abrir {_brand_name(branding)}
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(to_email, f"{_brand_name(branding)} — Relatório {period_label} · {org_name}", html, sender_name=_brand_sender(branding))


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
    branding: dict = None,
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
        <p style="color:#334155;font-size:11px;">Enviado via {_brand_name(branding)} por {org_name}</p>
      </div>
    </div>
    """
    return _send_email(to_email, f"[{org_name}] Convite de Administração Delegada M365 — {relationship_name}", html_body, sender_name=_brand_sender(branding))


# ── Billing email templates ─────────────────────────────────────────────────


def _billing_base(title_icon: str, title: str, accent: str, body_content: str, branding: dict = None) -> str:
    """Shared billing email wrapper with professional dark header."""
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,{accent},#1e293b);padding:28px 32px;">
        <h1 style="color:#ffffff;font-size:20px;margin:0;">{title_icon} {title}</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:6px 0 0;">{_brand_name(branding)} — Gestão Multi-Cloud</p>
      </div>
      <div style="padding:32px;">
        {body_content}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;" />
        <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0;">
          Este email foi enviado automaticamente pelo {_brand_name(branding)}.<br>
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
    branding: dict = None,
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

    html = _billing_base("💰", "Nova Cobrança", "#3b82f6", body, branding)
    return _send_email(to_email, f"[{_brand_name(branding)}] Cobrança {period_label} — {period_ref} — {_fmt_brl(amount)}", html, sender_name=_brand_sender(branding))


def send_billing_reminder_email(
    to_email: str,
    client_name: str,
    amount: float,
    period_ref: str,
    due_date: str | None,
    days_info: str = "",
    is_overdue: bool = False,
    branding: dict = None,
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

    html = _billing_base(icon, title, accent, body, branding)
    subject_prefix = "ATRASO" if is_overdue else "LEMBRETE"
    return _send_email(to_email, f"[{_brand_name(branding)}] {subject_prefix} — Cobrança {period_ref} — {_fmt_brl(amount)}", html, sender_name=_brand_sender(branding))


def send_billing_status_email(
    to_email: str,
    client_name: str,
    amount: float,
    period_ref: str,
    new_status: str,
    paid_at: str | None = None,
    branding: dict = None,
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

    html = _billing_base(cfg["icon"], cfg["label"], cfg["accent"], body, branding)
    return _send_email(to_email, f"[{_brand_name(branding)}] {cfg['label']} — {period_ref} — {_fmt_brl(amount)}", html, sender_name=_brand_sender(branding))


# ── Trial reminder ──────────────────────────────────────────────────────────


def send_trial_reminder_email(
    to_email: str,
    user_name: str,
    days_remaining: int,
    savings_found: float | None,
    trial_end_date: str,
    branding: dict = None,
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
            💰 Economia encontrada pelo {_brand_name(branding)}
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
        {_branded_footer(branding)}
      </div>
    </div>
    """
    subject = f"{_brand_name(branding)} — Seu trial Pro termina em {days_remaining} dia{'s' if days_remaining != 1 else ''}"
    return _send_email(to_email, subject, html, sender_name=_brand_sender(branding))


# ── Welcome (post-verification) ─────────────────────────────────────────────


def send_welcome_email(to_email: str, user_name: str, branding: dict = None) -> bool:
    """Send a welcome email after email verification."""
    color = _brand_color(branding)
    name = _brand_name(branding)
    dashboard_url = f"{settings.FRONTEND_URL}/"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Conta ativada com sucesso! 🎉</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        Seu email foi verificado e sua conta no <strong>{name}</strong> está pronta para uso.
      </p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: #166534; font-size: 14px; margin: 0 0 8px 0; font-weight: 600;">Próximos passos:</p>
        <ol style="color: #166534; font-size: 13px; margin: 0; padding-left: 20px;">
          <li>Conecte sua primeira conta cloud (AWS, Azure ou GCP)</li>
          <li>Explore o dashboard de recursos</li>
          <li>Configure alertas de custo</li>
        </ol>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{dashboard_url}"
           style="display: inline-block; padding: 12px 32px; background-color: {color};
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Acessar meu painel
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(to_email, f"{name} — Conta ativada!", html, sender_name=_brand_sender(branding))


# ── Schedule Failed ──────────────────────────────────────────────────────────


def send_schedule_failed_email(
    to_email: str,
    user_name: str,
    resource_name: str,
    action: str,
    provider: str,
    error_message: str,
    branding: dict = None,
) -> bool:
    """Notify user that a scheduled action (start/stop) failed."""
    action_label = "iniciar" if action == "start" else "parar"
    color = _brand_color(branding)

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #dc2626; margin-bottom: 8px;">Agendamento Falhou</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        A ação agendada para <strong>{action_label}</strong> o recurso
        <strong>{resource_name}</strong> ({provider.upper()}) falhou.
      </p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: #991b1b; font-size: 13px; margin: 0;">
          <strong>Erro:</strong> {error_message[:200]}
        </p>
      </div>
      <p style="color: #64748b; font-size: 13px;">
        Verifique se as credenciais da conta cloud estão válidas e se o recurso ainda existe.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{settings.FRONTEND_URL}/schedules"
           style="display: inline-block; padding: 12px 32px; background-color: {color};
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Ver agendamentos
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(
        to_email,
        f"{_brand_name(branding)} — Falha no agendamento: {resource_name}",
        html,
        sender_name=_brand_sender(branding),
    )


# ── Migration365 ─────────────────────────────────────────────────────────────


def send_migration_completed_email(
    to_email: str,
    user_name: str,
    project_name: str,
    completed_count: int,
    failed_count: int,
    project_id: str,
    branding: dict = None,
) -> bool:
    """Notifica o responsável quando um projeto de migração é concluído."""
    color = _brand_color(branding)
    has_failures = failed_count > 0
    status_color = "#f59e0b" if has_failures else "#10b981"
    status_label = "Concluído com falhas" if has_failures else "Concluído com sucesso"
    status_icon = "⚠️" if has_failures else "✅"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: {status_color}; margin-bottom: 8px;">{status_icon} Migração {status_label}</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        O projeto <strong>{project_name}</strong> finalizou o processo de migração.
      </p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; font-size: 14px; color: #374151;">
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Caixas migradas</td>
            <td style="text-align: right; font-weight: 600; color: #10b981;">{completed_count}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Caixas com falha</td>
            <td style="text-align: right; font-weight: 600; color: {'#ef4444' if failed_count > 0 else '#10b981'};">{failed_count}</td>
          </tr>
        </table>
      </div>
      {"<p style='color: #92400e; font-size: 13px; background: #fef3c7; border-radius: 6px; padding: 10px;'>Algumas caixas falharam. Acesse o projeto para retentar ou verificar os erros.</p>" if has_failures else ""}
      <div style="text-align: center; margin: 24px 0;">
        <a href="{settings.FRONTEND_URL}/m365/migration/{project_id}"
           style="display: inline-block; padding: 12px 32px; background-color: {color};
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Ver projeto
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    subject_status = "com falhas" if has_failures else "com sucesso"
    return _send_email(
        to_email,
        f"{_brand_name(branding)} — Migração concluída {subject_status}: {project_name}",
        html,
        sender_name=_brand_sender(branding),
    )


# ── FinOps Scan Results ──────────────────────────────────────────────────────


def send_finops_scan_email(
    to_email: str,
    user_name: str,
    findings_count: int,
    total_savings: float,
    top_findings: list,
    branding: dict = None,
) -> bool:
    """Notify user about FinOps scan results with potential savings."""
    color = _brand_color(branding)

    rows = ""
    for f in top_findings[:5]:
        rows += f"""
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155;">{f.get('resource_name', '—')}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155;">{f.get('recommendation_type', '—')}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #16a34a; font-weight: 600;">
            ${f.get('estimated_saving_monthly', 0):.2f}/mês
          </td>
        </tr>
        """

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Scan FinOps Concluído</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        O scan automático encontrou <strong>{findings_count} recomendação(ões)</strong>
        com economia potencial de <strong style="color: #16a34a;">${total_savings:.2f}/mês</strong>.
      </p>
      {f'''
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <thead>
          <tr style="background: #f8fafc;">
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #64748b; border-bottom: 2px solid #e2e8f0;">Recurso</th>
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #64748b; border-bottom: 2px solid #e2e8f0;">Ação</th>
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #64748b; border-bottom: 2px solid #e2e8f0;">Economia</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      ''' if rows else ''}
      <div style="text-align: center; margin: 24px 0;">
        <a href="{settings.FRONTEND_URL}/finops"
           style="display: inline-block; padding: 12px 32px; background-color: {color};
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Ver recomendações
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(
        to_email,
        f"{_brand_name(branding)} — {findings_count} oportunidades de economia encontradas",
        html,
        sender_name=_brand_sender(branding),
    )


# ── Approval Pending ─────────────────────────────────────────────────────────


def send_approval_pending_email(
    to_email: str,
    approver_name: str,
    requester_name: str,
    action_type: str,
    resource_name: str,
    branding: dict = None,
) -> bool:
    """Notify admin/owner that an approval request is pending."""
    color = _brand_color(branding)
    action_label = action_type.replace("_", " ").title()

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #f59e0b; margin-bottom: 8px;">Aprovação Pendente</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {approver_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        <strong>{requester_name}</strong> solicitou aprovação para executar uma ação:
      </p>
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: #92400e; font-size: 14px; margin: 0;">
          <strong>Ação:</strong> {action_label}<br/>
          <strong>Recurso:</strong> {resource_name}
        </p>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{settings.FRONTEND_URL}/approvals"
           style="display: inline-block; padding: 12px 32px; background-color: {color};
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Revisar solicitação
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(
        to_email,
        f"{_brand_name(branding)} — Aprovação pendente: {resource_name}",
        html,
        sender_name=_brand_sender(branding),
    )


# ── Approval Resolved ────────────────────────────────────────────────────────


def send_approval_resolved_email(
    to_email: str,
    requester_name: str,
    action_type: str,
    resource_name: str,
    approved: bool,
    resolver_name: str,
    notes: str = None,
    branding: dict = None,
) -> bool:
    """Notify requester that their approval was approved or rejected."""
    status = "Aprovada" if approved else "Rejeitada"
    bg = "#f0fdf4" if approved else "#fef2f2"
    border = "#bbf7d0" if approved else "#fecaca"
    text_color = "#166534" if approved else "#991b1b"
    color = _brand_color(branding)
    action_label = action_type.replace("_", " ").title()

    notes_html = ""
    if notes:
        notes_html = f'<p style="color: {text_color}; font-size: 13px; margin-top: 8px;"><strong>Observação:</strong> {notes}</p>'

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: {text_color}; margin-bottom: 8px;">Solicitação {status}</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {requester_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        Sua solicitação foi <strong>{status.lower()}</strong> por <strong>{resolver_name}</strong>.
      </p>
      <div style="background: {bg}; border: 1px solid {border}; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: {text_color}; font-size: 14px; margin: 0;">
          <strong>Ação:</strong> {action_label}<br/>
          <strong>Recurso:</strong> {resource_name}
        </p>
        {notes_html}
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{settings.FRONTEND_URL}/approvals"
           style="display: inline-block; padding: 12px 32px; background-color: {color};
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Ver aprovações
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(
        to_email,
        f"{_brand_name(branding)} — Solicitação {status.lower()}: {resource_name}",
        html,
        sender_name=_brand_sender(branding),
    )


# ── Partner Org Created ──────────────────────────────────────────────────────


def send_partner_org_created_email(
    to_email: str,
    user_name: str,
    partner_org_name: str,
    master_org_name: str,
    branding: dict = None,
) -> bool:
    """Notify user that a new partner org was created under the master."""
    color = _brand_color(branding)

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">Nova Organização Parceira</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        A organização parceira <strong>{partner_org_name}</strong> foi criada
        sob <strong>{master_org_name}</strong>.
      </p>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: #1e40af; font-size: 14px; margin: 0;">
          Você foi adicionado como <strong>Owner</strong> desta organização.
          Um workspace padrão já foi criado.
        </p>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{settings.FRONTEND_URL}/"
           style="display: inline-block; padding: 12px 32px; background-color: {color};
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Acessar organização
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(
        to_email,
        f"{_brand_name(branding)} — Organização '{partner_org_name}' criada",
        html,
        sender_name=_brand_sender(branding),
    )


# ── Account Disconnected ─────────────────────────────────────────────────────


def send_account_disconnected_email(
    to_email: str,
    user_name: str,
    provider: str,
    account_label: str,
    error_detail: str,
    branding: dict = None,
) -> bool:
    """Notify user that a cloud account failed its health check."""
    color = _brand_color(branding)

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #dc2626; margin-bottom: 8px;">Conta Cloud Desconectada</h2>
      <p style="color: #64748b; font-size: 14px;">Olá {user_name},</p>
      <p style="color: #64748b; font-size: 14px;">
        A conta <strong>{account_label}</strong> ({provider.upper()}) não está respondendo.
      </p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: #991b1b; font-size: 13px; margin: 0;">
          <strong>Erro:</strong> {error_detail[:200]}
        </p>
      </div>
      <p style="color: #64748b; font-size: 13px;">
        Enquanto a conexão estiver inativa, dados de custo, inventário e agendamentos desta conta
        não serão atualizados. Verifique se as credenciais ainda são válidas.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{settings.FRONTEND_URL}/workspace"
           style="display: inline-block; padding: 12px 32px; background-color: {color};
                  color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                  font-size: 14px;">
          Verificar contas cloud
        </a>
      </div>
      {_branded_footer(branding)}
    </div>
    """
    return _send_email(
        to_email,
        f"{_brand_name(branding)} — Conta {provider.upper()} desconectada: {account_label}",
        html,
        sender_name=_brand_sender(branding),
    )


# ── Test Branding Email ─────────────────────────────────────────────────────


def send_test_branding_email(to_email: str, user_name: str, branding: dict = None) -> bool:
    """Send a test email so the org owner can preview their white-label branding."""
    color = _brand_color(branding)
    name = _brand_name(branding)
    accent = branding.get("color_accent", "#0EA5E9") if branding else "#0EA5E9"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, {color}, {accent}); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">{name}</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 13px;">Teste de e-mail — White Label</p>
      </div>
      <div style="background: #ffffff; padding: 28px 24px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #334155; font-size: 14px; margin: 0 0 12px;">Olá <strong>{user_name}</strong>,</p>
        <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
          Este é um e-mail de teste para que você possa verificar como ficará a aparência
          dos e-mails enviados pela plataforma <strong>{name}</strong> com a sua personalização White Label.
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="color: #475569; font-size: 13px; margin: 0 0 8px; font-weight: 600;">O que está sendo testado:</p>
          <ul style="color: #64748b; font-size: 13px; margin: 0; padding-left: 18px; line-height: 1.8;">
            <li>Nome da plataforma: <strong style="color: {color};">{name}</strong></li>
            <li>Cor primária: <span style="display: inline-block; width: 12px; height: 12px; background: {color}; border-radius: 3px; vertical-align: middle;"></span> <code style="font-size: 12px;">{color}</code></li>
            <li>Cor accent: <span style="display: inline-block; width: 12px; height: 12px; background: {accent}; border-radius: 3px; vertical-align: middle;"></span> <code style="font-size: 12px;">{accent}</code></li>
            <li>Nome do remetente: <strong>{_brand_sender(branding)}</strong></li>
            <li>Powered by: <strong>{"Sim" if (branding or {{}}).get("powered_by", True) else "Não"}</strong></li>
          </ul>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{settings.FRONTEND_URL}/"
             style="display: inline-block; padding: 12px 32px; background-color: {color};
                    color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;
                    font-size: 14px;">
            Acessar {name}
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 16px 0 0;">
          Se você recebeu este e-mail, a configuração de envio está funcionando corretamente.
        </p>
      </div>
      <div style="padding: 16px; text-align: center;">
        {_branded_footer(branding)}
      </div>
    </div>
    """
    return _send_email(
        to_email,
        f"{name} — E-mail de teste White Label",
        html,
        sender_name=_brand_sender(branding),
    )


def send_guest_invite_email(
    to_email: str,
    guest_name: str,
    redeem_url: str,
    inviter_name: str = "",
    custom_message: str = "",
    tenant_name: str = "",
    branding: dict = None,
) -> bool:
    """Send a guest invitation email with the Entra ID redeem link."""
    name = _brand_name(branding)
    color = _brand_color(branding)
    inviter = inviter_name or name

    message_block = ""
    if custom_message:
        message_block = f"""
        <div style="background: #f8fafc; border-left: 3px solid {color}; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
          <p style="color: #64748b; font-size: 12px; margin: 0 0 4px;">Mensagem de {inviter}:</p>
          <p style="color: #334155; font-size: 14px; margin: 0;">{custom_message}</p>
        </div>
        """

    tenant_line = ""
    if tenant_name:
        tenant_line = f" do tenant <strong>{tenant_name}</strong>"

    html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, {color}, #0ea5e9); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; font-size: 20px; margin: 0;">Convite de Colaboração</h1>
      </div>
      <div style="background: #ffffff; padding: 28px 24px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 12px;">
          Olá{(' ' + guest_name) if guest_name else ''},
        </p>
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
          <strong>{inviter}</strong> convidou você para colaborar como usuário convidado{tenant_line}.
        </p>
        {message_block}
        <p style="color: #334155; font-size: 14px; margin: 0 0 20px;">
          Clique no botão abaixo para aceitar o convite e acessar os recursos compartilhados:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{redeem_url}" style="display: inline-block; background: {color}; color: #ffffff;
             font-weight: 600; font-size: 15px; padding: 12px 32px; border-radius: 8px;
             text-decoration: none;">
            Aceitar Convite
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 16px 0 0;">
          Se o botão não funcionar, copie e cole este link no navegador:<br/>
          <a href="{redeem_url}" style="color: {color}; word-break: break-all; font-size: 11px;">{redeem_url}</a>
        </p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 12px;">
        {_branded_footer(branding)}
      </div>
    </div>
    """
    return _send_email(
        to_email,
        f"{name} — Convite de Colaboração",
        html,
        sender_name=_brand_sender(branding),
    )
