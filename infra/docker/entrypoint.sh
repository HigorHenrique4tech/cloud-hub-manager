#!/bin/sh
set -e

echo "Running Alembic migrations..."
python -c "from app.database import run_migrations; run_migrations()"
echo "Migrations complete."

echo "Starting gunicorn..."
exec "$@"
