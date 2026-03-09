"""
Testes do módulo de faturamento (billing.py).

Cobre:
  - POST /checkout      — criação de cobrança, validação de plano, permissão
  - GET  /verify/{id}   — verificação de status e ativação do plano
  - GET  /history       — histórico de pagamentos
  - POST /billing/webhook — webhook do AbacatePay: segurança, idempotência,
                             ativação de plano, transições de status
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest


# ── URLs ──────────────────────────────────────────────────────────────────────

CHECKOUT_URL  = "/api/v1/orgs/{org}/billing/checkout"
VERIFY_URL    = "/api/v1/orgs/{org}/billing/verify/{pid}"
HISTORY_URL   = "/api/v1/orgs/{org}/billing/history"
WEBHOOK_URL   = "/api/v1/billing/webhook"

WEBHOOK_SECRET = "test-webhook-secret"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def billing_setup(client, db, ws_setup):
    """ws_setup + ABACATEPAY_WEBHOOK_SECRET configurado."""
    import app.api.billing as billing_mod
    from app.core.config import settings

    original_secret = getattr(settings, "ABACATEPAY_WEBHOOK_SECRET", "")
    settings.ABACATEPAY_WEBHOOK_SECRET = WEBHOOK_SECRET
    yield ws_setup
    settings.ABACATEPAY_WEBHOOK_SECRET = original_secret


def _checkout_url(setup):
    return CHECKOUT_URL.format(org=setup["org_slug"])


def _verify_url(setup, payment_id):
    return VERIFY_URL.format(org=setup["org_slug"], pid=payment_id)


def _history_url(setup):
    return HISTORY_URL.format(org=setup["org_slug"])


# ── POST /checkout ─────────────────────────────────────────────────────────────


@patch(
    "app.api.billing.create_billing",
    new_callable=AsyncMock,
    return_value={"id": "bill_mock_001", "url": "https://pay.example.com/checkout/1"},
)
def test_checkout_creates_payment(mock_create, client, billing_setup):
    resp = client.post(
        _checkout_url(billing_setup),
        json={"plan_tier": "pro"},
        headers=billing_setup["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "payment_id" in data
    assert "payment_url" in data
    assert data["plan_tier"] == "pro"
    assert data["amount"] > 0
    mock_create.assert_called_once()


@patch(
    "app.api.billing.create_billing",
    new_callable=AsyncMock,
    return_value={"id": "bill_mock_002", "url": None},
)
def test_checkout_dev_mode_returns_success_url(mock_create, client, billing_setup):
    """Quando AbacatePay não retorna URL (modo dev), deve redirecionar para /billing/success."""
    resp = client.post(
        _checkout_url(billing_setup),
        json={"plan_tier": "pro"},
        headers=billing_setup["headers"],
    )
    assert resp.status_code == 200
    assert "billing/success" in resp.json()["payment_url"]


def test_checkout_invalid_plan(client, billing_setup):
    resp = client.post(
        _checkout_url(billing_setup),
        json={"plan_tier": "enterprise"},
        headers=billing_setup["headers"],
    )
    assert resp.status_code == 400
    assert "inválido" in resp.json()["detail"].lower()


def test_checkout_already_on_same_plan(client, billing_setup, db):
    """Tentar fazer checkout do mesmo plano atual deve retornar 400."""
    from app.models.db_models import Organization
    org = db.query(Organization).filter(
        Organization.slug == billing_setup["org_slug"]
    ).first()
    org.plan_tier = "pro"
    db.commit()

    resp = client.post(
        _checkout_url(billing_setup),
        json={"plan_tier": "pro"},
        headers=billing_setup["headers"],
    )
    assert resp.status_code == 400
    assert "já está" in resp.json()["detail"].lower()


def test_checkout_requires_authentication(client, billing_setup):
    resp = client.post(_checkout_url(billing_setup), json={"plan_tier": "pro"})
    assert resp.status_code == 401


def test_checkout_requires_owner_or_admin(client, billing_setup, db):
    """Usuário sem permissão org.settings.edit não pode fazer checkout."""
    email = f"viewer_{uuid.uuid4().hex[:6]}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Viewer", "password": "Test1234!"},
    )
    assert reg.status_code == 201
    viewer_token = reg.json()["access_token"]

    resp = client.post(
        _checkout_url(billing_setup),
        json={"plan_tier": "pro"},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    # Deve ser 403 (sem permissão) ou 404 (org diferente)
    assert resp.status_code in (403, 404)


# ── GET /verify/{payment_id} ───────────────────────────────────────────────────


def _create_pending_payment(db, org_id, user_id, billing_id="bill_test_001"):
    from app.models.db_models import Payment
    p = Payment(
        organization_id=org_id,
        user_id=user_id,
        abacate_billing_id=billing_id,
        plan_tier="pro",
        amount=9900,
        status="PENDING",
        payment_url="https://pay.example.com/checkout/x",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _get_org_and_user(db, org_slug, user_email):
    from app.models.db_models import Organization, User
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    user = db.query(User).filter(User.email == user_email).first()
    return org, user


def test_verify_payment_not_found(client, billing_setup):
    resp = client.get(
        _verify_url(billing_setup, "00000000-0000-0000-0000-000000000000"),
        headers=billing_setup["headers"],
    )
    assert resp.status_code == 404


@patch(
    "app.api.billing.check_billing_status",
    new_callable=AsyncMock,
    return_value="PAID",
)
def test_verify_payment_activates_plan(mock_check, client, billing_setup, db):
    from app.models.db_models import Organization, OrgMember
    org = db.query(Organization).filter(
        Organization.slug == billing_setup["org_slug"]
    ).first()
    org.plan_tier = "free"
    db.commit()

    # Encontrar o usuário owner
    member_row = db.query(OrgMember).filter(
        OrgMember.organization_id == org.id
    ).first()

    payment = _create_pending_payment(db, org.id, member_row.user_id, "bill_verify_paid")

    resp = client.get(
        _verify_url(billing_setup, str(payment.id)),
        headers=billing_setup["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "PAID"

    # Org deve ter sido atualizada
    db.refresh(org)
    assert org.plan_tier == "pro"


@patch(
    "app.api.billing.check_billing_status",
    new_callable=AsyncMock,
    return_value="PAID",
)
def test_verify_already_paid_is_idempotent(mock_check, client, billing_setup, db):
    """Verificar um pagamento já PAID não deve chamar check_billing_status."""
    from app.models.db_models import OrgMember, Organization, Payment
    org = db.query(Organization).filter(
        Organization.slug == billing_setup["org_slug"]
    ).first()
    member_row = db.query(OrgMember).filter(
        OrgMember.organization_id == org.id
    ).first()

    from datetime import datetime
    p = Payment(
        organization_id=org.id,
        user_id=member_row.user_id,
        abacate_billing_id="bill_already_paid",
        plan_tier="pro",
        amount=9900,
        status="PAID",
        payment_url="https://pay.example.com/x",
        paid_at=datetime.utcnow(),
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    resp = client.get(
        _verify_url(billing_setup, str(p.id)),
        headers=billing_setup["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "PAID"
    mock_check.assert_not_called()


@patch(
    "app.api.billing.check_billing_status",
    new_callable=AsyncMock,
    return_value="EXPIRED",
)
def test_verify_expired_payment(mock_check, client, billing_setup, db):
    from app.models.db_models import OrgMember, Organization
    org = db.query(Organization).filter(
        Organization.slug == billing_setup["org_slug"]
    ).first()
    member_row = db.query(OrgMember).filter(
        OrgMember.organization_id == org.id
    ).first()

    payment = _create_pending_payment(db, org.id, member_row.user_id, "bill_verify_expired")

    resp = client.get(
        _verify_url(billing_setup, str(payment.id)),
        headers=billing_setup["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "EXPIRED"


# ── GET /history ──────────────────────────────────────────────────────────────


def test_history_returns_list(client, billing_setup):
    resp = client.get(_history_url(billing_setup), headers=billing_setup["headers"])
    assert resp.status_code == 200
    assert "payments" in resp.json()
    assert isinstance(resp.json()["payments"], list)


def test_history_requires_authentication(client, billing_setup):
    resp = client.get(_history_url(billing_setup))
    assert resp.status_code == 401


# ── POST /billing/webhook (AbacatePay) ────────────────────────────────────────


def _webhook_headers(token=WEBHOOK_SECRET):
    return {"X-AbacatePay-Token": token}


def test_webhook_missing_token_returns_403(client, billing_setup):
    resp = client.post(WEBHOOK_URL, json={"id": "bill_x", "status": "PAID"})
    assert resp.status_code == 403


def test_webhook_wrong_token_returns_403(client, billing_setup):
    resp = client.post(
        WEBHOOK_URL,
        json={"id": "bill_x", "status": "PAID"},
        headers={"X-AbacatePay-Token": "wrong-secret"},
    )
    assert resp.status_code == 403


def test_webhook_missing_payload_fields_acknowledged(client, billing_setup):
    """Payload sem 'id' ou 'status' deve retornar received=True sem erro."""
    resp = client.post(
        WEBHOOK_URL,
        json={"extra": "data"},
        headers=_webhook_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["received"] is True


def test_webhook_unknown_billing_id_acknowledged(client, billing_setup):
    """billing_id desconhecido não deve explodir — apenas loga e retorna received."""
    resp = client.post(
        WEBHOOK_URL,
        json={"id": "bill_unknown_999", "status": "PAID"},
        headers=_webhook_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["received"] is True


def test_webhook_paid_activates_plan(client, billing_setup, db):
    """Webhook PAID deve marcar payment como PAID e atualizar plan_tier da org."""
    from app.models.db_models import Organization, OrgMember

    org = db.query(Organization).filter(
        Organization.slug == billing_setup["org_slug"]
    ).first()
    org.plan_tier = "free"
    db.commit()

    member_row = db.query(OrgMember).filter(
        OrgMember.organization_id == org.id
    ).first()

    payment = _create_pending_payment(
        db, org.id, member_row.user_id, billing_id="bill_webhook_paid"
    )

    resp = client.post(
        WEBHOOK_URL,
        json={"id": "bill_webhook_paid", "status": "PAID"},
        headers=_webhook_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["received"] is True

    # Verificar no banco
    db.expire_all()
    db.refresh(payment)
    db.refresh(org)
    assert payment.status == "PAID"
    assert payment.paid_at is not None
    assert org.plan_tier == "pro"


def test_webhook_paid_idempotent(client, billing_setup, db):
    """Webhook PAID num pagamento já PAID não deve reprocessar nem dar erro."""
    from datetime import datetime
    from app.models.db_models import OrgMember, Organization, Payment

    org = db.query(Organization).filter(
        Organization.slug == billing_setup["org_slug"]
    ).first()
    member_row = db.query(OrgMember).filter(
        OrgMember.organization_id == org.id
    ).first()

    p = Payment(
        organization_id=org.id,
        user_id=member_row.user_id,
        abacate_billing_id="bill_wh_idempotent",
        plan_tier="pro",
        amount=9900,
        status="PAID",
        payment_url="https://pay.example.com/x",
        paid_at=datetime.utcnow(),
    )
    db.add(p)
    db.commit()

    resp = client.post(
        WEBHOOK_URL,
        json={"id": "bill_wh_idempotent", "status": "PAID"},
        headers=_webhook_headers(),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["received"] is True
    assert data.get("already_paid") is True


@pytest.mark.parametrize("status", ["EXPIRED", "CANCELLED", "REFUNDED"])
def test_webhook_negative_statuses_update_payment(status, client, billing_setup, db):
    """Webhook com status negativo (EXPIRED/CANCELLED/REFUNDED) deve atualizar o pagamento."""
    from app.models.db_models import OrgMember, Organization

    org = db.query(Organization).filter(
        Organization.slug == billing_setup["org_slug"]
    ).first()
    member_row = db.query(OrgMember).filter(
        OrgMember.organization_id == org.id
    ).first()

    billing_id = f"bill_wh_{status.lower()}_{uuid.uuid4().hex[:6]}"
    payment = _create_pending_payment(db, org.id, member_row.user_id, billing_id)

    resp = client.post(
        WEBHOOK_URL,
        json={"id": billing_id, "status": status},
        headers=_webhook_headers(),
    )
    assert resp.status_code == 200

    db.expire_all()
    db.refresh(payment)
    assert payment.status == status


def test_webhook_nested_billing_payload(client, billing_setup, db):
    """AbacatePay pode enviar o payload aninhado: {'billing': {'id': ..., 'status': ...}}"""
    from app.models.db_models import OrgMember, Organization

    org = db.query(Organization).filter(
        Organization.slug == billing_setup["org_slug"]
    ).first()
    org.plan_tier = "free"
    db.commit()

    member_row = db.query(OrgMember).filter(
        OrgMember.organization_id == org.id
    ).first()

    payment = _create_pending_payment(
        db, org.id, member_row.user_id, billing_id="bill_wh_nested"
    )

    resp = client.post(
        WEBHOOK_URL,
        json={"billing": {"id": "bill_wh_nested", "status": "PAID"}},
        headers=_webhook_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["received"] is True

    db.expire_all()
    db.refresh(payment)
    assert payment.status == "PAID"
