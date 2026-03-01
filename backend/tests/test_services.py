"""
Unit tests for pure service helpers — no DB, no HTTP.
"""
import json
import pytest


# ── auth_service ──────────────────────────────────────────────────────────────

from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    encrypt_credential,
    decrypt_credential,
)


def test_hash_password_produces_bcrypt():
    hashed = hash_password("MySecret123!")
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")


def test_verify_password_correct():
    hashed = hash_password("CorrectHorse!")
    assert verify_password("CorrectHorse!", hashed) is True


def test_verify_password_wrong():
    hashed = hash_password("CorrectHorse!")
    assert verify_password("WrongPassword!", hashed) is False


def test_create_and_decode_token():
    token = create_access_token("user@example.com")
    subject = decode_token(token)
    assert subject == "user@example.com"


def test_decode_invalid_token_returns_none():
    result = decode_token("not.a.valid.jwt")
    assert result is None


def test_encrypt_decrypt_credential_roundtrip():
    original = {"access_key_id": "AKIAIOSFODNN7EXAMPLE", "secret_access_key": "wJalrXUt"}
    encrypted = encrypt_credential(original)
    assert isinstance(encrypted, str)
    assert encrypted != json.dumps(original)
    decrypted = decrypt_credential(encrypted)
    assert decrypted == original


# ── finops helpers (pure Python, no I/O) ─────────────────────────────────────

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.api.finops import _linear_forecast


def test_linear_forecast_returns_correct_length():
    values = [10.0, 11.0, 12.0, 11.5, 13.0, 14.0, 12.5, 13.5, 15.0, 14.0]
    result = _linear_forecast(values, forecast_days=15)
    assert len(result) == 15


def test_linear_forecast_all_non_negative():
    values = [5.0, 5.5, 6.0, 5.8, 6.2, 6.5, 6.1, 6.8, 7.0, 6.9]
    result = _linear_forecast(values, forecast_days=10)
    assert all(v >= 0.0 for v in result)


def test_linear_forecast_insufficient_data_returns_zeros():
    result = _linear_forecast([1.0, 2.0, 3.0], forecast_days=7)
    assert result == [0.0] * 7


# ── finops_service anomaly detector ──────────────────────────────────────────

from app.services.finops_service import detect_cost_anomalies


def test_detect_anomaly_spike_detected():
    # Stable baseline of ~10 then a 10x spike
    baseline = [10.0] * 28
    spike = [100.0, 100.0]
    result = detect_cost_anomalies(baseline + spike, "EC2", "aws")
    assert result is not None
    assert result["provider"] == "aws"
    assert result["service_name"] == "EC2"
    assert result["actual_cost"] > result["baseline_cost"]


def test_detect_anomaly_no_spike():
    # Normal variation — no anomaly expected
    normal = [10.0, 10.2, 9.8, 10.1, 10.3, 9.9, 10.0, 10.1, 10.2, 10.0]
    result = detect_cost_anomalies(normal, "S3", "aws")
    assert result is None


def test_detect_anomaly_insufficient_data():
    result = detect_cost_anomalies([10.0, 20.0, 30.0], "RDS", "aws")
    assert result is None
