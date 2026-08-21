from typing import Protocol

from app.domain.models.invoice import RegistrationInvoice
from app.domain.models.partner import Partner


class AccountingGateway(Protocol):
    async def health(self) -> dict:
        ...

    async def list_partners(self) -> list[Partner]:
        ...

    async def list_tax_codes(self) -> list[dict]:
        ...

    async def list_invoices(self) -> list[dict]:
        ...

    async def register_invoice(self, invoice: RegistrationInvoice) -> dict:
        ...
