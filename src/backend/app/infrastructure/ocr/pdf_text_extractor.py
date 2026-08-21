from app.core.exceptions import OcrExtractionError


class PdfTextExtractor:
    def extract_pages(self, content: bytes) -> list[str]:
        try:
            import fitz
        except ImportError as exc:
            raise OcrExtractionError("PyMuPDF is not installed") from exc

        try:
            with fitz.open(stream=content, filetype="pdf") as document:
                return [page.get_text().strip() for page in document]
        except Exception as exc:
            raise OcrExtractionError("Could not extract text from PDF") from exc

    def render_pages(self, content: bytes, zoom: float = 2.0) -> list[bytes]:
        try:
            import fitz
        except ImportError as exc:
            raise OcrExtractionError("PyMuPDF is not installed") from exc

        try:
            images: list[bytes] = []
            matrix = fitz.Matrix(zoom, zoom)
            with fitz.open(stream=content, filetype="pdf") as document:
                for page in document:
                    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                    images.append(pixmap.tobytes("png"))
            return images
        except Exception as exc:
            raise OcrExtractionError("Could not render scanned PDF pages") from exc


def has_meaningful_text(pages: list[str], minimum_chars: int = 40) -> bool:
    text = "\n".join(pages).strip()
    return len(text) >= minimum_chars
