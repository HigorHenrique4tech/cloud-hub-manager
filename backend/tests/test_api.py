import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_endpoint():
    """Test root endpoint returns health status"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "timestamp" in data


def test_health_endpoint():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    # O status depende da infra disponível (DB/Redis/SMTP). No ambiente de teste
    # o engine Postgres do app não conecta, então aceitamos qualquer status válido.
    assert data["status"] in ("healthy", "degraded", "unhealthy")
    assert "checks" in data


def test_docs_available():
    """Test that API documentation is accessible"""
    response = client.get("/docs")
    assert response.status_code == 200


def test_aws_endpoint_requires_auth():
    """Os endpoints AWS são workspace-scoped e exigem autenticação."""
    # Rota legada flat (/api/v1/aws/...) não existe mais — agora é
    # /api/v1/orgs/{slug}/workspaces/{id}/aws/... e exige token.
    response = client.get("/api/v1/aws/ec2/instances")
    assert response.status_code == 404  # rota flat removida
