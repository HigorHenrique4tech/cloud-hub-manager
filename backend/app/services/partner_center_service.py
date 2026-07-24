"""
Partner Center Service — integração com Microsoft Partner Center API para
gerenciamento de assinaturas CSP.

Auth: OAuth2 client_credentials com audience https://api.partnercenter.microsoft.com
Requisito: App Registration cadastrado no Partner Center (seção App Management),
           além do Azure AD. Sem esse cadastro, retorna 401 mesmo com credenciais válidas.

GDAP: O app/usuário precisa ter o role Admin Agent no partner tenant para chamar
      endpoints de gerenciamento de subscriptions de clientes.
"""
import json
import logging
from datetime import datetime

import requests

logger = logging.getLogger(__name__)

PC_API = "https://api.partnercenter.microsoft.com"
PC_SCOPE = "https://api.partnercenter.microsoft.com/.default"
PC_SCOPE_DELEGATED = "https://api.partnercenter.microsoft.com/user_impersonation"
GRAPH_V1 = "https://graph.microsoft.com/v1.0"


# ── Auth ─────────────────────────────────────────────────────────────────────

def get_partner_center_token(partner_tenant_id: str, client_id: str,
                              client_secret: str, username: str = None,
                              password: str = None) -> str:
    """
    Obtém access token para a Partner Center API.
    Quando username+password são fornecidos usa ROPC (Resource Owner Password Credentials),
    permitindo que o token herde o role Admin Agent do usuário no Partner Center.
    Sem username/password usa client_credentials (app-only).
    """
    url = f"https://login.microsoftonline.com/{partner_tenant_id}/oauth2/v2.0/token"
    if username and password:
        # ROPC (delegated): scope user_impersonation — token herda permissões Partner Center do usuário
        data = {
            "grant_type": "password",
            "client_id": client_id,
            "client_secret": client_secret,
            "username": username,
            "password": password,
            "scope": PC_SCOPE_DELEGATED,
        }
    else:
        # App-only: requer que o service principal tenha Admin Agent no Partner Center
        data = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": PC_SCOPE,
        }
    resp = requests.post(url, data=data, timeout=30)
    try:
        resp.raise_for_status()
    except requests.HTTPError:
        body = {}
        try:
            body = resp.json()
        except Exception:
            pass
        raise ValueError(
            f"Falha OAuth Partner Center (HTTP {resp.status_code}): "
            f"{body.get('error_description') or body.get('error') or resp.text[:300]}"
        )
    return resp.json()["access_token"]


def get_graph_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    """Obtém access token para a Graph API (ações Entra ID)."""
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    resp = requests.post(url, data={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://graph.microsoft.com/.default",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()["access_token"]


# ── Customers ────────────────────────────────────────────────────────────────

def list_customers(pc_token: str) -> list[dict]:
    """
    Lista todos os clientes do partner CSP.
    GET /v1/customers
    """
    url = f"{PC_API}/v1/customers"
    headers = {"Authorization": f"Bearer {pc_token}"}
    items = []
    while url:
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code in (401, 403):
            raise ValueError(
                f"Acesso negado pelo Partner Center ({resp.status_code}). "
                "Verifique se as credenciais estão corretas e se o usuário possui o role 'Admin Agent' "
                "em partner.microsoft.com → Configurações → Gerenciamento de usuários."
            )
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("items", []))
        # continuation token for next page
        url = data.get("links", {}).get("next", {}).get("uri") if data.get("links", {}).get("next") else None
    return [
        {
            "id": c.get("id"),
            "name": (c.get("companyProfile") or {}).get("companyName", ""),
            "tenant_id": (c.get("companyProfile") or {}).get("tenantId", ""),
            "domain": (c.get("companyProfile") or {}).get("domain", ""),
            "country": (c.get("companyProfile") or {}).get("companyAddress", {}).get("country", ""),
            "relationship_to_partner": c.get("relationshipToPartner", ""),
            "custom_domain_name": c.get("customDomainName", ""),
            "allowDelegatedAccess": c.get("allowDelegatedAccess", False),
        }
        for c in items
    ]


def get_customer(pc_token: str, customer_id: str) -> dict:
    """GET /v1/customers/{id} — detalhes de um cliente."""
    url = f"{PC_API}/v1/customers/{customer_id}"
    headers = {"Authorization": f"Bearer {pc_token}"}
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Cliente '{customer_id}' não encontrado no Partner Center.")
    resp.raise_for_status()
    c = resp.json()
    return {
        "id": c.get("id"),
        "name": (c.get("companyProfile") or {}).get("companyName", ""),
        "tenant_id": (c.get("companyProfile") or {}).get("tenantId", ""),
        "domain": (c.get("companyProfile") or {}).get("domain", ""),
        "country": (c.get("companyProfile") or {}).get("companyAddress", {}).get("country", ""),
    }


# ── Customer subscriptions ───────────────────────────────────────────────────

def list_customer_subscriptions(pc_token: str, customer_tenant_id: str) -> list[dict]:
    """
    Lista assinaturas de um cliente CSP.
    GET /v1/customers/{customer_tenant_id}/subscriptions
    """
    url = f"{PC_API}/v1/customers/{customer_tenant_id}/subscriptions"
    headers = {"Authorization": f"Bearer {pc_token}"}
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Cliente '{customer_tenant_id}' não encontrado no Partner Center.")
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items", [])
    return [
        {
            "id": s.get("id"),
            "friendly_name": s.get("friendlyName", ""),
            "offer_name": s.get("offerName", ""),
            "status": s.get("status", ""),
            "quantity": s.get("quantity", 1),
            "unit_type": s.get("unitType", ""),
            "creation_date": s.get("creationDate"),
            "commitment_end_date": s.get("commitmentEndDate"),
        }
        for s in items
    ]


def get_subscription(pc_token: str, customer_tenant_id: str,
                     subscription_id: str) -> dict:
    """
    Retorna o objeto completo da assinatura CSP — necessário para PATCH preservar
    todos os campos exigidos pela Microsoft.
    GET /v1/customers/{customer_tenant_id}/subscriptions/{subscription_id}
    """
    url = f"{PC_API}/v1/customers/{customer_tenant_id}/subscriptions/{subscription_id}"
    resp = requests.get(url, headers={"Authorization": f"Bearer {pc_token}"}, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Assinatura '{subscription_id}' não encontrada para o cliente '{customer_tenant_id}'.")
    if resp.status_code == 403:
        raise ValueError(
            "Acesso negado pelo Partner Center (403). Verifique se o App Registration possui "
            "a função 'Admin Agent' atribuída em partner.microsoft.com → Configurações → Gerenciamento de usuários."
        )
    resp.raise_for_status()
    return resp.json()


# Códigos de erro conhecidos da Partner Center API mapeados para mensagens amigáveis em PT-BR.
_PC_FRIENDLY_ERRORS = {
    "60050": "Esta assinatura não permite alteração de quantidade.",
    "60051": "Quantidade deve ser maior que a atual neste tipo de oferta.",
    "27002": "Quantidade inválida para esta oferta (verifique limites mín/máx).",
}


def _pc_error_message(resp: requests.Response, fallback: str = "Erro Partner Center") -> str:
    """Extrai mensagem amigável do response Partner Center (snake/camel keys variam)."""
    try:
        body = resp.json()
        code = str(body.get("code") or body.get("errorCode") or "")
        if code in _PC_FRIENDLY_ERRORS:
            return _PC_FRIENDLY_ERRORS[code]
        return body.get("description") or body.get("message") or body.get("error_description") or fallback
    except Exception:
        return resp.text[:300] if resp.text else fallback


def update_subscription_quantity(pc_token: str, customer_tenant_id: str,
                                 subscription_id: str, new_quantity: int) -> dict:
    """
    Altera a quantidade de licenças de uma assinatura CSP.
    PATCH /v1/customers/{customer_tenant_id}/subscriptions/{subscription_id}
    Microsoft exige que o body contenha o objeto inteiro da subscription.
    Pode retornar 202 (Accepted) com header Location para operação assíncrona.
    """
    if new_quantity is None or new_quantity < 1:
        raise ValueError("Quantidade deve ser um inteiro maior que zero.")

    url = f"{PC_API}/v1/customers/{customer_tenant_id}/subscriptions/{subscription_id}"
    headers = {
        "Authorization": f"Bearer {pc_token}",
        "Content-Type": "application/json",
    }
    current = get_subscription(pc_token, customer_tenant_id, subscription_id)
    previous_quantity = int(current.get("quantity", 1))

    if previous_quantity == new_quantity:
        raise ValueError(f"A assinatura já está com {new_quantity} licença(s).")

    payload = dict(current)
    payload["quantity"] = new_quantity

    patch_resp = requests.patch(url, headers=headers, json=payload, timeout=30)
    if patch_resp.status_code in (400, 409):
        raise ValueError(_pc_error_message(patch_resp, "Não foi possível alterar a quantidade."))
    if patch_resp.status_code == 403:
        raise ValueError(
            "Acesso negado pelo Partner Center (403). Certifique-se de que o App Registration "
            "possui a função 'Admin Agent' atribuída em partner.microsoft.com → Configurações → Gerenciamento de usuários."
        )
    patch_resp.raise_for_status()

    is_async = patch_resp.status_code == 202
    operation_location = patch_resp.headers.get("Location") if is_async else None

    return {
        "subscription_id": subscription_id,
        "previous_quantity": previous_quantity,
        "new_quantity": new_quantity,
        "friendly_name": current.get("friendlyName", ""),
        "async": is_async,
        "operation_location": operation_location,
        "changed_at": datetime.utcnow().isoformat(),
    }


def _patch_subscription(pc_token: str, customer_tenant_id: str,
                        subscription_id: str, new_status: str) -> dict:
    """Atualiza status de uma assinatura CSP."""
    url = f"{PC_API}/v1/customers/{customer_tenant_id}/subscriptions/{subscription_id}"
    headers = {
        "Authorization": f"Bearer {pc_token}",
        "Content-Type": "application/json",
    }
    # Primeiro busca a assinatura atual para obter quantity e outros campos obrigatórios
    get_resp = requests.get(url, headers=headers, timeout=30)
    if get_resp.status_code == 404:
        raise ValueError(f"Assinatura '{subscription_id}' não encontrada para o cliente '{customer_tenant_id}'.")
    get_resp.raise_for_status()
    current = get_resp.json()

    payload = {
        "id": subscription_id,
        "status": new_status,
        "quantity": current.get("quantity", 1),
        "friendlyName": current.get("friendlyName", ""),
        "offerUri": current.get("offerUri", ""),
    }

    patch_resp = requests.patch(url, headers=headers, json=payload, timeout=30)
    if patch_resp.status_code == 409:
        raise ValueError(f"Conflito ao alterar assinatura: já está no status '{current.get('status')}'.")
    if patch_resp.status_code == 403:
        raise ValueError(
            "Acesso negado pelo Partner Center (403). Certifique-se de que o App Registration "
            "possui a função 'Admin Agent' atribuída em partner.microsoft.com → Configurações → Gerenciamento de usuários."
        )
    patch_resp.raise_for_status()

    result = patch_resp.json() if patch_resp.text else payload
    return {
        "subscription_id": subscription_id,
        "previous_status": current.get("status"),
        "new_status": new_status,
        "friendly_name": current.get("friendlyName", ""),
        "changed_at": datetime.utcnow().isoformat(),
    }


def suspend_subscription(pc_token: str, customer_tenant_id: str,
                         subscription_id: str) -> dict:
    """Suspende uma assinatura Azure CSP."""
    return _patch_subscription(pc_token, customer_tenant_id, subscription_id, "suspended")


def reactivate_subscription(pc_token: str, customer_tenant_id: str,
                             subscription_id: str) -> dict:
    """Reativa uma assinatura Azure CSP previamente suspensa."""
    return _patch_subscription(pc_token, customer_tenant_id, subscription_id, "active")


# ── Catalog (Products / SKUs / Availabilities) ───────────────────────────────

def _normalize_product(p: dict) -> dict:
    return {
        "id": p.get("id"),
        "title": p.get("title"),
        "description": p.get("description"),
        "product_type": (p.get("productType") or {}).get("displayName") or (p.get("productType") or {}).get("id"),
        "billing_type": p.get("billingType"),
        "has_skus": p.get("hasSkus"),
    }


def _normalize_sku(s: dict, product_id: str) -> dict:
    return {
        "id": s.get("id"),
        "product_id": product_id,
        "title": s.get("title"),
        "description": s.get("description"),
        "minimum_quantity": s.get("minimumQuantity") or 1,
        "maximum_quantity": s.get("maximumQuantity"),
        "is_trial": s.get("isTrial", False),
        "supported_billing_cycles": s.get("supportedBillingCycles") or [],
    }


def _normalize_availability(a: dict) -> dict:
    return {
        "id": a.get("id"),
        "catalog_item_id": a.get("catalogItemId"),
        "default_currency": a.get("defaultCurrency", {}).get("code") if isinstance(a.get("defaultCurrency"), dict) else a.get("defaultCurrency"),
        "segment": a.get("segment"),
        "country": a.get("country"),
        "term_duration": (a.get("terms") or [{}])[0].get("duration") if a.get("terms") else None,
        "billing_cycle": (a.get("terms") or [{}])[0].get("billingCycle") if a.get("terms") else None,
        "terms": a.get("terms") or [],
    }


def list_products(pc_token: str, country: str, target_view: str = "Online") -> list[dict]:
    """
    Lista produtos disponíveis no catálogo CSP.
    GET /v1/products?country={country}&targetView={target_view}
    target_view: Online (M365) | Azure | MicrosoftAzure | Software | etc.
    """
    url = f"{PC_API}/v1/products"
    headers = {"Authorization": f"Bearer {pc_token}"}
    params = {"country": country, "targetView": target_view}
    items = []
    while url:
        resp = requests.get(url, headers=headers, params=params, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("items", []))
        next_link = data.get("links", {}).get("next", {})
        url = next_link.get("uri") if next_link else None
        params = None
    return [_normalize_product(p) for p in items]


def list_skus(pc_token: str, product_id: str, country: str) -> list[dict]:
    """GET /v1/products/{product_id}/skus?country={country}"""
    url = f"{PC_API}/v1/products/{product_id}/skus"
    resp = requests.get(url, headers={"Authorization": f"Bearer {pc_token}"}, params={"country": country}, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Produto '{product_id}' não encontrado.")
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return [_normalize_sku(s, product_id) for s in items]


def list_availabilities(pc_token: str, product_id: str, sku_id: str, country: str) -> list[dict]:
    """GET /v1/products/{product_id}/skus/{sku_id}/availabilities?country={country}"""
    url = f"{PC_API}/v1/products/{product_id}/skus/{sku_id}/availabilities"
    resp = requests.get(url, headers={"Authorization": f"Bearer {pc_token}"}, params={"country": country}, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Disponibilidade não encontrada para SKU '{sku_id}'.")
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return [_normalize_availability(a) for a in items]


# ── Cart / Checkout (Purchase) ───────────────────────────────────────────────

def create_cart(pc_token: str, customer_id: str, line_items: list[dict]) -> dict:
    """
    POST /v1/customers/{customer_id}/carts
    line_items: [{catalogItemId, quantity, billingCycle, termDuration}]
    """
    url = f"{PC_API}/v1/customers/{customer_id}/carts"
    headers = {
        "Authorization": f"Bearer {pc_token}",
        "Content-Type": "application/json",
    }
    body = {
        "lineItems": [
            {
                "id": idx,
                "catalogItemId": li["catalog_item_id"],
                "quantity": li["quantity"],
                "billingCycle": li.get("billing_cycle", "monthly"),
                "termDuration": li.get("term_duration", "P1Y"),
            }
            for idx, li in enumerate(line_items)
        ]
    }
    resp = requests.post(url, headers=headers, json=body, timeout=60)
    if resp.status_code in (400, 409):
        raise ValueError(_pc_error_message(resp, "Falha ao criar carrinho."))
    resp.raise_for_status()
    return resp.json()


def checkout_cart(pc_token: str, customer_id: str, cart_id: str) -> dict:
    """POST /v1/customers/{customer_id}/carts/{cart_id}/checkout"""
    url = f"{PC_API}/v1/customers/{customer_id}/carts/{cart_id}/checkout"
    headers = {
        "Authorization": f"Bearer {pc_token}",
        "Content-Type": "application/json",
    }
    resp = requests.post(url, headers=headers, json={}, timeout=120)
    if resp.status_code in (400, 409):
        raise ValueError(_pc_error_message(resp, "Falha ao finalizar compra."))
    resp.raise_for_status()
    return resp.json()


def cart_checkout(pc_token: str, customer_id: str, line_items: list[dict]) -> dict:
    """Helper: cria carrinho + faz checkout numa só chamada. Retorna o resultado do checkout."""
    cart = create_cart(pc_token, customer_id, line_items)
    cart_id = cart.get("id")
    if not cart_id:
        raise ValueError("Resposta de criação de carrinho sem id.")
    return checkout_cart(pc_token, customer_id, cart_id)


# ── Invoices (CSP Billing) ───────────────────────────────────────────────────

def _normalize_invoice(inv: dict) -> dict:
    """Normaliza um objeto invoice da PC API para snake_case."""
    return {
        "id": inv.get("id"),
        "billing_period_start": inv.get("billingPeriodStartDate"),
        "billing_period_end": inv.get("billingPeriodEndDate"),
        "invoice_date": inv.get("invoiceDate"),
        "due_date": inv.get("dueDate"),
        "total_amount": inv.get("totalCharges"),
        "currency_code": inv.get("currencyCode"),
        "currency_symbol": inv.get("currencySymbol"),
        "paid_amount": inv.get("paidAmount"),
        "status": inv.get("documentStatus") or inv.get("invoiceStatus") or inv.get("status"),
        "document_type": inv.get("documentType"),
        "payment_terms_in_days": inv.get("paymentTerm"),
        "pdf_download_link": inv.get("pdfDownloadLink"),
    }


def _normalize_lineitem(li: dict) -> dict:
    """Normaliza um line item de invoice (campos variam por provider/type)."""
    return {
        "customer_id": li.get("customerId"),
        "customer_name": li.get("customerCompanyName") or li.get("customerName"),
        "customer_domain": li.get("customerDomainName"),
        "subscription_id": li.get("subscriptionId"),
        "subscription_description": li.get("subscriptionDescription") or li.get("subscriptionName"),
        "product_id": li.get("productId"),
        "product_name": li.get("productName"),
        "sku_id": li.get("skuId"),
        "sku_name": li.get("skuName"),
        "charge_type": li.get("chargeType"),
        "quantity": li.get("quantity"),
        "unit_price": li.get("unitPrice") or li.get("effectiveUnitPrice"),
        "amount": li.get("billingPreTaxTotal") or li.get("subtotal") or li.get("postTaxTotal"),
        "currency": li.get("currency") or li.get("currencyCode"),
        "billing_cycle": li.get("billingCycleType") or li.get("billingFrequency"),
        "term_and_billing_cycle": li.get("termAndBillingCycle"),
        "charge_start_date": li.get("chargeStartDate"),
        "charge_end_date": li.get("chargeEndDate"),
        "order_id": li.get("orderId"),
        "mpn_id": li.get("mpnId") or li.get("partnerId"),
    }


def list_invoices(pc_token: str, size: int = 200, offset: int = 0) -> dict:
    """
    Lista faturas do partner.
    GET /v1/invoices?size={size}&offset={offset}
    """
    url = f"{PC_API}/v1/invoices"
    headers = {"Authorization": f"Bearer {pc_token}"}
    resp = requests.get(url, headers=headers, params={"size": size, "offset": offset}, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items", [])
    return {
        "invoices": [_normalize_invoice(inv) for inv in items],
        "total_count": data.get("totalCount", len(items)),
        "has_more": bool(data.get("links", {}).get("next")),
    }


def get_invoice(pc_token: str, invoice_id: str) -> dict:
    """GET /v1/invoices/{invoice_id}"""
    url = f"{PC_API}/v1/invoices/{invoice_id}"
    resp = requests.get(url, headers={"Authorization": f"Bearer {pc_token}"}, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Fatura '{invoice_id}' não encontrada.")
    resp.raise_for_status()
    return _normalize_invoice(resp.json())


def list_invoice_lineitems(pc_token: str, invoice_id: str,
                           provider: str = "onetime",
                           line_item_type: str = "billinglineitems",
                           size: int = 2000) -> list[dict]:
    """
    Lista line items de uma fatura. Pagina via links.next.uri (limite 2000 por página).
    GET /v1/invoices/{invoice_id}/lineitems?provider={p}&invoicelineitemtype={t}&size={s}
    """
    url = f"{PC_API}/v1/invoices/{invoice_id}/lineitems"
    headers = {"Authorization": f"Bearer {pc_token}"}
    params = {"provider": provider, "invoicelineitemtype": line_item_type, "size": size}
    items = []
    while url:
        resp = requests.get(url, headers=headers, params=params, timeout=60)
        if resp.status_code == 404:
            raise ValueError(f"Fatura '{invoice_id}' não encontrada.")
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("items", []))
        next_link = data.get("links", {}).get("next", {})
        url = next_link.get("uri") if next_link else None
        params = None  # next link já tem query string
    return [_normalize_lineitem(li) for li in items]


def get_invoice_pdf_url(pc_token: str, invoice_id: str) -> str:
    """
    Retorna URL assinada de curta duração para download do PDF da fatura.
    GET /v1/invoices/{invoice_id}/documents/statement
    A PC API responde com 302/Location ou body { url } dependendo da rota.
    """
    url = f"{PC_API}/v1/invoices/{invoice_id}/documents/statement"
    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {pc_token}"},
        timeout=30,
        allow_redirects=False,
    )
    if resp.status_code == 404:
        raise ValueError(f"PDF da fatura '{invoice_id}' não disponível.")
    if resp.status_code in (301, 302, 303, 307):
        return resp.headers.get("Location", "")
    resp.raise_for_status()
    try:
        body = resp.json()
        return body.get("url") or body.get("downloadUri") or ""
    except Exception:
        return ""


# ── Entra ID containment actions (Graph API) ─────────────────────────────────

def block_entra_user(graph_token: str, user_id_or_upn: str) -> dict:
    """
    Desabilita conta no Entra ID.
    PATCH /users/{id} → accountEnabled: false
    """
    url = f"{GRAPH_V1}/users/{user_id_or_upn}"
    resp = requests.patch(url, headers={
        "Authorization": f"Bearer {graph_token}",
        "Content-Type": "application/json",
    }, json={"accountEnabled": False}, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Usuário '{user_id_or_upn}' não encontrado no Entra ID.")
    resp.raise_for_status()
    return {"user": user_id_or_upn, "accountEnabled": False, "action": "block_user"}


def unblock_entra_user(graph_token: str, user_id_or_upn: str) -> dict:
    """Reabilita conta no Entra ID."""
    url = f"{GRAPH_V1}/users/{user_id_or_upn}"
    resp = requests.patch(url, headers={
        "Authorization": f"Bearer {graph_token}",
        "Content-Type": "application/json",
    }, json={"accountEnabled": True}, timeout=30)
    resp.raise_for_status()
    return {"user": user_id_or_upn, "accountEnabled": True, "action": "unblock_user"}


def revoke_entra_sessions(graph_token: str, user_id_or_upn: str) -> dict:
    """
    Revoga todos os tokens de refresh do usuário.
    POST /users/{id}/revokeSignInSessions
    """
    url = f"{GRAPH_V1}/users/{user_id_or_upn}/revokeSignInSessions"
    resp = requests.post(url, headers={
        "Authorization": f"Bearer {graph_token}",
        "Content-Type": "application/json",
    }, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Usuário '{user_id_or_upn}' não encontrado.")
    resp.raise_for_status()
    result = resp.json() if resp.text else {}
    return {
        "user": user_id_or_upn,
        "sessions_revoked": result.get("value", True),
        "action": "revoke_sessions",
    }


# ── Azure Management containment actions ─────────────────────────────────────

def add_quarantine_tag(azure_token: str, resource_id: str,
                       incident_id: str) -> dict:
    """
    Adiciona tag security:quarantine no recurso Azure.
    PATCH /subscriptions/{sub}/resourceGroups/{rg}/providers/.../tags
    """
    url = f"https://management.azure.com{resource_id}/providers/Microsoft.Resources/tags/default"
    params = {"api-version": "2021-04-01"}
    resp = requests.patch(url, headers={
        "Authorization": f"Bearer {azure_token}",
        "Content-Type": "application/json",
    }, params=params, json={
        "operation": "Merge",
        "properties": {
            "tags": {
                "security": "quarantine",
                "incident_id": incident_id,
                "quarantined_at": datetime.utcnow().isoformat(),
            }
        }
    }, timeout=30)
    if resp.status_code == 404:
        raise ValueError(f"Recurso '{resource_id}' não encontrado.")
    resp.raise_for_status()
    return {"resource_id": resource_id, "tagged": True, "action": "add_quarantine_tag"}


def deallocate_vm(azure_token: str, subscription_id: str,
                  resource_group: str, vm_name: str) -> dict:
    """
    Inicia deallocate de VM (stop + deallocate).
    POST /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{name}/deallocate
    """
    url = (
        f"https://management.azure.com/subscriptions/{subscription_id}"
        f"/resourceGroups/{resource_group}/providers/Microsoft.Compute"
        f"/virtualMachines/{vm_name}/deallocate"
    )
    params = {"api-version": "2023-09-01"}
    resp = requests.post(url, headers={
        "Authorization": f"Bearer {azure_token}",
    }, params=params, timeout=30)
    if resp.status_code in (200, 202):
        return {
            "vm": vm_name,
            "resource_group": resource_group,
            "action": "deallocate_vm",
            "status": "started",
            "async": resp.status_code == 202,
        }
    resp.raise_for_status()
    return {}


def get_azure_management_token(tenant_id: str, client_id: str,
                                client_secret: str) -> str:
    """Token para Azure Management API."""
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    resp = requests.post(url, data={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://management.azure.com/.default",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()["access_token"]


# ── Config helpers ────────────────────────────────────────────────────────────

def decrypt_pc_credentials(db, workspace_id) -> dict | None:
    """Lê e descriptografa credenciais Partner Center do workspace."""
    from app.models.db_models import PartnerCenterConfig
    from app.services.auth_service import get_org_fernet
    from app.models.db_models import Workspace

    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        return None

    cfg = db.query(PartnerCenterConfig).filter(
        PartnerCenterConfig.workspace_id == workspace_id
    ).first()
    if not cfg:
        return None

    try:
        fernet = get_org_fernet(db, ws.organization_id)
        raw = fernet.decrypt(cfg.encrypted_credentials.encode()).decode()
        creds = json.loads(raw)
        creds["partner_tenant_id"] = cfg.partner_tenant_id
        return creds
    except Exception as exc:
        logger.error("Falha ao descriptografar Partner Center credentials: %s", exc)
        return None
