import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

logger = logging.getLogger(__name__)


def send_verification_email(to_email: str, user_name: str, token: str) -> bool:
    """Send an email verification link. Returns True on success."""
    verify_url = f"{settings.FRONTEND_URL}/verify/{token}"

    subject = "CloudAtlas — Confirme seu email"
    html_body = f"""
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
        Se o botão não funcionar, copie e cole este link no seu navegador:<br/>
        <a href="{verify_url}" style="color: #3b82f6;">{verify_url}</a>
      </p>
      <p style="color: #94a3b8; font-size: 12px;">
        Este link expira em 24 horas.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #cbd5e1; font-size: 11px; text-align: center;">
        CloudAtlas — Gerenciamento multi-cloud centralizado
      </p>
    </div>
    """

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured. Verification link: %s", verify_url)
        return True  # Treat as success in dev (user can verify via logs)

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, to_email, msg.as_string())

        logger.info("Verification email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send verification email to %s: %s", to_email, e)
        return False
