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


def _migrate_existing_tables():
    """Add missing columns to existing tables and enforce constraints."""
    import logging
    logger = logging.getLogger(__name__)

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

    # ── Step 3.2: Migrate orphan cost_alerts and enforce NOT NULL ────────
    with engine.connect() as conn:
        try:
            # Associate orphan alerts to the user's default workspace
            conn.execute(text("""
                UPDATE cost_alerts ca
                SET workspace_id = w.id
                FROM users u
                JOIN organization_members om ON om.user_id = u.id AND om.is_active = true
                JOIN workspaces w ON w.organization_id = om.organization_id AND w.slug = 'default'
                WHERE ca.user_id = u.id AND ca.workspace_id IS NULL
            """))
            # Delete any remaining orphans (no default workspace found)
            conn.execute(text(
                "DELETE FROM cost_alerts WHERE workspace_id IS NULL"
            ))
            # Make workspace_id NOT NULL
            conn.execute(text(
                "ALTER TABLE cost_alerts ALTER COLUMN workspace_id SET NOT NULL"
            ))
            conn.commit()
            logger.info("cost_alerts.workspace_id is now NOT NULL")
        except Exception as e:
            conn.rollback()
            logger.warning(f"cost_alerts NOT NULL migration skipped: {e}")

    # ── Step 3.3: Drop legacy cloud_credentials table ───────────────────
    with engine.connect() as conn:
        try:
            conn.execute(text("DROP TABLE IF EXISTS cloud_credentials"))
            conn.commit()
            logger.info("Dropped legacy cloud_credentials table")
        except Exception as e:
            conn.rollback()
            logger.warning(f"Could not drop cloud_credentials: {e}")
