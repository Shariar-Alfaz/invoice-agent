from typing import Any


class AppError(Exception):
    code = "APP_ERROR"
    status_code = 500

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        self.message = message
        self.details = details
        super().__init__(message)


class UnsupportedDocumentError(AppError):
    code = "UNSUPPORTED_DOCUMENT"
    status_code = 400


class OcrExtractionError(AppError):
    code = "OCR_EXTRACTION_ERROR"
    status_code = 422


class LlmExtractionError(AppError):
    code = "LLM_EXTRACTION_ERROR"
    status_code = 422


class PartnerMatchError(AppError):
    code = "PARTNER_MATCH_ERROR"
    status_code = 422


class InvoiceValidationError(AppError):
    code = "INVOICE_VALIDATION_ERROR"
    status_code = 422


class AccountingApiError(AppError):
    code = "ACCOUNTING_API_ERROR"
    status_code = 502
