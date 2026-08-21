from app.application.interfaces.llm_service import InvoiceExtractionService
from app.application.interfaces.ocr_service import OcrService
from app.domain.models.processing_result import InvoiceProcessingResult, ProcessingStatus


class ExtractInvoiceUseCase:
    def __init__(self, ocr_service: OcrService, llm_service: InvoiceExtractionService):
        self.ocr_service = ocr_service
        self.llm_service = llm_service

    async def execute(self, filename: str, content: bytes) -> InvoiceProcessingResult:
        ocr = await self.ocr_service.extract_text(filename, content)
        extracted = await self.llm_service.extract(ocr.text)
        warnings = [*ocr.warnings, *extracted.warnings]
        return InvoiceProcessingResult(
            status=ProcessingStatus.READY,
            source_file=filename,
            ocr=ocr,
            extracted_invoice=extracted,
            warnings=warnings,
        )
