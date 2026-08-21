from functools import lru_cache

from app.application.use_cases.extract_invoice import ExtractInvoiceUseCase
from app.application.use_cases.process_invoice import ProcessInvoiceUseCase
from app.core.config import Settings, get_settings
from app.domain.services.invoice_validator import InvoiceValidator
from app.domain.services.partner_matcher import PartnerMatcher
from app.infrastructure.accounting.accounting_api_client import AccountingApiClient
from app.infrastructure.llm.llm_invoice_extractor import LlmInvoiceExtractor
from app.infrastructure.ocr.paddle_ocr_service import DocumentOcrService


def settings() -> Settings:
    return get_settings()


@lru_cache
def accounting_client() -> AccountingApiClient:
    return AccountingApiClient(settings())


@lru_cache
def ocr_service() -> DocumentOcrService:
    return DocumentOcrService(settings())


@lru_cache
def llm_service() -> LlmInvoiceExtractor:
    return LlmInvoiceExtractor(settings())


def extract_invoice_use_case() -> ExtractInvoiceUseCase:
    return ExtractInvoiceUseCase(ocr_service(), llm_service())


def process_invoice_use_case() -> ProcessInvoiceUseCase:
    return ProcessInvoiceUseCase(
        ocr_service=ocr_service(),
        llm_service=llm_service(),
        accounting_gateway=accounting_client(),
        validator=InvoiceValidator(),
        partner_matcher=PartnerMatcher(),
        settings=settings(),
    )
