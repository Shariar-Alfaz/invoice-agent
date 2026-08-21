from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel

from app.api.dependencies import accounting_client, extract_invoice_use_case, process_invoice_use_case, settings
from app.application.use_cases.extract_invoice import ExtractInvoiceUseCase
from app.application.use_cases.process_invoice import ProcessInvoiceUseCase
from app.core.config import Settings
from app.core.exceptions import UnsupportedDocumentError
from app.domain.models.invoice import ExtractedInvoice, RegistrationInvoice
from app.domain.models.processing_result import InvoiceProcessingResult
from app.domain.models.processing_result import OcrResult, ProcessingStatus
from app.domain.services.invoice_validator import InvoiceValidator
from app.domain.services.partner_matcher import PartnerMatcher
from app.infrastructure.accounting.accounting_api_client import AccountingApiClient

router = APIRouter(prefix="/api/invoices", tags=["Invoices"])

SUPPORTED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
}


class ReviewRegistrationRequest(BaseModel):
    source_file: str
    extracted_invoice: ExtractedInvoice
    partner_code: str | None = None


class PartnerOption(BaseModel):
    partner_code: str
    name: str
    aliases: list[str] = []
    registration_no: str | None = None


class TaxCodeOption(BaseModel):
    tax_code: str
    rate: float
    label: str


class RegisteredInvoiceOption(BaseModel):
    accounting_id: str
    partner_code: str
    invoice_number: str
    issue_date: str
    due_date: str
    subtotal: int
    tax_amount: int
    total_amount: int
    line_count: int


@router.post("/extract", response_model=InvoiceProcessingResult, include_in_schema=False)
async def extract_invoice(
    file: UploadFile = File(...),
    use_case: ExtractInvoiceUseCase = Depends(extract_invoice_use_case),
    app_settings: Settings = Depends(settings),
) -> InvoiceProcessingResult:
    filename, content = await _read_upload(file, app_settings)
    return await use_case.execute(filename, content)


@router.post("/process", response_model=InvoiceProcessingResult)
async def process_invoice(
    register: bool = Query(default=True),
    file: UploadFile = File(...),
    use_case: ProcessInvoiceUseCase = Depends(process_invoice_use_case),
    app_settings: Settings = Depends(settings),
) -> InvoiceProcessingResult:
    filename, content = await _read_upload(file, app_settings)
    return await use_case.execute(filename, content, register=register)


@router.get("/partners", response_model=list[PartnerOption], include_in_schema=False)
async def list_partner_options(
    client: AccountingApiClient = Depends(accounting_client),
) -> list[PartnerOption]:
    partners = await client.list_partners()
    return [PartnerOption.model_validate(partner.model_dump()) for partner in partners]


@router.get("/tax-codes", response_model=list[TaxCodeOption], include_in_schema=False)
async def list_tax_code_options(
    client: AccountingApiClient = Depends(accounting_client),
) -> list[TaxCodeOption]:
    tax_codes = await client.list_tax_codes()
    return [TaxCodeOption.model_validate(tax_code) for tax_code in tax_codes]


@router.get("/registered", response_model=list[RegisteredInvoiceOption], include_in_schema=False)
async def list_registered_invoices(
    client: AccountingApiClient = Depends(accounting_client),
) -> list[RegisteredInvoiceOption]:
    invoices = await client.list_invoices()
    return [RegisteredInvoiceOption.model_validate(invoice) for invoice in invoices]


@router.delete("/registered", include_in_schema=False)
async def clear_registered_invoices(
    client: AccountingApiClient = Depends(accounting_client),
) -> dict:
    return await client.clear_invoices()


@router.post(
    "/register-reviewed",
    response_model=InvoiceProcessingResult,
    include_in_schema=False,
)
async def register_reviewed_invoice(
    request: ReviewRegistrationRequest,
    client: AccountingApiClient = Depends(accounting_client),
) -> InvoiceProcessingResult:
    validator = InvoiceValidator()
    validation = validator.validate(request.extracted_invoice)

    partner_code = request.partner_code
    warnings = [*validation.warnings]
    validation_errors = [*validation.errors]

    if not partner_code:
        partners = await client.list_partners()
        match = PartnerMatcher().match(request.extracted_invoice, partners)
        partner_code = match.partner_code
        warnings.extend(match.warnings)
        validation_errors.extend(match.errors)

    if partner_code:
        existing = await client.list_invoices()
        duplicate = any(
            item.get("partner_code") == partner_code
            and item.get("invoice_number") == request.extracted_invoice.invoice_number
            for item in existing
        )
        if duplicate:
            validation_errors.append("duplicate invoice detected before registration")

    if validation_errors:
        return InvoiceProcessingResult(
            status=ProcessingStatus.REVIEW,
            source_file=request.source_file,
            ocr=OcrResult(text="", pages=[], engine="review", warnings=[]),
            extracted_invoice=request.extracted_invoice,
            partner_code=partner_code,
            validation_errors=validation_errors,
            warnings=warnings,
        )

    payload = RegistrationInvoice.from_extracted(request.extracted_invoice, partner_code or "")
    response = await client.register_invoice(payload)
    return InvoiceProcessingResult(
        status=ProcessingStatus.REGISTERED,
        source_file=request.source_file,
        ocr=OcrResult(text="", pages=[], engine="review", warnings=[]),
        extracted_invoice=request.extracted_invoice,
        partner_code=partner_code,
        warnings=warnings,
        accounting_response=response,
    )


async def _read_upload(file: UploadFile, app_settings: Settings) -> tuple[str, bytes]:
    filename = Path(file.filename or "invoice").name
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise UnsupportedDocumentError(f"Unsupported file extension: {extension}")
    if file.content_type and file.content_type not in SUPPORTED_MIME_TYPES:
        raise UnsupportedDocumentError(f"Unsupported content type: {file.content_type}")

    content = await file.read()
    max_bytes = app_settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise UnsupportedDocumentError(f"Upload exceeds {app_settings.max_upload_mb} MB limit")
    return filename, content
