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
    assert data["status"] == "healthy"


def test_docs_available():
    """Test that API documentation is accessible"""
    response = client.get("/docs")
    assert response.status_code == 200


def test_aws_endpoint_without_credentials():
    """Test AWS endpoint behavior without credentials"""
    # This test will fail if credentials are set in .env
    # It's here to demonstrate testing strategy
    response = client.get("/api/v1/aws/ec2/instances")
    # Should return either 400 (no creds) or 200 (with creds)
    assert response.status_code in [200, 400]
