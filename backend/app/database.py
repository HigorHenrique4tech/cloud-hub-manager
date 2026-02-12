from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency that provides a database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables in the database and migrate existing ones."""
    from app.models import db_models  # noqa: F401 - ensures models are registered
    Base.metadata.create_all(bind=engine)
    _migrate_existing_tables()
    _migrate_credentials_to_cloud_accounts()


def _migrate_existing_tables():
    """Add missing columns to existing tables (PostgreSQL ADD COLUMN IF NOT EXISTS)."""
    migrations = [
        # users — new FK to organizations
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS default_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL",
        # cost_alerts — workspace + created_by + cloud_account
        "ALTER TABLE cost_alerts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE",
        "ALTER TABLE cost_alerts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE cost_alerts ADD COLUMN IF NOT EXISTS cloud_account_id UUID REFERENCES cloud_accounts(id) ON DELETE SET NULL",
        # activity_logs — org + workspace scope
        "ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL",
        "ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception:
                pass  # column may already exist or table may not exist yet
        conn.commit()


def _migrate_credentials_to_cloud_accounts():
    """
    One-time migration: copy rows from cloud_credentials into cloud_accounts
    for each user's default workspace.  Skips users that already have accounts
    in their workspace or that don't have a personal org yet.
    """
    import logging
    logger = logging.getLogger(__name__)

    with engine.connect() as conn:
        # Check if cloud_credentials table exists
        exists = conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cloud_credentials')"
        )).scalar()
        if not exists:
            return

        # Get credentials not yet migrated:
        # Join user → org_member → workspace (slug='default') and check
        # if a matching cloud_account already exists
        rows = conn.execute(text("""
            SELECT cc.id, cc.user_id, cc.provider, cc.label, cc.encrypted_data, cc.is_active,
                   w.id AS workspace_id
            FROM cloud_credentials cc
            JOIN users u ON u.id = cc.user_id
            JOIN organization_members om ON om.user_id = u.id AND om.is_active = true
            JOIN workspaces w ON w.organization_id = om.organization_id AND w.slug = 'default'
            WHERE NOT EXISTS (
                SELECT 1 FROM cloud_accounts ca
                WHERE ca.workspace_id = w.id
                  AND ca.provider = cc.provider
                  AND ca.label = cc.label
            )
        """)).fetchall()

        if not rows:
            return

        for row in rows:
            conn.execute(text("""
                INSERT INTO cloud_accounts (id, workspace_id, provider, label, encrypted_data, is_active, created_by, created_at, updated_at)
                VALUES (gen_random_uuid(), :ws_id, :provider, :label, :enc_data, :is_active, :user_id, NOW(), NOW())
            """), {
                "ws_id": row.workspace_id,
                "provider": row.provider,
                "label": row.label,
                "enc_data": row.encrypted_data,
                "is_active": row.is_active,
                "user_id": row.user_id,
            })

        conn.commit()
        logger.info(f"Migrated {len(rows)} credential(s) to cloud_accounts")
