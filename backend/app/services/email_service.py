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
