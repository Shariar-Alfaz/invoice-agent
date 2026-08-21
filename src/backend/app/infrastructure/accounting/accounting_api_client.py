import httpx

from app.application.interfaces.accounting_gateway import AccountingGateway
from app.core.config import Settings
from app.core.exceptions import AccountingApiError
from app.domain.models.invoice import RegistrationInvoice
from app.domain.models.partner import Partner


class AccountingApiClient(AccountingGateway):
    def __init__(self, settings: Settings):
        self.settings = settings

    async def health(self) -> dict:
        return await self._request("GET", "/health", auth=False)

    async def list_partners(self) -> list[Partner]:
        response = await self._request("GET", "/partners")
        return [Partner.model_validate(item) for item in response["data"]["partners"]]

    async def list_tax_codes(self) -> list[dict]:
        response = await self._request("GET", "/tax-codes")
        return response["data"]["tax_codes"]

    async def list_invoices(self) -> list[dict]:
        response = await self._request("GET", "/invoices")
        return response["data"]["invoices"]

    async def clear_invoices(self) -> dict:
        response = await self._request("DELETE", "/invoices")
        return response["data"]

    async def register_invoice(self, invoice: RegistrationInvoice) -> dict:
        payload = invoice.model_dump(mode="json")
        return await self._request("POST", "/invoices", json=payload)

    async def _request(self, method: str, path: str, auth: bool = True, **kwargs) -> dict:
        headers = kwargs.pop("headers", {})
        if auth:
            headers["X-API-Key"] = self.settings.accounting_api_key
        url = f"{self.settings.accounting_api_url.rstrip('/')}{path}"
        try:
            async with httpx.AsyncClient(timeout=self.settings.accounting_timeout_seconds) as client:
                response = await client.request(method, url, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            raise AccountingApiError("Accounting API request failed") from exc

        body = response.json()
        if response.is_error or body.get("success") is False:
            error = body.get("error") or {}
            raise AccountingApiError(
                error.get("message", "Accounting API returned an error"),
                details={"status_code": response.status_code, "accounting_error": error},
            )
        return body
