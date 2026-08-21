from enum import Enum

from pydantic import BaseModel

from app.domain.models.invoice import ExtractedInvoice


class ProcessingStatus(str, Enum):
    READY = "ready"
    REVIEW = "review"
    REGISTERED = "registered"
    FAILED = "failed"


class OcrResult(BaseModel):
    text: str
    pages: list[str]
    engine: str
    confidence: float | None = None
    warnings: list[str] = []


class InvoiceProcessingResult(BaseModel):
    status: ProcessingStatus
    source_file: str
    ocr: OcrResult | None = None
    extracted_invoice: ExtractedInvoice | None = None
    partner_code: str | None = None
    validation_errors: list[str] = []
    warnings: list[str] = []
    accounting_response: dict | None = None
