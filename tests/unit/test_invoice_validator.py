from datetime import date

from app.domain.models.invoice import ExtractedInvoice, InvoiceLine
from app.domain.services.invoice_validator import InvoiceValidator


def make_invoice(**overrides) -> ExtractedInvoice:
    data = {
        "supplier_name": "株式会社山田製作所",
        "supplier_registration_number": "T1010001000101",
        "invoice_number": "INV-1",
        "issue_date": date(2026, 1, 1),
        "due_date": date(2026, 1, 31),
        "currency": "JPY",
        "lines": [
            InvoiceLine(
                description="Part",
                quantity=2,
                unit="pcs",
                unit_price=1000,
                amount=2000,
                tax_code="T10",
            )
        ],
        "subtotal": 2000,
        "tax_amount": 200,
        "total_amount": 2200,
        "extraction_confidence": 0.99,
        "warnings": [],
    }
    data.update(overrides)
    return ExtractedInvoice(**data)


def test_valid_10_percent_invoice():
    result = InvoiceValidator().validate(make_invoice())
    assert result.errors == []


def test_valid_8_percent_invoice():
    invoice = make_invoice(
        lines=[InvoiceLine(description="Food", quantity=1, unit="lot", unit_price=1000, amount=1000, tax_code="T08")],
        subtotal=1000,
        tax_amount=80,
        total_amount=1080,
    )
    assert InvoiceValidator().validate(invoice).errors == []


def test_mixed_tax_invoice():
    invoice = make_invoice(
        lines=[
            InvoiceLine(description="Part", quantity=None, unit="lot", unit_price=None, amount=1000, tax_code="T10"),
            InvoiceLine(description="Food", quantity=None, unit="lot", unit_price=None, amount=1000, tax_code="T08"),
        ],
        subtotal=2000,
        tax_amount=180,
        total_amount=2180,
    )
    assert InvoiceValidator().validate(invoice).errors == []


def test_subtotal_mismatch():
    result = InvoiceValidator().validate(make_invoice(subtotal=1999))
    assert any("subtotal mismatch" in error for error in result.errors)


def test_tax_mismatch():
    result = InvoiceValidator().validate(make_invoice(tax_amount=199))
    assert any("tax_amount mismatch" in error for error in result.errors)


def test_total_mismatch():
    result = InvoiceValidator().validate(make_invoice(total_amount=2199))
    assert any("total_amount mismatch" in error for error in result.errors)


def test_invalid_date_order():
    result = InvoiceValidator().validate(
        make_invoice(issue_date=date(2026, 2, 1), due_date=date(2026, 1, 31))
    )
    assert any("due_date" in error for error in result.errors)


def test_unknown_tax_code():
    invoice = make_invoice(
        lines=[InvoiceLine(description="Part", quantity=1, unit="pcs", unit_price=1000, amount=1000, tax_code="T99")],
        subtotal=1000,
        tax_amount=0,
        total_amount=1000,
    )
    result = InvoiceValidator().validate(invoice)
    assert any("unsupported tax code" in error for error in result.errors)


def test_empty_unit_routes_to_validation_error():
    invoice = make_invoice(
        lines=[InvoiceLine(description="Part", quantity=1, unit="", unit_price=1000, amount=1000, tax_code="T10")],
        subtotal=1000,
        tax_amount=100,
        total_amount=1100,
    )
    result = InvoiceValidator().validate(invoice)
    assert any("unit is required" in error for error in result.errors)
