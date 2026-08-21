from datetime import date

import pytest

from app.application.use_cases.process_invoice import ProcessInvoiceUseCase
from app.core.config import Settings
from app.domain.models.invoice import ExtractedInvoice, InvoiceLine
from app.domain.models.partner import Partner
from app.domain.models.processing_result import OcrResult, ProcessingStatus
from app.domain.services.invoice_validator import InvoiceValidator
from app.domain.services.partner_matcher import PartnerMatcher


class FakeOcr:
    async def extract_text(self, filename: str, content: bytes) -> OcrResult:
        return OcrResult(text="請求書", pages=["請求書"], engine="fake", confidence=0.99)


class FakeLlm:
    def __init__(self, extracted: ExtractedInvoice):
        self.extracted = extracted

    async def extract(self, text: str) -> ExtractedInvoice:
        return self.extracted


class FakeAccounting:
    def __init__(self):
        self.registered = False

    async def health(self) -> dict:
        return {"success": True}

    async def list_partners(self) -> list[Partner]:
        return [Partner(partner_code="P-1001", name="株式会社山田製作所", aliases=["山田製作所"], registration_no="T1010001000101")]

    async def list_tax_codes(self) -> list[dict]:
        return []

    async def list_invoices(self) -> list[dict]:
        return []

    async def register_invoice(self, invoice) -> dict:
        self.registered = True
        return {"success": True, "data": {"accounting_id": "ACC-0001"}, "error": None}


def valid_invoice(**overrides) -> ExtractedInvoice:
    data = {
        "supplier_name": "株式会社山田製作所",
        "supplier_registration_number": "T1010001000101",
        "invoice_number": "INV-1",
        "issue_date": date(2026, 1, 1),
        "due_date": date(2026, 1, 31),
        "lines": [InvoiceLine(description="Item", quantity=None, unit="lot", unit_price=None, amount=1000, tax_code="T10")],
        "subtotal": 1000,
        "tax_amount": 100,
        "total_amount": 1100,
        "extraction_confidence": 0.99,
    }
    data.update(overrides)
    return ExtractedInvoice(**data)


def use_case(extracted: ExtractedInvoice, accounting: FakeAccounting) -> ProcessInvoiceUseCase:
    return ProcessInvoiceUseCase(
        ocr_service=FakeOcr(),
        llm_service=FakeLlm(extracted),
        accounting_gateway=accounting,
        validator=InvoiceValidator(),
        partner_matcher=PartnerMatcher(),
        settings=Settings(),
    )


@pytest.mark.asyncio
async def test_dry_run_ready_does_not_register():
    accounting = FakeAccounting()
    result = await use_case(valid_invoice(), accounting).execute("invoice.pdf", b"data", register=False)
    assert result.status == ProcessingStatus.READY
    assert accounting.registered is False


@pytest.mark.asyncio
async def test_registers_valid_invoice_when_requested():
    accounting = FakeAccounting()
    result = await use_case(valid_invoice(), accounting).execute("invoice.pdf", b"data", register=True)
    assert result.status == ProcessingStatus.REGISTERED
    assert accounting.registered is True


@pytest.mark.asyncio
async def test_validation_failure_routes_to_review():
    accounting = FakeAccounting()
    result = await use_case(valid_invoice(total_amount=1099), accounting).execute("invoice.pdf", b"data", register=True)
    assert result.status == ProcessingStatus.REVIEW
    assert accounting.registered is False
    assert any("total_amount mismatch" in error for error in result.validation_errors)
