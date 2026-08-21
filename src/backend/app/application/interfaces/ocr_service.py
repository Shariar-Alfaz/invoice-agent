from typing import Protocol

from app.domain.models.processing_result import OcrResult


class OcrService(Protocol):
    async def extract_text(self, filename: str, content: bytes) -> OcrResult:
        ...
