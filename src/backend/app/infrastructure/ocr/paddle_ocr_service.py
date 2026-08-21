import tempfile
from pathlib import Path

from app.core.config import Settings
from app.core.exceptions import OcrExtractionError, UnsupportedDocumentError
from app.domain.models.processing_result import OcrResult
from app.infrastructure.ocr.pdf_text_extractor import PdfTextExtractor, has_meaningful_text


SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


class DocumentOcrService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.pdf_extractor = PdfTextExtractor()
        self._paddle = None

    async def extract_text(self, filename: str, content: bytes) -> OcrResult:
        extension = Path(filename).suffix.lower()
        if extension == ".pdf":
            pages = self.pdf_extractor.extract_pages(content)
            if has_meaningful_text(pages):
                return OcrResult(
                    text="\n\n".join(pages),
                    pages=pages,
                    engine="pymupdf",
                    confidence=None,
                    warnings=[],
                )
            images = self.pdf_extractor.render_pages(content)
            return self._extract_images(images, engine="paddleocr-rendered-pdf")

        if extension in SUPPORTED_IMAGE_EXTENSIONS:
            return self._extract_images([content], engine="paddleocr-image")

        raise UnsupportedDocumentError(f"Unsupported document type: {extension}")

    def _extract_images(self, images: list[bytes], engine: str) -> OcrResult:
        ocr = self._get_paddle()
        pages: list[str] = []
        confidences: list[float] = []

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            for index, image in enumerate(images):
                image_path = temp_path / f"page-{index + 1}.png"
                image_path.write_bytes(image)
                try:
                    result = ocr.ocr(str(image_path), cls=True)
                except Exception as exc:
                    raise OcrExtractionError("PaddleOCR failed to read an image page") from exc

                lines: list[str] = []
                for page_result in result or []:
                    for item in page_result or []:
                        text = item[1][0]
                        confidence = float(item[1][1])
                        lines.append(text)
                        confidences.append(confidence)
                pages.append("\n".join(lines))

        text = "\n\n".join(pages).strip()
        if not text:
            raise OcrExtractionError("OCR produced no text")

        confidence = sum(confidences) / len(confidences) if confidences else None
        warnings = []
        if confidence is not None and confidence < self.settings.ocr_confidence_threshold:
            warnings.append("OCR confidence is low")
        return OcrResult(
            text=text,
            pages=pages,
            engine=engine,
            confidence=confidence,
            warnings=warnings,
        )

    def _get_paddle(self):
        if self._paddle is not None:
            return self._paddle
        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise OcrExtractionError(
                "PaddleOCR is required for scanned PDFs and image invoices. "
                "Install paddleocr and paddlepaddle to enable local OCR."
            ) from exc
        self._paddle = PaddleOCR(use_angle_cls=True, lang=self.settings.ocr_language)
        return self._paddle
