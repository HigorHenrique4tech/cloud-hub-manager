from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List


class Settings(BaseSettings):
    """Application settings"""

    # Application
    APP_NAME: str = "CloudAtlas"
    APP_VERSION: str = "0.1.0"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
    ]

    # Database
    DATABASE_URL: str = "postgresql://cloudhub:cloudhub_pass@localhost:5432/cloudhub_db"

    # Authentication
    SECRET_KEY: str = "changeme-use-openssl-rand-hex-32-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ENCRYPTION_KEY: str = ""  # Fernet key; auto-generated if empty

    # Email / SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@cloudatlas.io"
    SMTP_USE_TLS: bool = True
    FRONTEND_URL: str = "http://localhost:3000"

    # OAuth (SSO)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    # AbacatePay
    ABACATEPAY_API_KEY: str = ""
    ABACATEPAY_API_URL: str = "https://api.abacatepay.com/v1"
    ABACATEPAY_WEBHOOK_SECRET: str = ""

    # AWS (global fallback)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_DEFAULT_REGION: str = "us-east-1"

    # Azure (global fallback)
    AZURE_SUBSCRIPTION_ID: str = ""
    AZURE_TENANT_ID: str = ""
    AZURE_CLIENT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""

    @model_validator(mode='after')
    def validate_production_secrets(self) -> 'Settings':
        """Prevent the app from starting with insecure defaults in production."""
        if not self.DEBUG:
            errors = []
            if self.SECRET_KEY.startswith("changeme"):
                errors.append(
                    "SECRET_KEY está com o valor padrão inseguro. "
                    "Gere uma chave com: openssl rand -hex 32"
                )
            if not self.ENCRYPTION_KEY:
                errors.append(
                    "ENCRYPTION_KEY está vazia. Gere uma com: "
                    "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
                )
            if errors:
                raise ValueError(
                    "Configuração de produção inválida:\n" + "\n".join(f"  - {e}" for e in errors)
                )
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()