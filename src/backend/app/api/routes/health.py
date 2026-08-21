from fastapi import APIRouter, Depends

from app.api.dependencies import accounting_client
from app.infrastructure.accounting.accounting_api_client import AccountingApiClient

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health(client: AccountingApiClient = Depends(accounting_client)) -> dict:
    accounting = await client.health()
    return {
        "success": True,
        "data": {
            "status": "ok",
            "accounting_api": accounting.get("data"),
        },
    }
