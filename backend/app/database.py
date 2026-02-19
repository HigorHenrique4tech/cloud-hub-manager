import logging

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

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


def _get_alembic_config():
    """Build an Alembic Config pointing at our alembic.ini."""
    from alembic.config import Config
    import os

    alembic_ini = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    cfg = Config(alembic_ini)
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    return cfg


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
        # cloud_accounts — account_id + created_by (added after initial table creation)
        "ALTER TABLE cloud_accounts ADD COLUMN IF NOT EXISTS account_id VARCHAR(255)",
        "ALTER TABLE cloud_accounts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE cloud_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception:
                pass  # column may already exist or table may not exist yet
        conn.commit()


def run_migrations():
    """Run Alembic migrations programmatically (upgrade to head).

    If the database already has tables but no alembic_version table
    (transition from create_all()), it stamps the DB first so Alembic
    doesn't try to re-create everything.
    """
    from alembic import command
    from sqlalchemy import inspect

    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    has_alembic = "alembic_version" in existing_tables
    has_app_tables = "users" in existing_tables

    cfg = _get_alembic_config()

    if has_app_tables and not has_alembic:
        # Existing DB created via create_all() — stamp it at head
        logger.info("Existing database detected without Alembic history. Stamping as current...")
        command.stamp(cfg, "head")
        logger.info("Database stamped at head.")
    else:
        logger.info("Running Alembic migrations (upgrade head)...")
        command.upgrade(cfg, "head")
        logger.info("Alembic migrations complete.")

    # Always apply manual column additions for backwards compatibility
    _migrate_existing_tables()
    logger.info("Column migrations applied.")


def stamp_existing_db():
    """Stamp an existing database as being at the latest migration.

    Use this once when migrating from create_all() to Alembic,
    so Alembic knows the current state without re-running migrations.
    """
    from alembic.config import Config
    from alembic import command
    import os

    alembic_ini = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    alembic_cfg = Config(alembic_ini)
    alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

    logger.info("Stamping database as current (head)...")
    command.stamp(alembic_cfg, "head")
    logger.info("Database stamped.")
