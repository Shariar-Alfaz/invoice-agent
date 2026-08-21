from datetime import date

import httpx
import pytest

from app.core.config import Settings
from app.core.exceptions import AccountingApiError
from app.domain.models.invoice import InvoiceLine, RegistrationInvoice
from app.infrastructure.accounting.accounting_api_client import AccountingApiClient


def invoice() -> RegistrationInvoice:
    return RegistrationInvoice(
        partner_code="P-1001",
        invoice_number="INV-1",
        issue_date=date(2026, 1, 1),
        due_date=date(2026, 1, 31),
        lines=[InvoiceLine(description="Item", quantity=None, unit="lot", unit_price=None, amount=1000, tax_code="T10")],
        subtotal=1000,
        tax_amount=100,
        total_amount=1100,
    )


def client_for(handler) -> AccountingApiClient:
    settings = Settings(accounting_api_url="http://testserver", accounting_api_key="key")
    client = AccountingApiClient(settings)
    transport = httpx.MockTransport(handler)

    async def request(method: str, path: str, auth: bool = True, **kwargs):
        headers = kwargs.pop("headers", {})
        if auth:
            headers["X-API-Key"] = settings.accounting_api_key
        async with httpx.AsyncClient(transport=transport, base_url=settings.accounting_api_url) as async_client:
            response = await async_client.request(method, path, headers=headers, **kwargs)
        body = response.json()
        if response.is_error or body.get("success") is False:
            error = body.get("error") or {}
            raise AccountingApiError(
                error.get("message", "Accounting API returned an error"),
                details={"status_code": response.status_code, "accounting_error": error},
            )
        return body

    client._request = request
    return client


@pytest.mark.asyncio
async def test_successful_registration():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-API-Key"] == "key"
        return httpx.Response(201, json={"success": True, "data": {"accounting_id": "ACC-0001"}, "error": None})

    response = await client_for(handler).register_invoice(invoice())
    assert response["data"]["accounting_id"] == "ACC-0001"


@pytest.mark.asyncio
async def test_duplicate_response():
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"success": False, "data": None, "error": {"code": "DUPLICATE_INVOICE", "message": "duplicate"}})

    with pytest.raises(AccountingApiError) as exc:
        await client_for(handler).register_invoice(invoice())
    assert exc.value.details["accounting_error"]["code"] == "DUPLICATE_INVOICE"


@pytest.mark.asyncio
async def test_amount_mismatch_response():
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"success": False, "data": None, "error": {"code": "AMOUNT_MISMATCH", "message": "bad total"}})

    with pytest.raises(AccountingApiError) as exc:
        await client_for(handler).register_invoice(invoice())
    assert exc.value.details["accounting_error"]["code"] == "AMOUNT_MISMATCH"


@pytest.mark.asyncio
async def test_unauthorized_response():
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"success": False, "data": None, "error": {"code": "UNAUTHORIZED", "message": "bad key"}})

    with pytest.raises(AccountingApiError) as exc:
        await client_for(handler).register_invoice(invoice())
    assert exc.value.details["accounting_error"]["code"] == "UNAUTHORIZED"
