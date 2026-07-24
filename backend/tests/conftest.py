"""
Fixtures compartilhadas para os testes.

Usa SQLite in-memory para isolamento total — sem depender do PostgreSQL de produção.
A variável DEBUG=True evita que o validator de secrets bloqueie os testes.
"""
import os
import pytest

# Forçar modo dev antes de qualquer import do app
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("TESTING", "1")  # pula migrations + scheduler no startup do app
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")
# FORÇAR (não setdefault) — o container já define DATABASE_URL/REDIS_URL para
# Postgres/Redis reais. Em teste queremos o sqlite local e o limiter em memória,
# senão código que usa SessionLocal direto (ex: execute_trial_reminders) vai no
# Postgres inalcançável.
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["REDIS_URL"] = "memory://"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import UUID as _PgUUID, JSONB as _PgJSONB

# O app usa tipos do dialeto Postgres (UUID/JSONB) que o SQLite não sabe
# compilar nativamente. Registramos a tradução de DDL para SQLite aqui, para
# que os testes rodem em SQLite in-memory sem depender de um Postgres real.
# (Os processadores de valor do tipo genérico Uuid já funcionam cross-dialect.)
@compiles(_PgUUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kw):
    return "CHAR(36)"


@compiles(_PgJSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"


# O bind processor do postgresql.UUID espera um objeto uuid.UUID e chama .hex —
# mas o app frequentemente passa UUIDs como string (vindas da URL). Substituímos
# os processadores por versões tolerantes a str, usadas só no SQLite de teste.
import uuid as _uuid


def _uuid_bind_processor(self, dialect):
    def process(value):
        if value is None:
            return None
        return str(value)
    return process


def _uuid_result_processor(self, dialect, coltype):
    def process(value):
        if value is None:
            return None
        if isinstance(value, _uuid.UUID):
            return value
        try:
            return _uuid.UUID(value)
        except (ValueError, AttributeError, TypeError):
            return value
    return process


_PgUUID.bind_processor = _uuid_bind_processor
_PgUUID.result_processor = _uuid_result_processor


from app.main import app
from app.database import get_db, Base, engine as _app_engine
from app.services.auth_service import hash_password

# Código que usa SessionLocal direto (ex: execute_trial_reminders) roda no
# engine do app — desabilita RETURNING nele também (mesmo motivo do engine_test).
_app_engine.dialect.insert_returning = False
_app_engine.dialect.update_returning = False
_app_engine.dialect.delete_returning = False

# Desabilita rate limiting nos testes — a suíte registra muitos usuários em
# sequência e estouraria os limites por IP (todos usam o mesmo IP do TestClient).
from app.core.limiter import limiter as _limiter
_limiter.enabled = False

# Auto-verifica e-mail de todo usuário criado nos testes. O app exige
# is_verified=True para login e operações org-scoped (e nenhum teste depende
# do estado não-verificado), então simulamos um usuário ativo normal.
from sqlalchemy import event as _sa_event
from app.models.db_models import User as _User


@_sa_event.listens_for(_User, "before_insert")
def _auto_verify_user(mapper, connection, target):
    if getattr(target, "is_verified", None) is not True:
        target.is_verified = True

# SQLite em arquivo (múltiplas conexões para o mesmo arquivo) — as fixtures
# usam a sessão `db` e a sessão da request simultaneamente, então cada uma
# precisa da sua própria conexão (StaticPool/single-connection quebra isso).
# O schema é recriado do zero em setup_db para evitar arquivo obsoleto.
SQLITE_URL = "sqlite:///./test.db"
engine_test = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
# O SQLite empacotado no container pode não suportar INSERT..RETURNING com
# executemany (insertmanyvalues). Como todos os PKs são UUID gerados no client
# (default=uuid4), RETURNING é desnecessário — desabilitamos para evitar o erro.
engine_test.dialect.insert_returning = False
engine_test.dialect.update_returning = False
engine_test.dialect.delete_returning = False

TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    # Recria o schema do zero para não herdar tabelas obsoletas de runs anteriores.
    Base.metadata.drop_all(bind=engine_test)
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture()
def rate_limit_enabled():
    """Religa o rate limiter (desabilitado globalmente) só para os testes que o exercem."""
    _limiter.enabled = True
    try:
        _limiter.reset()
    except Exception:
        pass
    yield
    try:
        _limiter.reset()
    except Exception:
        pass
    _limiter.enabled = False


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
    # Reset rate limiter counters between tests
    from app.core.limiter import limiter
    try:
        limiter.reset()
    except Exception:
        pass
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def ws_setup(client, db):
    """Register a user, upgrade org to standard, return headers + org_slug + workspace_id."""
    import uuid
    email = f"wsuser_{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "WS User", "password": "Test1234!"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    # X-Requested-With satisfaz o middleware CSRF em requests mutantes (POST/PUT/DELETE),
    # espelhando o que o frontend envia via axios.
    headers = {"Authorization": f"Bearer {token}", "X-Requested-With": "XMLHttpRequest"}

    # Resolve org_slug via the list endpoint
    orgs_resp = client.get("/api/v1/orgs", headers=headers)
    assert orgs_resp.status_code == 200, orgs_resp.text
    org_slug = orgs_resp.json()["organizations"][0]["slug"]

    from app.models.db_models import Organization
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    # "standard" é o tier pago que libera FinOps/budgets/webhooks (não existe mais "pro").
    org.plan_tier = "standard"
    db.commit()

    ws_resp = client.get(f"/api/v1/orgs/{org_slug}/workspaces", headers=headers)
    assert ws_resp.status_code == 200, ws_resp.text
    workspace_id = ws_resp.json()["workspaces"][0]["id"]

    return {"headers": headers, "org_slug": org_slug, "workspace_id": workspace_id}
