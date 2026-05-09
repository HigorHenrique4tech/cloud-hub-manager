import smtplib
import logging
import time
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Per-email cooldown (prevents email spam regardless of IP) ────────────────
_email_cooldowns: dict[str, float] = {}
_cooldown_lock = threading.Lock()

_COOLDOWN_SECONDS = {
    "otp": 60,
    "verification": 60,
    "password_reset": 60,
    "default": 10,
}

_MAX_COOLDOWN_ENTRIES = 10_000


def _cleanup_cooldowns():
    cutoff = time.monotonic() - 300
    expired = [k for k, v in _email_cooldowns.items() if v < cutoff]
    for k in expired:
        del _email_cooldowns[k]


def check_email_cooldown(email: str, category: str = "default") -> bool:
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


# ── Internal SMTP sender ─────────────────────────────────────────────────────

def _send_email(to_email: str, subject: str, html_body: str, sender_name: str = "CloudAtlas") -> bool:
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Email to %s not sent.", to_email)
        return True
    # Defense-in-depth against header injection: any CRLF in fields that flow
    # into headers (Subject, From, To) is sanitized to a single space.
    def _hdr(v: str) -> str:
        if v is None:
            return ""
        return str(v).replace("\r", " ").replace("\n", " ").strip()
    subject = _hdr(subject)
    sender_name = _hdr(sender_name) or "CloudAtlas"
    to_email = _hdr(to_email)
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{sender_name} <{settings.SMTP_FROM}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))
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


# ── Branding helpers ─────────────────────────────────────────────────────────

def _brand_name(branding: dict = None) -> str:
    return (branding or {}).get("platform_name", "CloudAtlas")

def _brand_color(branding: dict = None) -> str:
    return (branding or {}).get("color_primary", "#2563EB")

def _brand_sender(branding: dict = None) -> str:
    return (branding or {}).get("email_sender_name", "CloudAtlas")


# ── Base email template ──────────────────────────────────────────────────────

def _email_base(
    *,
    platform: str,
    color: str,
    icon: str,
    title: str,
    body_html: str,
    subtitle: str = "",
    branding: dict = None,
) -> str:
    """
    Unified base template — table-based for Outlook/Gmail/Apple Mail compatibility.
    White card on gray background, colored header band, consistent footer.
    """
    subtitle_row = (
        f'<p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">{subtitle}</p>'
        if subtitle else ""
    )

    # Logo: only render when the org is actually white-labeled and provided one.
    # The branding URL is relative (e.g. "/api/v1/orgs/<slug>/branding/logo-light"),
    # so we prefix with FRONTEND_URL to give email clients an absolute URL.
    logo_block = ""
    b = branding or {}
    if b.get("is_white_labeled") and b.get("logo_light_url"):
        logo_url = b["logo_light_url"]
        if logo_url.startswith("/"):
            logo_url = f"{settings.FRONTEND_URL.rstrip('/')}{logo_url}"
        logo_block = (
            f'<img src="{logo_url}" alt="{platform}" height="36" '
            f'style="display:block;max-height:36px;margin:0 0 12px;border:0;outline:none;'
            f'text-decoration:none;background:transparent;">'
        )

    powered = ""
    if b.get("powered_by", True):
        powered = '<p style="margin:4px 0 0;font-size:10px;color:#CBD5E1;">Powered by CloudAtlas</p>'

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px;" role="presentation">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;" role="presentation">

      <!-- Card -->
      <tr><td style="background:#ffffff;border-radius:16px;overflow:hidden;
                     box-shadow:0 4px 32px rgba(0,0,0,0.10);mso-border-radius:16px;">

        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="background:{color};padding:28px 32px;border-radius:16px 16px 0 0;">
              {logo_block}
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.65);letter-spacing:1px;
                        text-transform:uppercase;font-weight:600;">{platform}</p>
              <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;
                         letter-spacing:-0.3px;line-height:1.3;">{icon}&nbsp; {title}</h1>
              {subtitle_row}
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                       Helvetica,Arial,sans-serif;font-size:15px;color:#334155;line-height:1.6;">
              {body_html}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:20px 32px;
                       text-align:center;border-radius:0 0 16px 16px;">
              <p style="margin:0;font-size:12px;font-weight:700;color:{color};">{platform}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#94A3B8;line-height:1.5;">
                Este email foi gerado automaticamente. Por favor, não responda a este email.
              </p>
              {powered}
            </td>
          </tr>
        </table>

      </td></tr>
    </table>

  </td></tr>
</table>
</body>
</html>"""


# ── Reusable HTML components ─────────────────────────────────────────────────

def _info_table(*rows: tuple) -> str:
    """Rows of (label, value) pairs in a clean bordered table."""
    cells = ""
    for i, (label, value) in enumerate(rows):
        border = "border-bottom:1px solid #F1F5F9;" if i < len(rows) - 1 else ""
        cells += f"""
        <tr style="{border}">
          <td style="padding:13px 20px;color:#64748B;font-size:13px;white-space:nowrap;">{label}</td>
          <td style="padding:13px 20px;text-align:right;color:#0F172A;font-size:14px;font-weight:600;">{value}</td>
        </tr>"""
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;margin:20px 0;">
      {cells}
    </table>"""


def _alert_box(content: str, bg: str, border: str, text_color: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:{bg};border:1px solid {border};border-radius:10px;margin:20px 0;">
      <tr><td style="padding:16px 20px;color:{text_color};font-size:14px;line-height:1.6;">
        {content}
      </td></tr>
    </table>"""


def _cta_button(url: str, label: str, color: str) -> str:
    return f"""
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px auto 0;">
      <tr>
        <td style="background:{color};border-radius:10px;">
          <a href="{url}" target="_blank"
             style="display:inline-block;padding:14px 36px;font-family:-apple-system,BlinkMacSystemFont,
                    'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;
                    text-decoration:none;letter-spacing:0.2px;">{label} &rarr;</a>
        </td>
      </tr>
    </table>"""


def _progress_bar(pct: float, color: str) -> str:
    filled = min(pct * 100, 100)
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#E2E8F0;border-radius:6px;overflow:hidden;margin:8px 0;">
      <tr>
        <td style="width:{filled:.0f}%;background:{color};height:10px;border-radius:6px;
                   line-height:10px;font-size:0;">&nbsp;</td>
        <td style="width:{100-filled:.0f}%;height:10px;line-height:10px;font-size:0;">&nbsp;</td>
      </tr>
    </table>"""


def _fmt_brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ── Email templates ──────────────────────────────────────────────────────────

def send_email_change_confirmation(to_email: str, user_name: str, token: str, branding: dict = None) -> bool:
    """Confirmation link sent to the *new* email address during email change."""
    confirm_url = f"{settings.FRONTEND_URL}/email-change/confirm/{token}"
    platform = _brand_name(branding)
    color = _brand_color(branding)

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Email change confirmation link: %s", confirm_url)
        return True

    body = f"""
    <p style="margin:0 0 8px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 24px;">
      Recebemos uma solicitação para alterar o email de acesso da sua conta no
      <strong>{platform}</strong> para este endereço. Confirme abaixo para concluir:
    </p>
    {_cta_button(confirm_url, "Confirmar novo email", color)}
    <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Se o botão não funcionar, copie e cole este link no navegador:<br/>
      <a href="{confirm_url}" style="color:{color};word-break:break-all;">{confirm_url}</a>
    </p>
    <p style="margin:12px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Este link expira em <strong>24 horas</strong>. Se você não solicitou esta alteração, ignore este email.
    </p>"""

    html = _email_base(platform=platform, color=color, icon="✉️",
                       title="Confirme seu novo email",
                       subtitle=f"Alteração de email — {platform}",
                       body_html=body, branding=branding)
    return _send_email(to_email, f"{platform} — Confirme seu novo email", html,
                       sender_name=_brand_sender(branding))


def send_email_change_notification(to_email: str, user_name: str, new_email: str, branding: dict = None) -> bool:
    """Notification to the *previous* email address after a change is confirmed."""
    platform = _brand_name(branding)
    color = _brand_color(branding)

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Email change notification suppressed.")
        return True

    support_email = "suporte@cloudatlas.app.br"
    body = f"""
    <p style="margin:0 0 8px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 16px;">
      O email de acesso da sua conta no <strong>{platform}</strong> foi alterado para
      <strong>{new_email}</strong>.
    </p>
    {_alert_box(
        f"Se foi você quem solicitou, nenhuma ação é necessária. "
        f"Se NÃO foi você, entre em contato imediatamente com {support_email}.",
        "#FEF3C7", "#FCD34D", "#92400E"
    )}
    <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Por segurança, todas as sessões ativas foram encerradas e será necessário fazer login novamente.
    </p>"""

    html = _email_base(platform=platform, color=color, icon="🔔",
                       title="Email da conta alterado",
                       subtitle=f"Notificação de segurança — {platform}",
                       body_html=body, branding=branding)
    return _send_email(to_email, f"{platform} — Email da conta alterado", html,
                       sender_name=_brand_sender(branding))


def send_verification_email(to_email: str, user_name: str, token: str, branding: dict = None) -> bool:
    verify_url = f"{settings.FRONTEND_URL}/verify/{token}"
    platform = _brand_name(branding)
    color = _brand_color(branding)

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Verification link: %s", verify_url)
        return True

    body = f"""
    <p style="margin:0 0 8px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 24px;">
      Para ativar sua conta no <strong>{platform}</strong>, confirme seu endereço de email
      clicando no botão abaixo:
    </p>
    {_cta_button(verify_url, "Confirmar meu email", color)}
    <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Se o botão não funcionar, copie e cole este link no navegador:<br/>
      <a href="{verify_url}" style="color:{color};word-break:break-all;">{verify_url}</a>
    </p>
    <p style="margin:12px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Este link expira em <strong>24 horas</strong>.
    </p>"""

    html = _email_base(platform=platform, color=color, icon="✉️",
                       title="Confirme seu email",
                       subtitle=f"Bem-vindo ao {platform}!",
                       body_html=body, branding=branding)
    return _send_email(to_email, f"{platform} — Confirme seu email", html,
                       sender_name=_brand_sender(branding))


def send_invite_email(
    to_email: str,
    org_name: str,
    inviter_name: str,
    role: str,
    token: str,
    branding: dict = None,
) -> bool:
    invite_url = f"{settings.FRONTEND_URL}/invite/{token}"
    platform = _brand_name(branding)
    color = _brand_color(branding)

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Invite link: %s", invite_url)
        return True

    role_labels = {
        "owner": "Owner", "admin": "Administrador", "operator": "Operador",
        "viewer": "Visualizador", "billing": "Faturamento",
    }
    role_label = role_labels.get(role, role)

    body = f"""
    <p style="margin:0 0 20px;">
      <strong>{inviter_name}</strong> convidou você para a organização
      <strong>{org_name}</strong> no <strong>{platform}</strong> como <strong>{role_label}</strong>.
    </p>
    {_alert_box(
        f'<strong>Organização:</strong> {org_name}<br/>'
        f'<strong>Sua função:</strong> {role_label}',
        "#EFF6FF", "#BFDBFE", "#1E40AF"
    )}
    {_cta_button(invite_url, "Aceitar convite", color)}
    <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Se o botão não funcionar, copie e cole este link no navegador:<br/>
      <a href="{invite_url}" style="color:{color};word-break:break-all;">{invite_url}</a>
    </p>
    <p style="margin:12px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Este convite expira em <strong>7 dias</strong>.
    </p>"""

    html = _email_base(platform=platform, color=color, icon="🤝",
                       title=f"Convite para {org_name}",
                       subtitle="Você foi convidado para colaborar",
                       body_html=body, branding=branding)
    return _send_email(to_email, f"{platform} — Convite para {org_name}", html,
                       sender_name=_brand_sender(branding))


def send_org_member_added_email(
    to_email: str,
    user_name: str,
    org_name: str,
    role: str,
    inviter_name: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = _brand_color(branding)
    dashboard_url = f"{settings.FRONTEND_URL}/dashboard"

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Org added notification not sent to %s.", to_email)
        return True

    role_labels = {
        "owner": "Owner", "admin": "Administrador", "operator": "Operador",
        "viewer": "Visualizador", "billing": "Faturamento",
    }
    role_label = role_labels.get(role, role)

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      <strong>{inviter_name}</strong> adicionou você à organização <strong>{org_name}</strong>
      como <strong>{role_label}</strong>. Você já tem acesso à plataforma.
    </p>
    {_info_table(("Organização", org_name), ("Sua função", role_label))}
    {_cta_button(dashboard_url, f"Acessar {platform}", color)}"""

    html = _email_base(platform=platform, color=color, icon="👥",
                       title=f"Adicionado à {org_name}",
                       subtitle="Você tem acesso à organização",
                       body_html=body, branding=branding)
    return _send_email(to_email, f"{platform} — Você foi adicionado a {org_name}", html,
                       sender_name=_brand_sender(branding))


def send_otp_email(to_email: str, user_name: str, otp_code: str, branding: dict = None) -> bool:
    platform = _brand_name(branding)
    color = _brand_color(branding)

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 24px;">
      Use o código abaixo para completar seu login no <strong>{platform}</strong>:
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 24px;">
      <tr>
        <td style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;
                   padding:20px 40px;text-align:center;">
          <span style="font-size:42px;font-weight:800;letter-spacing:14px;
                       color:{color};font-family:monospace;">{otp_code}</span>
        </td>
      </tr>
    </table>
    <p style="color:#94A3B8;font-size:13px;text-align:center;margin:0;">
      Este código expira em <strong>5 minutos</strong>.<br/>
      Se não foi você quem tentou fazer login, ignore este email.
    </p>"""

    html = _email_base(platform=platform, color=color, icon="🔐",
                       title="Verificação em dois fatores",
                       subtitle="Código de acesso único",
                       body_html=body, branding=branding)
    return _send_email(to_email, f"Seu código de verificação — {platform}", html,
                       sender_name=_brand_sender(branding))


def send_alert_email(
    to_email: str,
    user_name: str,
    alert_name: str,
    provider: str,
    current_value: str,
    threshold: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = "#DC2626"

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Alert '%s' not emailed.", alert_name)
        return True

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      O alerta <strong>{alert_name}</strong> foi acionado e requer atenção:
    </p>
    {_info_table(("Provedor", provider), ("Valor atual", current_value), ("Limite", threshold))}
    {_cta_button(f"{settings.FRONTEND_URL}/costs", "Ver custos", color)}"""

    html = _email_base(platform=platform, color=color, icon="🚨",
                       title="Alerta de Custo Disparado",
                       subtitle=alert_name,
                       body_html=body, branding=branding)
    return _send_email(to_email, f"{platform} — Alerta: {alert_name}", html,
                       sender_name=_brand_sender(branding))


def send_password_reset_email(to_email: str, user_name: str, token: str, branding: dict = None) -> bool:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    platform = _brand_name(branding)
    color = _brand_color(branding)

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Reset link: %s", reset_url)
        return True

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 24px;">
      Recebemos uma solicitação para redefinir a senha da sua conta no
      <strong>{platform}</strong>. Clique no botão abaixo para criar uma nova senha:
    </p>
    {_cta_button(reset_url, "Redefinir minha senha", color)}
    <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Se o botão não funcionar, copie e cole este link no navegador:<br/>
      <a href="{reset_url}" style="color:{color};word-break:break-all;">{reset_url}</a>
    </p>
    <p style="margin:12px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição,
      ignore este email — sua senha não será alterada.
    </p>"""

    html = _email_base(platform=platform, color=color, icon="🔑",
                       title="Redefinição de senha",
                       subtitle="Redefina sua senha com segurança",
                       body_html=body, branding=branding)
    return _send_email(to_email, f"{platform} — Redefinição de senha", html,
                       sender_name=_brand_sender(branding))


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
    platform = _brand_name(branding)
    pct_display = f"{pct * 100:.1f}%"
    bar_color = "#DC2626" if pct >= 0.9 else ("#D97706" if pct >= 0.75 else "#059669")

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Budget alert '%s' not emailed.", budget_name)
        return True

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      O orçamento <strong>{budget_name}</strong> atingiu o limite de alerta configurado:
    </p>
    {_info_table(
        ("Provedor", provider.upper()),
        ("Gasto atual", f"${current_spend:,.2f}"),
        ("Orçamento", f"${budget_amount:,.2f}"),
        ("Utilizado", f'<span style="color:{bar_color};font-weight:700;">{pct_display}</span>'),
    )}
    <p style="margin:0 0 6px;font-size:12px;color:#64748B;">Progresso do orçamento:</p>
    {_progress_bar(pct, bar_color)}
    <p style="text-align:right;font-size:11px;color:#94A3B8;margin:4px 0 0;">{pct_display} utilizado</p>
    {_cta_button(f"{settings.FRONTEND_URL}/finops", "Ver Orçamentos no FinOps", bar_color)}"""

    html = _email_base(platform=platform, color=bar_color, icon="📊",
                       title="Limite de Orçamento Atingido",
                       subtitle=f"{budget_name} · {provider.upper()}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email,
        f"{platform} — Orçamento '{budget_name}' em alerta ({pct_display})",
        html, sender_name=_brand_sender(branding),
    )


def send_cost_alert_email(
    to_email: str,
    user_name: str,
    alert_name: str,
    provider: str,
    service: str,
    current_value: float,
    threshold_value: float,
    threshold_type: str,
    period: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = "#DC2626"
    period_label = "Diário" if period == "daily" else "Mensal"
    provider_label = provider.upper() if provider != "all" else "Todos os provedores"
    service_label = service or "—"

    if threshold_type == "fixed":
        detail = f"Gasto atual <strong>${current_value:,.2f}</strong> superou o limite de <strong>${threshold_value:,.2f}</strong>"
    else:
        detail = f"Variação superou <strong>{threshold_value:.1f}%</strong> (gasto atual: <strong>${current_value:,.2f}</strong>)"

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Cost alert '%s' not emailed.", alert_name)
        return True

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      O alerta <strong>{alert_name}</strong> foi ativado:
    </p>
    {_info_table(
        ("Provedor", provider_label),
        ("Serviço", service_label),
        ("Período", period_label),
    )}
    {_alert_box(detail, "#FEF2F2", "#FECACA", "#991B1B")}
    {_cta_button(f"{settings.FRONTEND_URL}/costs", "Ver Custos", color)}"""

    html = _email_base(platform=platform, color=color, icon="🚨",
                       title="Alerta de Custo Disparado",
                       subtitle=alert_name,
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{platform} — Alerta de custo: {alert_name}",
        html, sender_name=_brand_sender(branding),
    )


def send_report_email(
    to_email: str,
    org_name: str,
    ws_name: str,
    period_label: str,
    report_data: dict,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = _brand_color(branding)

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Report email to %s not sent.", to_email)
        return True

    costs = report_data.get("costs", {})
    budgets = report_data.get("budgets", [])
    finops_savings = report_data.get("finops_savings", 0.0)
    top_recs = report_data.get("top_recs", [])

    costs_section = ""
    if costs:
        rows = "".join(
            f"<tr style='background:{'#F8FAFC' if i % 2 == 0 else '#FFF'};'>"
            f"<td style='padding:10px 16px;font-size:13px;color:#334155;border:1px solid #E2E8F0;'>{p.upper()}</td>"
            f"<td style='padding:10px 16px;font-size:13px;color:#0F172A;font-weight:600;text-align:right;border:1px solid #E2E8F0;'>${v:,.2f}</td>"
            f"</tr>"
            for i, (p, v) in enumerate(costs.items())
        )
        total = sum(costs.values())
        costs_section = f"""
        <p style="margin:24px 0 10px;font-size:14px;font-weight:700;color:#1E293B;">Custos por Provedor</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="border-collapse:collapse;border-radius:10px;overflow:hidden;">
          <tr style="background:{color};">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#fff;">Provedor</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;color:#fff;">Gasto</th>
          </tr>
          {rows}
          <tr style="background:#F1F5F9;">
            <td style="padding:10px 16px;font-size:13px;font-weight:700;color:#1E293B;border:1px solid #E2E8F0;">Total</td>
            <td style="padding:10px 16px;font-size:14px;font-weight:800;color:{color};text-align:right;border:1px solid #E2E8F0;">${total:,.2f}</td>
          </tr>
        </table>"""

    budgets_section = ""
    if budgets:
        items = ""
        for b in budgets:
            pct = b.get("pct", 0.0)
            bar_c = "#059669" if pct < 0.75 else ("#D97706" if pct < 0.90 else "#DC2626")
            items += f"""
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                   style="border:1px solid #E2E8F0;border-radius:10px;margin-bottom:10px;">
              <tr>
                <td style="padding:12px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                      <td style="font-size:13px;font-weight:600;color:#334155;">{b.get('name','')}</td>
                      <td style="text-align:right;font-size:13px;font-weight:700;color:{bar_c};">{pct*100:.1f}%</td>
                    </tr>
                  </table>
                  {_progress_bar(pct, bar_c)}
                  <p style="margin:4px 0 0;font-size:11px;color:#94A3B8;">
                    ${b.get('last_spend') or 0:,.2f} de ${b.get('amount',0):,.2f}
                  </p>
                </td>
              </tr>
            </table>"""
        budgets_section = f'<p style="margin:24px 0 10px;font-size:14px;font-weight:700;color:#1E293B;">Status dos Orçamentos</p>{items}'

    finops_section = ""
    if top_recs:
        recs_items = "".join(
            f"<li style='margin-bottom:8px;font-size:13px;color:#475569;'>"
            f"{r.get('title','')} — <strong style='color:#059669;'>${r.get('saving',0):,.2f}/mês</strong></li>"
            for r in top_recs[:3]
        )
        finops_section = f"""
        <p style="margin:24px 0 10px;font-size:14px;font-weight:700;color:#1E293B;">Top Recomendações FinOps</p>
        <p style="color:#475569;font-size:13px;margin:0 0 12px;">
          Economia total identificada: <strong style="color:#059669;">${finops_savings:,.2f}/mês</strong>
        </p>
        <ul style="margin:0;padding-left:20px;">{recs_items}</ul>"""

    body = f"""
    <p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">{org_name} · {ws_name}</p>
    <p style="margin:0 0 24px;font-size:13px;color:#64748B;">Período: <strong>{period_label}</strong></p>
    {costs_section}
    {budgets_section}
    {finops_section}
    {_cta_button(f"{settings.FRONTEND_URL}/finops", f"Abrir {platform}", color)}"""

    html = _email_base(platform=platform, color=color, icon="📈",
                       title="Relatório de Custos Cloud",
                       subtitle=f"{org_name} · {period_label}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{platform} — Relatório {period_label} · {org_name}",
        html, sender_name=_brand_sender(branding),
    )


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
    platform = _brand_name(branding)
    color = "#0EA5E9"
    role_labels = [_GDAP_ROLE_NAMES.get(rid, rid) for rid in role_ids]
    roles_items = "".join(
        f"<li style='margin-bottom:6px;color:#334155;font-size:13px;'>{r}</li>"
        for r in role_labels
    ) if role_labels else "<li style='color:#334155;font-size:13px;'>Roles configuradas</li>"

    body = f"""
    <p style="margin:0 0 20px;color:#475569;">
      <strong>{org_name}</strong> está solicitando acesso delegado ao seu tenant Microsoft 365.
    </p>
    {_info_table(("Relação GDAP", relationship_name), ("Solicitante", org_name))}
    <p style="margin:20px 0 10px;font-size:14px;font-weight:700;color:#1E293B;">Permissões solicitadas</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px;margin-bottom:20px;">
      <tr><td style="padding:12px 16px;">
        <ul style="margin:0;padding-left:18px;">{roles_items}</ul>
      </td></tr>
    </table>
    {_alert_box(
        '⚠️ Você deve ser o <strong>Administrador Global</strong> do seu tenant para aprovar.'
        f'<br/>Este link expira em <strong>30 dias</strong>.',
        "#FFF7ED", "#FED7AA", "#92400E"
    )}
    {_cta_button(invite_url, "Revisar e Aprovar Acesso", color)}
    <p style="margin:16px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Enviado via {platform} por {org_name}
    </p>"""

    html = _email_base(platform=platform, color=color, icon="🏢",
                       title="Convite de Administração Delegada M365",
                       subtitle=relationship_name,
                       body_html=body, branding=branding)
    return _send_email(
        to_email,
        f"[{org_name}] Convite de Administração Delegada M365 — {relationship_name}",
        html, sender_name=_brand_sender(branding),
    )


# ── Billing emails ────────────────────────────────────────────────────────────

def send_billing_invoice_email(
    to_email: str,
    client_name: str,
    amount: float,
    period_type: str,
    period_ref: str,
    due_date: str | None,
    notes: str | None = None,
    description: str | None = None,
    payment_url: str | None = None,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = "#2563EB"
    period_label = "Mensal" if period_type == "monthly" else "Anual"
    due_str = due_date or "Não definido"

    description_block = ""
    if description:
        description_block = _alert_box(
            f'<strong style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">'
            f'Detalhes</strong><br/><span style="font-size:14px;">{description}</span>',
            "#EFF6FF", "#BFDBFE", "#1E3A5F"
        )

    pix_btn = (
        f'<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px auto 0;">'
        f'<tr><td style="background:#16A34A;border-radius:10px;">'
        f'<a href="{payment_url}" target="_blank" style="display:inline-block;padding:16px 44px;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;'
        f'font-size:16px;font-weight:700;color:#fff;text-decoration:none;">💳 Pagar via PIX &rarr;</a>'
        f'</td></tr></table>'
        f'<p style="margin:10px 0 0;color:#94A3B8;font-size:11px;text-align:center;">'
        f'Pagamento rápido e seguro via PIX</p>'
        if payment_url
        else _cta_button(settings.FRONTEND_URL, f"Acessar {platform}", color)
    )

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{client_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">Segue abaixo os detalhes da sua cobrança:</p>
    {_info_table(
        ("Valor", f'<span style="font-size:20px;color:{color};">{_fmt_brl(amount)}</span>'),
        ("Período", f"{period_label} — {period_ref}"),
        ("Vencimento", due_str),
        ("Status", '<span style="background:#FEF3C7;color:#92400E;font-size:12px;font-weight:600;'
                   'padding:3px 12px;border-radius:20px;display:inline-block;">Pendente</span>'),
    )}
    {description_block}
    {pix_btn}"""

    html = _email_base(platform=platform, color=color, icon="💰",
                       title="Nova Cobrança",
                       subtitle=f"{period_label} — {period_ref}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email,
        f"[{platform}] Cobrança {period_label} — {period_ref} — {_fmt_brl(amount)}",
        html, sender_name=_brand_sender(branding),
    )


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
    platform = _brand_name(branding)
    color = "#EF4444" if is_overdue else "#F59E0B"
    icon = "⚠️" if is_overdue else "🔔"
    title = "Cobrança em Atraso" if is_overdue else "Lembrete de Vencimento"
    due_str = due_date or "—"

    message = (
        "Identificamos que a cobrança abaixo está <strong style='color:#EF4444;'>em atraso</strong>. "
        "Por favor, regularize o pagamento o mais breve possível."
        if is_overdue
        else "Este é um lembrete de que a cobrança abaixo <strong style='color:#F59E0B;'>vence em breve</strong>."
    )

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{client_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 24px;">{message}</p>
    <table cellpadding="0" cellspacing="0" role="presentation" width="100%"
           style="background:#F8FAFC;border:2px solid {color};border-radius:12px;margin:0 0 24px;">
      <tr><td style="padding:24px;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Valor</p>
        <p style="margin:0 0 16px;font-size:32px;font-weight:800;color:#0F172A;">{_fmt_brl(amount)}</p>
        <p style="margin:0;font-size:13px;font-weight:600;color:{color};">
          Vencimento: {due_str} {f"— {days_info}" if days_info else ""}
        </p>
        <p style="margin:6px 0 0;font-size:12px;color:#94A3B8;">Referência: {period_ref}</p>
      </td></tr>
    </table>
    {_cta_button(settings.FRONTEND_URL, "Regularizar Pagamento" if is_overdue else "Acessar Plataforma", color)}"""

    html = _email_base(platform=platform, color=color, icon=icon,
                       title=title, subtitle=f"Referência: {period_ref}",
                       body_html=body, branding=branding)
    subject_prefix = "ATRASO" if is_overdue else "LEMBRETE"
    return _send_email(
        to_email,
        f"[{platform}] {subject_prefix} — Cobrança {period_ref} — {_fmt_brl(amount)}",
        html, sender_name=_brand_sender(branding),
    )


def send_billing_status_email(
    to_email: str,
    client_name: str,
    amount: float,
    period_ref: str,
    new_status: str,
    paid_at: str | None = None,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    status_config = {
        "paid":      {"label": "Pagamento Confirmado", "icon": "✅", "color": "#059669", "bg": "#F0FDF4", "text": "#166534"},
        "cancelled": {"label": "Cobrança Cancelada",   "icon": "❌", "color": "#6B7280", "bg": "#F9FAFB", "text": "#374151"},
        "overdue":   {"label": "Cobrança em Atraso",   "icon": "⚠️", "color": "#EF4444", "bg": "#FEF2F2", "text": "#991B1B"},
        "pending":   {"label": "Cobrança Reaberta",    "icon": "🔄", "color": "#3B82F6", "bg": "#EFF6FF", "text": "#1E40AF"},
    }
    cfg = status_config.get(new_status, status_config["pending"])

    paid_row = (
        f'<tr style="border-bottom:1px solid #F1F5F9;">'
        f'<td style="padding:13px 20px;color:#64748B;font-size:13px;">Pago em</td>'
        f'<td style="padding:13px 20px;text-align:right;color:#0F172A;font-size:14px;font-weight:600;">{paid_at}</td>'
        f'</tr>'
        if new_status == "paid" and paid_at else ""
    )

    body = f"""
    <p style="margin:0 0 24px;">Olá <strong>{client_name}</strong>,</p>
    <table cellpadding="0" cellspacing="0" role="presentation" width="100%"
           style="background:{cfg['bg']};border-radius:12px;margin:0 0 24px;">
      <tr><td style="padding:28px;text-align:center;">
        <p style="margin:0 0 8px;font-size:40px;">{cfg['icon']}</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:{cfg['text']};">{cfg['label']}</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;margin:0 0 24px;">
      <tr style="border-bottom:1px solid #F1F5F9;">
        <td style="padding:13px 20px;color:#64748B;font-size:13px;">Valor</td>
        <td style="padding:13px 20px;text-align:right;color:#0F172A;font-size:18px;font-weight:700;">{_fmt_brl(amount)}</td>
      </tr>
      <tr style="border-bottom:1px solid #F1F5F9;">
        <td style="padding:13px 20px;color:#64748B;font-size:13px;">Referência</td>
        <td style="padding:13px 20px;text-align:right;color:#334155;font-size:14px;font-weight:600;">{period_ref}</td>
      </tr>
      {paid_row}
    </table>
    {_cta_button(settings.FRONTEND_URL, "Acessar Plataforma", cfg['color'])}"""

    html = _email_base(platform=platform, color=cfg["color"], icon=cfg["icon"],
                       title=cfg["label"], subtitle=f"Referência: {period_ref}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email,
        f"[{platform}] {cfg['label']} — {period_ref} — {_fmt_brl(amount)}",
        html, sender_name=_brand_sender(branding),
    )


# ── Trial reminder ────────────────────────────────────────────────────────────

def send_trial_reminder_email(
    to_email: str,
    user_name: str,
    days_remaining: int,
    savings_found: float | None,
    trial_end_date: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Trial reminder not sent to %s.", to_email)
        return True

    if days_remaining <= 1:
        color, label = "#DC2626", "Último dia"
    elif days_remaining <= 3:
        color, label = "#F59E0B", f"{days_remaining} dias"
    else:
        color, label = "#059669", f"{days_remaining} dias"

    savings_block = ""
    if savings_found and savings_found > 0:
        savings_block = _alert_box(
            f'💰 <strong>Economia encontrada pelo {platform}</strong><br/>'
            f'<span style="font-size:24px;font-weight:800;color:#15803D;">${savings_found:,.2f}'
            f'<span style="font-size:13px;font-weight:400;">/mês</span></span><br/>'
            f'<span style="font-size:12px;">em recomendações de otimização identificadas</span>',
            "#F0FDF4", "#BBF7D0", "#166534"
        )

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      Seu período de trial do plano <strong>Pro</strong> termina em
      <strong style="color:{color};">{trial_end_date}</strong>.
      Após essa data, sua organização voltará ao plano Free com recursos limitados.
    </p>
    {savings_block}
    <p style="margin:20px 0 10px;font-size:14px;font-weight:700;color:#1E293B;">O que você perde ao expirar:</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;margin:0 0 24px;">
      <tr><td style="padding:16px 20px;">
        <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:2;">
          <li>FinOps — orçamentos, scans e relatórios automáticos</li>
          <li>Advisor — recomendações de custo, segurança e performance</li>
          <li>Agendamentos — start/stop automático de recursos</li>
          <li>Webhooks — integrações com Teams, Slack e mais</li>
          <li>Limites ampliados — workspaces e contas cloud extras</li>
        </ul>
      </td></tr>
    </table>
    {_cta_button(f"{settings.FRONTEND_URL}/billing", "Fazer upgrade agora", color)}"""

    html = _email_base(platform=platform, color=color, icon="⏳",
                       title=f"Seu trial termina em {label}",
                       subtitle="Trial Pro — Não perca seus recursos",
                       body_html=body, branding=branding)
    subject = f"{platform} — Seu trial Pro termina em {days_remaining} dia{'s' if days_remaining != 1 else ''}"
    return _send_email(to_email, subject, html, sender_name=_brand_sender(branding))


# ── Welcome ───────────────────────────────────────────────────────────────────

def send_welcome_email(to_email: str, user_name: str, branding: dict = None) -> bool:
    platform = _brand_name(branding)
    color = _brand_color(branding)
    dashboard_url = f"{settings.FRONTEND_URL}/"

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 24px;">
      Seu email foi verificado e sua conta no <strong>{platform}</strong> está pronta para uso!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;margin:0 0 24px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#166534;">Próximos passos:</p>
        <ol style="margin:0;padding-left:20px;color:#166534;font-size:13px;line-height:2.2;">
          <li>Conecte sua primeira conta cloud (AWS, Azure ou GCP)</li>
          <li>Explore o dashboard de recursos</li>
          <li>Configure alertas de custo no FinOps</li>
        </ol>
      </td></tr>
    </table>
    {_cta_button(dashboard_url, "Acessar meu painel", color)}"""

    html = _email_base(platform=platform, color=color, icon="🎉",
                       title="Conta ativada com sucesso!",
                       subtitle="Bem-vindo ao CloudAtlas",
                       body_html=body, branding=branding)
    return _send_email(to_email, f"{platform} — Conta ativada!", html,
                       sender_name=_brand_sender(branding))


# ── Schedule Failed ───────────────────────────────────────────────────────────

def send_schedule_failed_email(
    to_email: str,
    user_name: str,
    resource_name: str,
    action: str,
    provider: str,
    error_message: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = "#DC2626"
    action_label = "iniciar" if action == "start" else "parar"

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      A ação agendada para <strong>{action_label}</strong> o recurso
      <strong>{resource_name}</strong> ({provider.upper()}) falhou.
    </p>
    {_info_table(("Recurso", resource_name), ("Provedor", provider.upper()), ("Ação", action_label))}
    {_alert_box(f'<strong>Erro:</strong> {error_message[:200]}', "#FEF2F2", "#FECACA", "#991B1B")}
    <p style="color:#64748B;font-size:13px;margin:16px 0 20px;">
      Verifique se as credenciais da conta cloud estão válidas e se o recurso ainda existe.
    </p>
    {_cta_button(f"{settings.FRONTEND_URL}/schedules", "Ver agendamentos", color)}"""

    html = _email_base(platform=platform, color=color, icon="❌",
                       title="Agendamento Falhou",
                       subtitle=f"{resource_name} · {provider.upper()}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{platform} — Falha no agendamento: {resource_name}",
        html, sender_name=_brand_sender(branding),
    )


# ── Migration365 ──────────────────────────────────────────────────────────────

def send_migration_completed_email(
    to_email: str,
    user_name: str,
    project_name: str,
    completed_count: int,
    failed_count: int,
    project_id: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    has_failures = failed_count > 0
    color = "#F59E0B" if has_failures else "#059669"
    icon = "⚠️" if has_failures else "✅"
    status_label = "Concluído com falhas" if has_failures else "Concluído com sucesso"

    failure_block = ""
    if has_failures:
        failure_block = _alert_box(
            "Algumas caixas falharam. Acesse o projeto para retentar ou verificar os erros.",
            "#FEF3C7", "#FDE68A", "#92400E"
        )

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      O projeto <strong>{project_name}</strong> finalizou o processo de migração.
    </p>
    {_info_table(
        ("Projeto", project_name),
        ("Caixas migradas", f'<span style="color:#059669;font-weight:700;">{completed_count}</span>'),
        ("Caixas com falha", f'<span style="color:{"#EF4444" if failed_count > 0 else "#059669"};font-weight:700;">{failed_count}</span>'),
    )}
    {failure_block}
    {_cta_button(f"{settings.FRONTEND_URL}/m365/migration/{project_id}", "Ver projeto", color)}"""

    html = _email_base(platform=platform, color=color, icon=icon,
                       title=f"Migração {status_label}",
                       subtitle=project_name,
                       body_html=body, branding=branding)
    subject_status = "com falhas" if has_failures else "com sucesso"
    return _send_email(
        to_email, f"{platform} — Migração concluída {subject_status}: {project_name}",
        html, sender_name=_brand_sender(branding),
    )


# ── FinOps Scan ───────────────────────────────────────────────────────────────

def send_finops_scan_email(
    to_email: str,
    user_name: str,
    findings_count: int,
    total_savings: float,
    top_findings: list,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = "#059669"

    rows = ""
    for i, f in enumerate(top_findings[:5]):
        bg = "#F8FAFC" if i % 2 == 0 else "#FFFFFF"
        rows += (
            f"<tr style='background:{bg};'>"
            f"<td style='padding:10px 16px;border:1px solid #E2E8F0;font-size:13px;color:#334155;'>"
            f"{f.get('resource_name','—')}</td>"
            f"<td style='padding:10px 16px;border:1px solid #E2E8F0;font-size:13px;color:#334155;'>"
            f"{f.get('recommendation_type','—')}</td>"
            f"<td style='padding:10px 16px;border:1px solid #E2E8F0;font-size:13px;color:#059669;"
            f"font-weight:700;text-align:right;'>${f.get('estimated_saving_monthly',0):.2f}/mês</td>"
            f"</tr>"
        )

    table_section = ""
    if rows:
        table_section = f"""
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="border-collapse:collapse;border-radius:10px;overflow:hidden;margin:20px 0;">
          <tr style="background:{color};">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#fff;">Recurso</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#fff;">Ação</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;color:#fff;">Economia</th>
          </tr>
          {rows}
        </table>"""

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      O scan automático encontrou <strong>{findings_count} recomendação(ões)</strong>
      com economia potencial de <strong style="color:#059669;">${total_savings:.2f}/mês</strong>.
    </p>
    {table_section}
    {_cta_button(f"{settings.FRONTEND_URL}/finops", "Ver recomendações", color)}"""

    html = _email_base(platform=platform, color=color, icon="🔍",
                       title="Scan FinOps Concluído",
                       subtitle=f"{findings_count} oportunidades · ${total_savings:.2f}/mês",
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{platform} — {findings_count} oportunidades de economia encontradas",
        html, sender_name=_brand_sender(branding),
    )


# ── Approvals ─────────────────────────────────────────────────────────────────

def send_approval_pending_email(
    to_email: str,
    approver_name: str,
    requester_name: str,
    action_type: str,
    resource_name: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = "#D97706"
    action_label = action_type.replace("_", " ").title()

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{approver_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      <strong>{requester_name}</strong> solicitou aprovação para executar uma ação
      e aguarda sua revisão:
    </p>
    {_info_table(("Solicitante", requester_name), ("Ação", action_label), ("Recurso", resource_name))}
    {_cta_button(f"{settings.FRONTEND_URL}/approvals", "Revisar solicitação", color)}"""

    html = _email_base(platform=platform, color=color, icon="⏳",
                       title="Aprovação Pendente",
                       subtitle=f"Ação: {action_label}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{platform} — Aprovação pendente: {resource_name}",
        html, sender_name=_brand_sender(branding),
    )


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
    platform = _brand_name(branding)
    status = "Aprovada" if approved else "Rejeitada"
    color = "#059669" if approved else "#DC2626"
    action_label = action_type.replace("_", " ").title()

    notes_block = (
        _alert_box(f'<strong>Observação:</strong> {notes}', "#F8FAFC", "#E2E8F0", "#475569")
        if notes else ""
    )

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{requester_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      Sua solicitação foi <strong>{status.lower()}</strong> por <strong>{resolver_name}</strong>.
    </p>
    {_info_table(
        ("Status", f'<span style="color:{color};font-weight:700;">{status}</span>'),
        ("Ação", action_label),
        ("Recurso", resource_name),
        ("Resolvido por", resolver_name),
    )}
    {notes_block}
    {_cta_button(f"{settings.FRONTEND_URL}/approvals", "Ver aprovações", color)}"""

    html = _email_base(platform=platform, color=color, icon="✅" if approved else "❌",
                       title=f"Solicitação {status}",
                       subtitle=f"{action_label} · {resource_name}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{platform} — Solicitação {status.lower()}: {resource_name}",
        html, sender_name=_brand_sender(branding),
    )


# ── Partner Org ───────────────────────────────────────────────────────────────

def send_partner_org_created_email(
    to_email: str,
    user_name: str,
    partner_org_name: str,
    master_org_name: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = _brand_color(branding)

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      A organização parceira <strong>{partner_org_name}</strong> foi criada
      sob <strong>{master_org_name}</strong>.
    </p>
    {_info_table(
        ("Organização parceira", partner_org_name),
        ("Organização master", master_org_name),
        ("Sua função", "Owner"),
    )}
    {_alert_box(
        'Um workspace padrão já foi criado. Você pode começar a configurar agora.',
        "#EFF6FF", "#BFDBFE", "#1E40AF"
    )}
    {_cta_button(f"{settings.FRONTEND_URL}/", "Acessar organização", color)}"""

    html = _email_base(platform=platform, color=color, icon="🏢",
                       title="Nova Organização Parceira",
                       subtitle=partner_org_name,
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{platform} — Organização '{partner_org_name}' criada",
        html, sender_name=_brand_sender(branding),
    )


# ── Account Disconnected ──────────────────────────────────────────────────────

def send_account_disconnected_email(
    to_email: str,
    user_name: str,
    provider: str,
    account_label: str,
    error_detail: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = "#DC2626"

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      A conta <strong>{account_label}</strong> ({provider.upper()}) não está respondendo.
    </p>
    {_info_table(("Conta", account_label), ("Provedor", provider.upper()))}
    {_alert_box(f'<strong>Erro:</strong> {error_detail[:200]}', "#FEF2F2", "#FECACA", "#991B1B")}
    <p style="color:#64748B;font-size:13px;margin:16px 0 20px;">
      Enquanto a conexão estiver inativa, dados de custo, inventário e agendamentos
      desta conta não serão atualizados. Verifique se as credenciais ainda são válidas.
    </p>
    {_cta_button(f"{settings.FRONTEND_URL}/workspace", "Verificar contas cloud", color)}"""

    html = _email_base(platform=platform, color=color, icon="🔌",
                       title="Conta Cloud Desconectada",
                       subtitle=f"{account_label} · {provider.upper()}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{platform} — Conta {provider.upper()} desconectada: {account_label}",
        html, sender_name=_brand_sender(branding),
    )


# ── Test Branding ─────────────────────────────────────────────────────────────

def send_test_branding_email(to_email: str, user_name: str, branding: dict = None) -> bool:
    color = _brand_color(branding)
    accent = (branding or {}).get("color_accent", "#0EA5E9") if branding else "#0EA5E9"
    name = _brand_name(branding)

    color_swatch = (
        '<span style="display:inline-block;width:14px;height:14px;background:{c};'
        'border-radius:4px;vertical-align:middle;margin-right:4px;"></span>'
        '<code style="font-size:11px;">{c}</code>'
    )

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 24px;">
      Este é um email de teste para verificar como ficará a aparência dos emails
      enviados pela plataforma <strong>{name}</strong> com a sua personalização White Label.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;margin:0 0 24px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1E293B;">Configurações ativas:</p>
        <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:2.2;">
          <li>Nome: <strong style="color:{color};">{name}</strong></li>
          <li>Cor primária: {color_swatch.format(c=color)}</li>
          <li>Cor accent: {color_swatch.format(c=accent)}</li>
          <li>Remetente: <strong>{_brand_sender(branding)}</strong></li>
          <li>Powered by: <strong>{"Sim" if (branding or {{}}).get("powered_by", True) else "Não"}</strong></li>
        </ul>
      </td></tr>
    </table>
    <p style="color:#94A3B8;font-size:13px;text-align:center;margin:0 0 20px;">
      ✅ Se você recebeu este email, a configuração de envio está funcionando corretamente.
    </p>
    {_cta_button(f"{settings.FRONTEND_URL}/", f"Acessar {name}", color)}"""

    html = _email_base(platform=name, color=color, icon="🎨",
                       title="Teste de Email White Label",
                       subtitle="Pré-visualização da personalização",
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{name} — E-mail de teste White Label",
        html, sender_name=_brand_sender(branding),
    )


# ── Guest Invite ──────────────────────────────────────────────────────────────

def send_guest_invite_email(
    to_email: str,
    guest_name: str,
    redeem_url: str,
    inviter_name: str = "",
    custom_message: str = "",
    tenant_name: str = "",
    branding: dict = None,
) -> bool:
    name = _brand_name(branding)
    color = _brand_color(branding)
    inviter = inviter_name or name
    tenant_line = f" do tenant <strong>{tenant_name}</strong>" if tenant_name else ""

    message_block = ""
    if custom_message:
        message_block = f"""
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#F8FAFC;border-left:3px solid {color};border-radius:0 8px 8px 0;margin:16px 0;">
          <tr><td style="padding:14px 16px;">
            <p style="margin:0 0 4px;font-size:11px;color:#64748B;">Mensagem de {inviter}:</p>
            <p style="margin:0;font-size:14px;color:#334155;">{custom_message}</p>
          </td></tr>
        </table>"""

    body = f"""
    <p style="margin:0 0 20px;">Olá{(' <strong>' + guest_name + '</strong>') if guest_name else ''},</p>
    <p style="color:#475569;margin:0 0 20px;">
      <strong>{inviter}</strong> convidou você para colaborar como usuário convidado{tenant_line}.
    </p>
    {message_block}
    <p style="color:#475569;margin:0 0 24px;">
      Clique no botão abaixo para aceitar o convite e acessar os recursos compartilhados:
    </p>
    {_cta_button(redeem_url, "Aceitar Convite", color)}
    <p style="margin:20px 0 0;color:#94A3B8;font-size:12px;text-align:center;">
      Se o botão não funcionar, copie e cole este link no navegador:<br/>
      <a href="{redeem_url}" style="color:{color};word-break:break-all;font-size:11px;">{redeem_url}</a>
    </p>"""

    html = _email_base(platform=name, color=color, icon="🤝",
                       title="Convite de Colaboração",
                       subtitle=f"Convidado por {inviter}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"{name} — Convite de Colaboração",
        html, sender_name=_brand_sender(branding),
    )


# ── Support Tickets ───────────────────────────────────────────────────────────

def send_ticket_created_email(
    to_email: str,
    user_name: str,
    ticket_number: int,
    title: str,
    priority: str,
    sla_hours: int | None,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = _brand_color(branding)
    sla_line = (
        f"Nosso SLA de primeira resposta para seu plano é de <strong>{sla_hours} horas úteis</strong>."
        if sla_hours else "Nossa equipe responderá o mais breve possível."
    )

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      Recebemos seu chamado e nossa equipe já está analisando.
    </p>
    {_info_table(
        ("Ticket", f"#{ticket_number}"),
        ("Assunto", title),
        ("Prioridade", priority),
    )}
    <p style="color:#475569;font-size:13px;margin:16px 0 0;">{sla_line}</p>"""

    html = _email_base(platform=platform, color=color, icon="🎫",
                       title=f"Ticket #{ticket_number} recebido",
                       subtitle=title,
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"Ticket #{ticket_number}: {title}",
        html, sender_name=_brand_sender(branding),
    )


def send_ticket_resolved_csat_email(
    to_email: str,
    user_name: str,
    ticket_number: int,
    title: str,
    rate_url: str,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = _brand_color(branding)

    body = f"""
    <p style="margin:0 0 20px;">Olá <strong>{user_name}</strong>,</p>
    <p style="color:#475569;margin:0 0 20px;">
      Marcamos o ticket <strong>#{ticket_number} — {title}</strong> como resolvido.
      Sua opinião é muito importante para melhorarmos nosso atendimento:
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" width="100%"
           style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;margin:0 0 24px;">
      <tr><td style="padding:24px;text-align:center;">
        <p style="margin:0 0 16px;font-size:28px;">⭐⭐⭐⭐⭐</p>
        <p style="margin:0;font-size:14px;color:#475569;">Como foi nosso atendimento?</p>
      </td></tr>
    </table>
    {_cta_button(rate_url, "Avaliar atendimento", color)}"""

    html = _email_base(platform=platform, color=color, icon="✅",
                       title="Seu ticket foi resolvido",
                       subtitle=f"Ticket #{ticket_number}",
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"Como foi o atendimento do ticket #{ticket_number}?",
        html, sender_name=_brand_sender(branding),
    )


def send_ticket_admin_notification_email(
    to_email: str,
    ticket_number: int,
    title: str,
    priority: str,
    org_name: str,
    plan: str,
    sla_hours: int | None,
    branding: dict = None,
) -> bool:
    platform = _brand_name(branding)
    color = _brand_color(branding)
    sla_line = f"{sla_hours}h SLA" if sla_hours else "Sem SLA"

    body = f"""
    <p style="color:#475569;margin:0 0 20px;">Novo ticket recebido via plataforma:</p>
    {_info_table(
        ("Ticket", f"#{ticket_number}"),
        ("Assunto", title),
        ("Organização", org_name),
        ("Plano", f"{plan} ({sla_line})"),
        ("Prioridade", priority),
    )}
    {_cta_button(f"{settings.FRONTEND_URL}/admin", "Abrir painel de suporte", color)}"""

    html = _email_base(platform=platform, color=color, icon="🎫",
                       title=f"Novo ticket #{ticket_number}",
                       subtitle=title,
                       body_html=body, branding=branding)
    return _send_email(
        to_email, f"[Suporte] #{ticket_number} — {title}",
        html, sender_name=_brand_sender(branding),
    )


# ── Compatibility alias ───────────────────────────────────────────────────────
def _branded_footer(branding: dict = None) -> str:
    """Legacy alias kept for any external callers."""
    name = _brand_name(branding)
    return f'<p style="color:#94A3B8;font-size:11px;text-align:center;margin:16px 0 0;">{name}</p>'
