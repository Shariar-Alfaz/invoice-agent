from app.application.interfaces.accounting_gateway import AccountingGateway
from app.application.interfaces.llm_service import InvoiceExtractionService
from app.application.interfaces.ocr_service import OcrService
from app.core.config import Settings
from app.core.exceptions import AccountingApiError
from app.domain.models.invoice import RegistrationInvoice
from app.domain.models.processing_result import InvoiceProcessingResult, ProcessingStatus
from app.domain.services.invoice_validator import InvoiceValidator
from app.domain.services.partner_matcher import PartnerMatcher


class ProcessInvoiceUseCase:
    def __init__(
        self,
        ocr_service: OcrService,
        llm_service: InvoiceExtractionService,
        accounting_gateway: AccountingGateway,
        validator: InvoiceValidator,
        partner_matcher: PartnerMatcher,
        settings: Settings,
    ):
        self.ocr_service = ocr_service
        self.llm_service = llm_service
        self.accounting_gateway = accounting_gateway
        self.validator = validator
        self.partner_matcher = partner_matcher
        self.settings = settings

    async def execute(self, filename: str, content: bytes, register: bool) -> InvoiceProcessingResult:
        ocr = await self.ocr_service.extract_text(filename, content)
        extracted = await self.llm_service.extract(ocr.text)

        validation = self.validator.validate(extracted)
        partners = await self.accounting_gateway.list_partners()
        partner_match = self.partner_matcher.match(extracted, partners)

        validation_errors = [*validation.errors, *partner_match.errors]
        warnings = [*ocr.warnings, *validation.warnings, *partner_match.warnings]

        if ocr.confidence is not None and ocr.confidence < self.settings.ocr_confidence_threshold:
            validation_errors.append("OCR confidence is below review threshold")
        if extracted.extraction_confidence < self.settings.extraction_confidence_threshold:
            validation_errors.append("extraction confidence is below review threshold")

        if partner_match.partner_code:
            existing = await self.accounting_gateway.list_invoices()
            duplicate = any(
                item.get("partner_code") == partner_match.partner_code
                and item.get("invoice_number") == extracted.invoice_number
                for item in existing
            )
            if duplicate:
                validation_errors.append("duplicate invoice detected before registration")

        if validation_errors:
            return InvoiceProcessingResult(
                status=ProcessingStatus.REVIEW,
                source_file=filename,
                ocr=ocr,
                extracted_invoice=extracted,
                partner_code=partner_match.partner_code,
                validation_errors=validation_errors,
                warnings=warnings,
            )

        if not register:
            return InvoiceProcessingResult(
                status=ProcessingStatus.READY,
                source_file=filename,
                ocr=ocr,
                extracted_invoice=extracted,
                partner_code=partner_match.partner_code,
                warnings=warnings,
            )

        payload = RegistrationInvoice.from_extracted(extracted, partner_match.partner_code or "")
        try:
            response = await self.accounting_gateway.register_invoice(payload)
        except AccountingApiError as exc:
            return InvoiceProcessingResult(
                status=ProcessingStatus.REVIEW,
                source_file=filename,
                ocr=ocr,
                extracted_invoice=extracted,
                partner_code=partner_match.partner_code,
                validation_errors=[exc.message],
                warnings=warnings,
                accounting_response=exc.details,
            )
        return InvoiceProcessingResult(
            status=ProcessingStatus.REGISTERED,
            source_file=filename,
            ocr=ocr,
            extracted_invoice=extracted,
            partner_code=partner_match.partner_code,
            warnings=warnings,
            accounting_response=response,
        )
