import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.api.routes.health import router as health_router
from app.api.routes.invoices import router as invoices_router
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    docs_url = "/docs" if settings.debug else None
    redoc_url = "/redoc" if settings.debug else None
    openapi_url = "/openapi.json" if settings.debug else None

    api = FastAPI(
        title="Invoice Agent API",
        description="Extract, validate, review, and register Japanese invoices.",
        version="0.1.0",
        debug=settings.debug,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
        swagger_ui_parameters={
            "defaultModelsExpandDepth": -1,
            "displayRequestDuration": True,
        },
    )
    api.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:4200",
            "http://127.0.0.1:4200",
        ],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                },
            },
        )

    @api.get("/", include_in_schema=False)
    async def root():
        if settings.debug:
            return RedirectResponse(url="/docs")
        return JSONResponse(content={"success": True, "data": {"status": "ok"}})

    if settings.debug:
        @api.get("/swagger", include_in_schema=False)
        async def swagger() -> RedirectResponse:
            return RedirectResponse(url="/docs")

    api.include_router(health_router)
    api.include_router(invoices_router)
    return api


app = create_app()
