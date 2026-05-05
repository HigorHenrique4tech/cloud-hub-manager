"""
Partner Center API — visibilidade de clientes CSP, importação como orgs parceiras.

Plano mínimo: enterprise
Credenciais são compartilhadas com Security Automation (PartnerCenterConfig).
"""
import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_context import MemberContext
from app.core.dependencies import require_permission
from app.database import get_db
from app.models.db_models import PartnerCenterConfig, Organization, Workspace, OrganizationMember, WorkspaceMember
from app.services.plan_service import check_workspace_limit

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/orgs/{org_slug}/workspaces/{workspace_id}/partner-center",
    tags=["Partner Center"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

_ENTERPRISE_PLANS = {"enterprise", "enterprise_e1", "enterprise_e2", "enterprise_e3", "enterprise_migration"}

def _check_enterprise(member: MemberContext, db: Session):
    from app.services.plan_service import get_effective_plan
    org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organização não encontrada")
    plan = get_effective_plan(org)
    if plan not in _ENTERPRISE_PLANS:
        raise HTTPException(403, "Partner Center requer plano Enterprise.")


def _get_creds(db: Session, workspace_id) -> dict:
    """Obtém credenciais Partner Center descriptografadas ou lança 400."""
    from app.services.partner_center_service import decrypt_pc_credentials
    creds = decrypt_pc_credentials(db, workspace_id)
    if not creds:
        raise HTTPException(400, "Partner Center não configurado. Configure em Segurança > Partner Center.")
    return creds


def _pc_token(creds: dict) -> str:
    """Obtém token Partner Center usando ROPC (se username/password presentes) ou client_credentials."""
    from app.services.partner_center_service import get_partner_center_token
    return get_partner_center_token(
        creds["partner_tenant_id"],
        creds["client_id"],
        creds["client_secret"],
        username=creds.get("username"),
        password=creds.get("password"),
    )


def _slugify(name: str) -> str:
    """Gera um slug único a partir do nome."""
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return slug[:80] if slug else "org"


def _ensure_unique_slug(db: Session, base: str) -> str:
    slug = base
    counter = 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


# ── Schemas ───────────────────────────────────────────────────────────────────

class ImportCustomerBody(BaseModel):
    customer_id: str
    customer_name: str
    customer_tenant_id: str


class SyncCustomersBody(BaseModel):
    customer_ids: list[str]


class UpdateSubscriptionQuantityBody(BaseModel):
    quantity: int


class CartLineItemIn(BaseModel):
    catalog_item_id: str
    quantity: int
    billing_cycle: str = "monthly"  # monthly | annual
    term_duration: str = "P1Y"      # ISO 8601


class CreateCartBody(BaseModel):
    line_items: list[CartLineItemIn]


# ── Status ────────────────────────────────────────────────────────────────────

@ws_router.get("/status")
def get_status(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Verifica se o Partner Center está configurado e testa o token."""
    _check_enterprise(member, db)
    cfg = (db.query(PartnerCenterConfig)
           .filter(PartnerCenterConfig.workspace_id == member.workspace_id)
           .first())
    if not cfg:
        return {"configured": False}

    # Test token
    try:
        from app.services.partner_center_service import decrypt_pc_credentials
        creds = decrypt_pc_credentials(db, member.workspace_id)
        if not creds:
            return {"configured": False}
        _pc_token(creds)
        return {
            "configured": True,
            "partner_tenant_id": cfg.partner_tenant_id,
            "token_valid": True,
            "updated_at": cfg.updated_at.isoformat(),
        }
    except Exception as exc:
        return {
            "configured": True,
            "partner_tenant_id": cfg.partner_tenant_id,
            "token_valid": False,
            "error": str(exc),
            "updated_at": cfg.updated_at.isoformat(),
        }


# ── Customers ─────────────────────────────────────────────────────────────────

@ws_router.get("/customers")
def list_customers(
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Lista todos os clientes CSP do partner."""
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import list_customers as _list
        pc_token = _pc_token(creds)
        customers = _list(pc_token)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        logger.error("Erro ao listar clientes Partner Center: %s", exc, exc_info=True)
        raise HTTPException(502, f"Erro ao consultar Partner Center: {exc}")

    # Enrich with import status (already synced as managed org?)
    master_org_id = member.organization_id
    synced_ids = {
        row.partner_center_id
        for row in db.query(Organization.partner_center_id)
        .filter(
            Organization.partner_center_id.isnot(None),
            Organization.parent_org_id == master_org_id,
        )
        .all()
    }

    for c in customers:
        c["synced"] = c["id"] in synced_ids

    return {"customers": customers, "total": len(customers)}


@ws_router.get("/customers/{customer_id}/subscriptions")
def get_customer_subscriptions(
    customer_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Lista assinaturas de um cliente específico."""
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import list_customer_subscriptions
        pc_token = _pc_token(creds)
        subs = list_customer_subscriptions(pc_token, customer_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Erro ao consultar assinaturas: {exc}")

    return {"subscriptions": subs, "total": len(subs)}


@ws_router.patch("/customers/{customer_id}/subscriptions/{subscription_id}/quantity")
def update_subscription_quantity_endpoint(
    customer_id: str,
    subscription_id: str,
    body: UpdateSubscriptionQuantityBody,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    """Altera a quantidade de licenças de uma assinatura CSP."""
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import (
            get_partner_center_token,
            update_subscription_quantity,
        )
        pc_token = _pc_token(creds)
        result = update_subscription_quantity(pc_token, customer_id, subscription_id, body.quantity)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Erro ao alterar quantidade: {exc}")

    from app.services.log_service import log_activity
    log_activity(
        db, member.user, "partner_center.quantity_update", "PartnerSubscription",
        resource_name=f"{customer_id}/{subscription_id}",
        provider="partner_center",
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    return result


# ── Catalog (Products / SKUs / Availabilities) ───────────────────────────────

@ws_router.get("/catalog/products")
def list_catalog_products(
    country: str = Query("BR"),
    target_view: str = Query("Online"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Lista produtos do catálogo CSP por país e target view."""
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import (
            get_partner_center_token,
            list_products,
        )
        pc_token = _pc_token(creds)
        products = list_products(pc_token, country=country, target_view=target_view)
    except Exception as exc:
        raise HTTPException(502, f"Erro ao consultar catálogo: {exc}")
    return {"products": products, "total": len(products)}


@ws_router.get("/catalog/products/{product_id}/skus")
def list_catalog_skus(
    product_id: str,
    country: str = Query("BR"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import (
            get_partner_center_token,
            list_skus,
        )
        pc_token = _pc_token(creds)
        skus = list_skus(pc_token, product_id, country=country)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Erro ao consultar SKUs: {exc}")
    return {"skus": skus, "total": len(skus)}


@ws_router.get("/catalog/products/{product_id}/skus/{sku_id}/availabilities")
def list_catalog_availabilities(
    product_id: str,
    sku_id: str,
    country: str = Query("BR"),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import (
            get_partner_center_token,
            list_availabilities,
        )
        pc_token = _pc_token(creds)
        avs = list_availabilities(pc_token, product_id, sku_id, country=country)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Erro ao consultar disponibilidades: {exc}")
    return {"availabilities": avs, "total": len(avs)}


@ws_router.post("/customers/{customer_id}/cart-checkout", status_code=201)
def cart_checkout_endpoint(
    customer_id: str,
    body: CreateCartBody,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    """Cria carrinho e faz checkout de uma vez. Retorna ordens criadas."""
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    line_items = [li.model_dump() for li in body.line_items]
    if not line_items:
        raise HTTPException(400, "Carrinho vazio: adicione pelo menos um item.")

    try:
        from app.services.partner_center_service import (
            get_partner_center_token,
            cart_checkout,
        )
        pc_token = _pc_token(creds)
        result = cart_checkout(pc_token, customer_id, line_items)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Erro ao finalizar compra: {exc}")

    from app.services.log_service import log_activity
    log_activity(
        db, member.user, "partner_center.subscription_create", "PartnerSubscription",
        resource_name=f"{customer_id} ({len(line_items)} item(s))",
        provider="partner_center",
        organization_id=member.organization_id,
        workspace_id=member.workspace_id,
    )
    return result


# ── Invoices ─────────────────────────────────────────────────────────────────

@ws_router.get("/invoices")
def list_invoices_endpoint(
    size: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Lista faturas do partner (paginado)."""
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import (
            get_partner_center_token,
            list_invoices,
        )
        pc_token = _pc_token(creds)
        return list_invoices(pc_token, size=size, offset=offset)
    except Exception as exc:
        raise HTTPException(502, f"Erro ao consultar faturas: {exc}")


@ws_router.get("/invoices/{invoice_id}")
def get_invoice_endpoint(
    invoice_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import (
            get_partner_center_token,
            get_invoice,
        )
        pc_token = _pc_token(creds)
        return get_invoice(pc_token, invoice_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Erro ao consultar fatura: {exc}")


@ws_router.get("/invoices/{invoice_id}/lineitems")
def get_invoice_lineitems_endpoint(
    invoice_id: str,
    provider: str = Query("onetime"),
    line_item_type: str = Query("billinglineitems"),
    size: int = Query(2000, ge=1, le=2000),
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    """Lista itens de uma fatura. provider: onetime|azure | line_item_type: billinglineitems|usagelineitems."""
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import (
            get_partner_center_token,
            list_invoice_lineitems,
        )
        pc_token = _pc_token(creds)
        items = list_invoice_lineitems(pc_token, invoice_id, provider=provider, line_item_type=line_item_type, size=size)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Erro ao consultar itens da fatura: {exc}")

    return {"items": items, "total": len(items)}


@ws_router.get("/invoices/{invoice_id}/pdf-url")
def get_invoice_pdf_url_endpoint(
    invoice_id: str,
    member: MemberContext = Depends(require_permission("resources.view")),
    db: Session = Depends(get_db),
):
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import (
            get_partner_center_token,
            get_invoice_pdf_url,
        )
        pc_token = _pc_token(creds)
        url = get_invoice_pdf_url(pc_token, invoice_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Erro ao obter PDF da fatura: {exc}")

    if not url:
        raise HTTPException(404, "PDF da fatura indisponível.")
    return {"url": url}


# ── Import / Sync ─────────────────────────────────────────────────────────────

@ws_router.post("/import")
def import_customer(
    body: ImportCustomerBody,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    """
    Importa um cliente CSP como organização parceira.
    Se já existir uma org com esse partner_center_id, atualiza o nome.
    """
    _check_enterprise(member, db)

    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not master_org:
        raise HTTPException(404, "Organização não encontrada.")
    if master_org.org_type not in ("master", "standalone"):
        raise HTTPException(400, "Apenas orgs master podem importar clientes Partner Center.")

    # Check if already imported
    existing = (
        db.query(Organization)
        .filter(
            Organization.partner_center_id == body.customer_id,
            Organization.parent_org_id == master_org.id,
        )
        .first()
    )
    if existing:
        existing.name = body.customer_name
        existing.partner_center_tenant = body.customer_tenant_id
        # Garante workspace caso não tenha sido criado na importação original
        ws = db.query(Workspace).filter(Workspace.organization_id == existing.id).first()
        if not ws:
            ws = Workspace(organization_id=existing.id, name="Default", slug="default")
            db.add(ws)
            db.flush()
        # Garante membership do usuário atual
        has_mem = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == existing.id,
            OrganizationMember.user_id == member.user.id,
        ).first()
        if not has_mem:
            db.add(OrganizationMember(organization_id=existing.id, user_id=member.user.id, role="owner"))
        has_ws_mem = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == ws.id,
            WorkspaceMember.user_id == member.user.id,
        ).first()
        if not has_ws_mem:
            db.add(WorkspaceMember(workspace_id=ws.id, user_id=member.user.id, role_override=None))
        db.commit()
        return {
            "action": "updated",
            "org_slug": existing.slug,
            "org_id": str(existing.id),
            "message": f"Organização '{body.customer_name}' atualizada.",
        }

    # Checar limite de workspaces antes de criar (cada org importada cria 1 workspace)
    ws_allowed, ws_current, ws_max = check_workspace_limit(db, master_org.id, master_org.plan_tier, "master")
    if not ws_allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Limite de workspaces atingido ({ws_current}/{ws_max}). Faça upgrade para importar mais clientes.",
        )

    # Create new partner org
    base_slug = _slugify(body.customer_name)
    slug = _ensure_unique_slug(db, base_slug)

    from app.services.plan_service import get_effective_plan
    master_plan = get_effective_plan(master_org)

    new_org = Organization(
        name=body.customer_name,
        slug=slug,
        plan_tier=master_plan,
        org_type="partner",
        parent_org_id=master_org.id,
        partner_center_id=body.customer_id,
        partner_center_tenant=body.customer_tenant_id,
    )
    db.add(new_org)
    db.flush()

    db.add(OrganizationMember(organization_id=new_org.id, user_id=member.user.id, role="owner"))

    ws = Workspace(organization_id=new_org.id, name="Default", slug="default")
    db.add(ws)
    db.flush()

    db.add(WorkspaceMember(workspace_id=ws.id, user_id=member.user.id, role_override=None))
    db.commit()
    db.refresh(new_org)

    return {
        "action": "created",
        "org_slug": new_org.slug,
        "org_id": str(new_org.id),
        "message": f"Organização parceira '{body.customer_name}' criada com sucesso.",
    }


@ws_router.post("/sync")
def sync_customers(
    body: SyncCustomersBody,
    member: MemberContext = Depends(require_permission("resources.manage")),
    db: Session = Depends(get_db),
):
    """
    Sincroniza uma lista de clientes CSP como orgs parceiras em lote.
    Busca detalhes de cada customer_id na PC API e importa/atualiza.
    """
    _check_enterprise(member, db)
    creds = _get_creds(db, member.workspace_id)

    try:
        from app.services.partner_center_service import get_customer
        pc_token = _pc_token(creds)
    except Exception as exc:
        raise HTTPException(502, f"Erro ao autenticar no Partner Center: {exc}")

    master_org = db.query(Organization).filter(Organization.id == member.organization_id).first()
    if not master_org:
        raise HTTPException(404, "Organização não encontrada.")
    created, updated, errors = 0, 0, []

    for cid in body.customer_ids:
        try:
            customer = get_customer(pc_token, cid)
        except Exception as exc:
            errors.append({"customer_id": cid, "error": str(exc)})
            continue

        existing = (
            db.query(Organization)
            .filter(
                Organization.partner_center_id == cid,
                Organization.parent_org_id == master_org.id,
            )
            .first()
        )
        if existing:
            existing.name = customer["name"]
            existing.partner_center_tenant = customer["tenant_id"]
            updated += 1
        else:
            from app.services.plan_service import get_effective_plan
            slug = _ensure_unique_slug(db, _slugify(customer["name"]))
            new_org = Organization(
                name=customer["name"],
                slug=slug,
                plan_tier=get_effective_plan(master_org),
                org_type="partner",
                parent_org_id=master_org.id,
                partner_center_id=cid,
                partner_center_tenant=customer["tenant_id"],
            )
            db.add(new_org)
            db.flush()
            db.add(OrganizationMember(organization_id=new_org.id, user_id=member.user.id, role="owner"))
            ws = Workspace(organization_id=new_org.id, name="Default", slug="default")
            db.add(ws)
            db.flush()
            db.add(WorkspaceMember(workspace_id=ws.id, user_id=member.user.id, role_override=None))
            created += 1

    db.commit()

    return {
        "created": created,
        "updated": updated,
        "errors": errors,
        "message": f"{created} criada(s), {updated} atualizada(s).",
    }
