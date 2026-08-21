from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = BACKEND_DIR.parent
PROJECT_ROOT = SRC_DIR.parent


class Settings(BaseSettings):
    debug: bool = False

    accounting_api_url: str = "http://localhost:8080"
    accounting_api_key: str = "demo-key-1234"
    accounting_timeout_seconds: float = 10.0

    llm_provider: str = "gemini"
    llm_api_key: str = ""
    llm_model: str = "gemini-3.6-flash"
    llm_fallback_models: str = "gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.7-flash"
    llm_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    llm_timeout_seconds: float = 30.0

    ocr_language: str = "japan"
    extraction_confidence_threshold: float = Field(default=0.85, ge=0, le=1)
    ocr_confidence_threshold: float = Field(default=0.60, ge=0, le=1)
    max_upload_mb: int = Field(default=15, ge=1)

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BACKEND_DIR / ".env"),
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
