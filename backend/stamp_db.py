"""One-time script to stamp an existing database with the current Alembic revision.

Run this ONCE when transitioning from create_all() to Alembic migrations.
After running, Alembic will know the DB is at the initial_schema revision
and future migrations will work correctly.

Usage:
    python stamp_db.py

Or inside Docker:
    docker exec cloudatlas-backend python stamp_db.py
"""
from app.database import stamp_existing_db

if __name__ == "__main__":
    stamp_existing_db()
    print("Done! Database stamped at current Alembic head.")
