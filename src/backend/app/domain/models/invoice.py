from datetime import date

from pydantic import BaseModel, Field


class InvoiceLine(BaseModel):
    description: str
    quantity: int | None = None
    unit: str
    unit_price: int | None = None
    amount: int
    tax_code: str


class ExtractedInvoice(BaseModel):
    supplier_name: str
    supplier_registration_number: str | None = None
    invoice_number: str
    issue_date: date
    due_date: date
    currency: str = "JPY"
    lines: list[InvoiceLine]
    subtotal: int
    tax_amount: int
    total_amount: int
    extraction_confidence: float = Field(ge=0, le=1)
    warnings: list[str] = []


class RegistrationInvoice(BaseModel):
    partner_code: str
    invoice_number: str
    issue_date: date
    due_date: date
    currency: str = "JPY"
    lines: list[InvoiceLine]
    subtotal: int
    tax_amount: int
    total_amount: int

    @classmethod
    def from_extracted(cls, invoice: ExtractedInvoice, partner_code: str) -> "RegistrationInvoice":
        return cls(
            partner_code=partner_code,
            invoice_number=invoice.invoice_number,
            issue_date=invoice.issue_date,
            due_date=invoice.due_date,
            currency=invoice.currency,
            lines=invoice.lines,
            subtotal=invoice.subtotal,
            tax_amount=invoice.tax_amount,
            total_amount=invoice.total_amount,
        )
