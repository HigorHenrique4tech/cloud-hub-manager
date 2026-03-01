"""
Fixtures compartilhadas para os testes.

Usa SQLite in-memory para isolamento total — sem depender do PostgreSQL de produção.
A variável DEBUG=True evita que o validator de secrets bloqueie os testes.
"""
import os
import pytest

# Forçar modo dev antes de qualquer import do app
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import get_db, Base
from app.services.auth_service import hash_password

SQLITE_URL = "sqlite:///./test.db"

engine_test = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture()
def db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client():
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def ws_setup(client, db):
    """Register a user, upgrade org to pro, return headers + org_slug + workspace_id."""
    import uuid
    email = f"wsuser_{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "WS User", "password": "Test1234!"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Resolve org_slug via the list endpoint
    orgs_resp = client.get("/api/v1/orgs", headers=headers)
    assert orgs_resp.status_code == 200, orgs_resp.text
    org_slug = orgs_resp.json()["organizations"][0]["slug"]

    from app.models.db_models import Organization
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    org.plan_tier = "pro"
    db.commit()

    ws_resp = client.get(f"/api/v1/orgs/{org_slug}/workspaces", headers=headers)
    assert ws_resp.status_code == 200, ws_resp.text
    workspace_id = ws_resp.json()["workspaces"][0]["id"]

    return {"headers": headers, "org_slug": org_slug, "workspace_id": workspace_id}
