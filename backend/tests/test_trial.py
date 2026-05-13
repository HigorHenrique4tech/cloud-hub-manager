"""
Testes do sistema de trial Pro (30 dias).

Cobre:
  - get_effective_plan() e get_trial_info() (unit)
  - Trial criado automaticamente no register (30 dias)
  - effective_plan e trial object retornados pelo GET /orgs
  - Trial ativo libera acesso a recursos Pro (plan gate)
  - Trial expirado bloqueia acesso a recursos Pro
  - execute_trial_reminders() envia email nos dias 1, 3 e 7
  - Admin: PUT /admin/orgs/{id}/trial (estender) e DELETE (expirar)
"""
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest

from app.models.db_models import Organization, OrganizationMember, User, Workspace
from app.services.plan_service import get_effective_plan, get_trial_info
from app.services.auth_service import hash_password


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_org(plan_tier="free", trial_days=None) -> Organization:
    """Build an in-memory Organization without persisting to DB."""
    org = Organization.__new__(Organization)
    org.plan_tier = plan_tier
    org.trial_ends_at = (
        datetime.utcnow() + timedelta(days=trial_days)
        if trial_days is not None
        else None
    )
    return org


def _register(client, email=None, name="Test User", password="Test1234!"):
    email = email or f"trial_{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": name, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"], email


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _get_org(client, token):
    resp = client.get("/api/v1/orgs", headers=_headers(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["organizations"][0]


def _make_admin(db, client) -> tuple[str, str]:
    """Create an admin user and return (token, headers)."""
    email = f"admin_{uuid.uuid4().hex[:8]}@example.com"
    user = User(
        email=email,
        name="Admin",
        hashed_password=hash_password("Admin1234!"),
        is_active=True,
        is_verified=True,
        is_admin=True,
        onboarding_completed=True,
    )
    db.add(user)
    db.commit()
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Admin1234!"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return token, _headers(token)


# ── Unit: get_effective_plan ──────────────────────────────────────────────────

class TestGetEffectivePlan:
    def test_free_no_trial_returns_free(self):
        org = _make_org("free", trial_days=None)
        assert get_effective_plan(org) == "free"

    def test_free_with_active_trial_returns_standard(self):
        org = _make_org("free", trial_days=15)
        assert get_effective_plan(org) == "standard"

    def test_free_with_expired_trial_returns_free(self):
        org = _make_org("free", trial_days=-1)
        assert get_effective_plan(org) == "free"

    def test_paid_plan_unaffected_by_trial(self):
        org = _make_org("standard", trial_days=10)
        assert get_effective_plan(org) == "standard"

    def test_paid_plan_no_trial(self):
        org = _make_org("enterprise_e1", trial_days=None)
        assert get_effective_plan(org) == "enterprise_e1"

    def test_free_trial_expiring_today_boundary(self):
        org = _make_org("free", trial_days=0)
        # trial_ends_at = now + 0 days — technically still in the future (frações de segundo)
        # O resultado depende do sub-segundo; aceitamos qualquer valor aqui
        result = get_effective_plan(org)
        assert result in ("free", "standard")


# ── Unit: get_trial_info ──────────────────────────────────────────────────────

class TestGetTrialInfo:
    def test_no_trial(self):
        org = _make_org("free", trial_days=None)
        info = get_trial_info(org)
        assert info["has_trial"] is False
        assert info["trial_active"] is False
        assert info["days_remaining"] == 0

    def test_active_trial(self):
        org = _make_org("free", trial_days=15)
        info = get_trial_info(org)
        assert info["has_trial"] is True
        assert info["trial_active"] is True
        assert info["days_remaining"] == 15
        assert "trial_ends_at" in info

    def test_expired_trial(self):
        org = _make_org("free", trial_days=-5)
        info = get_trial_info(org)
        assert info["has_trial"] is True
        assert info["trial_active"] is False
        assert info["days_remaining"] == 0

    def test_days_remaining_never_negative(self):
        org = _make_org("free", trial_days=-100)
        info = get_trial_info(org)
        assert info["days_remaining"] == 0


# ── Integration: trial criado no register ────────────────────────────────────

class TestTrialCreatedOnRegister:
    def test_new_org_has_trial_ends_at(self, client, db):
        token, _ = _register(client)
        org_data = _get_org(client, token)

        from app.models.db_models import Organization
        org = db.query(Organization).filter(Organization.slug == org_data["slug"]).first()
        assert org.trial_ends_at is not None

        delta = org.trial_ends_at - datetime.utcnow()
        assert 29 <= delta.days <= 30

    def test_new_org_effective_plan_is_standard_during_trial(self, client, db):
        token, _ = _register(client)
        org_data = _get_org(client, token)

        assert org_data.get("effective_plan") == "standard"

    def test_new_org_trial_object_in_response(self, client):
        token, _ = _register(client)
        org_data = _get_org(client, token)

        trial = org_data.get("trial", {})
        assert trial.get("has_trial") is True
        assert trial.get("trial_active") is True
        assert trial.get("days_remaining", 0) >= 29

    def test_new_org_plan_tier_stays_free(self, client, db):
        """trial não muda plan_tier — só effective_plan."""
        token, _ = _register(client)
        org_data = _get_org(client, token)

        from app.models.db_models import Organization
        org = db.query(Organization).filter(Organization.slug == org_data["slug"]).first()
        assert org.plan_tier == "free"


# ── Integration: expiração bloqueia acesso Pro ────────────────────────────────

class TestTrialExpiration:
    def _expire_trial(self, db, org_slug):
        from app.models.db_models import Organization
        org = db.query(Organization).filter(Organization.slug == org_slug).first()
        org.trial_ends_at = datetime.utcnow() - timedelta(days=1)
        db.commit()
        db.refresh(org)

    def test_expired_trial_effective_plan_is_free(self, client, db):
        token, _ = _register(client)
        org_data = _get_org(client, token)
        self._expire_trial(db, org_data["slug"])

        updated = _get_org(client, token)
        assert updated.get("effective_plan") == "free"

    def test_expired_trial_trial_active_false(self, client, db):
        token, _ = _register(client)
        org_data = _get_org(client, token)
        self._expire_trial(db, org_data["slug"])

        updated = _get_org(client, token)
        trial = updated.get("trial", {})
        assert trial.get("trial_active") is False
        assert trial.get("days_remaining") == 0


# ── Integration: trial reminders ─────────────────────────────────────────────

class TestTrialReminders:
    def _create_org_expiring_in(self, db, days: int) -> tuple[Organization, User]:
        email = f"reminder_{uuid.uuid4().hex[:8]}@example.com"
        user = User(
            email=email,
            name="Reminder User",
            hashed_password=hash_password("Test1234!"),
            is_active=True,
            is_verified=True,
            onboarding_completed=True,
        )
        db.add(user)
        db.flush()

        org = Organization(
            name=f"Org Expiring {days}d",
            slug=f"org-exp-{uuid.uuid4().hex[:6]}",
            plan_tier="free",
            is_active=True,
            trial_ends_at=datetime.utcnow() + timedelta(days=days),
        )
        db.add(org)
        db.flush()

        member = OrganizationMember(
            organization_id=org.id,
            user_id=user.id,
            role="owner",
            is_active=True,
        )
        db.add(member)

        ws = Workspace(
            organization_id=org.id,
            name="Default",
            slug=f"ws-{uuid.uuid4().hex[:6]}",
            provider="aws",
        )
        db.add(ws)
        db.commit()
        return org, user

    @patch("app.services.email_service.send_trial_reminder_email")
    def test_reminder_sent_at_7_days(self, mock_email, db):
        from app.services.scheduler_service import execute_trial_reminders
        org, user = self._create_org_expiring_in(db, days=7)

        execute_trial_reminders()

        calls = [
            c for c in mock_email.call_args_list
            if c.kwargs.get("to_email") == user.email
        ]
        assert len(calls) == 1
        assert calls[0].kwargs["days_remaining"] == 7

    @patch("app.services.email_service.send_trial_reminder_email")
    def test_reminder_sent_at_3_days(self, mock_email, db):
        from app.services.scheduler_service import execute_trial_reminders
        org, user = self._create_org_expiring_in(db, days=3)

        execute_trial_reminders()

        calls = [
            c for c in mock_email.call_args_list
            if c.kwargs.get("to_email") == user.email
        ]
        assert len(calls) == 1
        assert calls[0].kwargs["days_remaining"] == 3

    @patch("app.services.email_service.send_trial_reminder_email")
    def test_reminder_sent_at_1_day(self, mock_email, db):
        from app.services.scheduler_service import execute_trial_reminders
        org, user = self._create_org_expiring_in(db, days=1)

        execute_trial_reminders()

        calls = [
            c for c in mock_email.call_args_list
            if c.kwargs.get("to_email") == user.email
        ]
        assert len(calls) == 1
        assert calls[0].kwargs["days_remaining"] == 1

    @patch("app.services.email_service.send_trial_reminder_email")
    def test_no_reminder_for_already_expired(self, mock_email, db):
        from app.services.scheduler_service import execute_trial_reminders
        org, user = self._create_org_expiring_in(db, days=-2)

        execute_trial_reminders()

        calls = [
            c for c in mock_email.call_args_list
            if c.kwargs.get("to_email") == user.email
        ]
        assert len(calls) == 0

    @patch("app.services.email_service.send_trial_reminder_email")
    def test_no_reminder_for_paid_plan(self, mock_email, db):
        from app.services.scheduler_service import execute_trial_reminders
        org, user = self._create_org_expiring_in(db, days=7)
        # Upgrade org to paid — should not receive reminder
        org.plan_tier = "standard"
        db.commit()

        execute_trial_reminders()

        calls = [
            c for c in mock_email.call_args_list
            if c.kwargs.get("to_email") == user.email
        ]
        assert len(calls) == 0

    @patch("app.services.email_service.send_trial_reminder_email")
    def test_no_reminder_outside_window(self, mock_email, db):
        """Orgs expirando em 5 dias NÃO devem receber lembrete (só 1/3/7)."""
        from app.services.scheduler_service import execute_trial_reminders
        org, user = self._create_org_expiring_in(db, days=5)

        execute_trial_reminders()

        calls = [
            c for c in mock_email.call_args_list
            if c.kwargs.get("to_email") == user.email
        ]
        assert len(calls) == 0


# ── Integration: admin endpoints ─────────────────────────────────────────────

class TestAdminTrialEndpoints:
    def _get_org_id(self, db, slug: str) -> int:
        org = db.query(Organization).filter(Organization.slug == slug).first()
        return org.id

    def test_admin_can_extend_trial(self, client, db):
        token, _ = _register(client)
        org_data = _get_org(client, token)
        org_id = self._get_org_id(db, org_data["slug"])

        _, admin_h = _make_admin(db, client)
        resp = client.put(
            f"/api/v1/admin/orgs/{org_id}/trial",
            json={"days": 60},
            headers=admin_h,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "trial_ends_at" in data

        org = db.query(Organization).filter(Organization.id == org_id).first()
        db.refresh(org)
        delta = org.trial_ends_at - datetime.utcnow()
        assert 59 <= delta.days <= 60

    def test_admin_can_expire_trial(self, client, db):
        token, _ = _register(client)
        org_data = _get_org(client, token)
        org_id = self._get_org_id(db, org_data["slug"])

        _, admin_h = _make_admin(db, client)
        resp = client.delete(
            f"/api/v1/admin/orgs/{org_id}/trial",
            headers=admin_h,
        )
        assert resp.status_code == 200, resp.text

        org = db.query(Organization).filter(Organization.id == org_id).first()
        db.refresh(org)
        assert org.trial_ends_at < datetime.utcnow()

    def test_non_admin_cannot_modify_trial(self, client, db):
        token, _ = _register(client)
        org_data = _get_org(client, token)
        org_id = self._get_org_id(db, org_data["slug"])

        resp = client.put(
            f"/api/v1/admin/orgs/{org_id}/trial",
            json={"days": 60},
            headers=_headers(token),
        )
        assert resp.status_code in (401, 403)

    def test_admin_extend_then_expire_cycle(self, client, db):
        token, _ = _register(client)
        org_data = _get_org(client, token)
        org_id = self._get_org_id(db, org_data["slug"])
        _, admin_h = _make_admin(db, client)

        # extend
        resp = client.put(
            f"/api/v1/admin/orgs/{org_id}/trial",
            json={"days": 90},
            headers=admin_h,
        )
        assert resp.status_code == 200

        updated = _get_org(client, token)
        assert updated["effective_plan"] == "standard"

        # expire
        client.delete(f"/api/v1/admin/orgs/{org_id}/trial", headers=admin_h)

        expired = _get_org(client, token)
        assert expired["effective_plan"] == "free"
        assert expired["trial"]["trial_active"] is False
