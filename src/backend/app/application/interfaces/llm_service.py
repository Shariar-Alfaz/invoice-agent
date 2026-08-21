from typing import Protocol

from app.domain.models.invoice import ExtractedInvoice


class InvoiceExtractionService(Protocol):
    async def extract(self, text: str) -> ExtractedInvoice:
        ...
