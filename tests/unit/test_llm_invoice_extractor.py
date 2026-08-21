import json

import httpx
import pytest
from pydantic import ValidationError

from app.domain.models.invoice import ExtractedInvoice
from app.core.config import Settings
from app.infrastructure.llm.llm_invoice_extractor import (
    extract_balanced_json,
    extract_with_heuristics,
    gemini_error_details,
    parse_json_object,
    reconcile_invoice_amounts,
)
from app.infrastructure.llm.llm_invoice_extractor import LlmInvoiceExtractor


def test_parse_json_object_accepts_plain_json():
    assert parse_json_object('{"invoice_number": "INV-1"}') == {"invoice_number": "INV-1"}


def test_parse_json_object_accepts_markdown_fence():
    content = """```json
{"invoice_number": "INV-1", "warnings": []}
```"""

    assert parse_json_object(content) == {"invoice_number": "INV-1", "warnings": []}


def test_parse_json_object_extracts_first_balanced_object_from_text():
    content = 'Here is the result:\n{"supplier": "A", "note": "brace } inside string"}\nDone.'

    assert parse_json_object(content) == {"supplier": "A", "note": "brace } inside string"}


def test_parse_json_object_rejects_arrays():
    with pytest.raises(json.JSONDecodeError):
        parse_json_object('[{"invoice_number": "INV-1"}]')


def test_extract_balanced_json_rejects_missing_json():
    with pytest.raises(json.JSONDecodeError):
        extract_balanced_json("Gemini returned no structured object")


def test_gemini_error_details_includes_http_status_without_api_key():
    request = httpx.Request("POST", "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent")
    response = httpx.Response(
        404,
        json={"error": {"code": 404, "message": "models/test is not found"}},
        request=request,
    )
    exc = httpx.HTTPStatusError("not found", request=request, response=response)

    assert gemini_error_details(exc) == {
        "stage": "gemini_http",
        "status_code": 404,
        "response": {"error": {"code": 404, "message": "models/test is not found"}},
    }


def test_gemini_error_details_reports_schema_validation_stage():
    with pytest.raises(ValidationError) as exc_info:
        ExtractedInvoice.model_validate({"invoice_number": "INV-1"})

    details = gemini_error_details(exc_info.value)

    assert details["stage"] == "schema_validation"
    assert details["errors"]


def test_gemini_model_candidates_are_unique_and_ordered():
    settings = Settings(
        llm_model="gemini-3.6-flash",
        llm_fallback_models="gemini-3.6-flash, gemini-3.1-flash-lite",
    )

    assert LlmInvoiceExtractor(settings)._gemini_model_candidates() == [
        "gemini-3.6-flash",
        "gemini-3.1-flash-lite",
    ]


def test_heuristic_fallback_returns_reviewable_invoice():
    text = (
        "請求書\n"
        "請求書番号 INV-TEST-1\n"
        "発行日 2026年1月1日\n"
        "株式会社山田製作所\n"
        "登録番号 T1010001000101\n"
        "合計 2200\n"
        "お支払期日 2026年1月31日"
    )

    invoice = extract_with_heuristics(text, "Gemini attempts failed: test")

    assert invoice.invoice_number == "INV-TEST-1"
    assert invoice.total_amount == 2200
    assert invoice.extraction_confidence < 0.85
    assert any("heuristic fallback" in warning for warning in invoice.warnings)


def test_reconcile_invoice_amounts_handles_discount_and_shifted_amount_columns():
    invoice = ExtractedInvoice.model_validate(
        {
            "supplier_name": "みらいITソリューションズ株式会社",
            "supplier_registration_number": "T5050005000505",
            "invoice_number": "MIT-2026-014",
            "issue_date": "2026-02-10",
            "due_date": "2026-03-31",
            "currency": "JPY",
            "lines": [
                {
                    "description": "業務システム改修",
                    "quantity": None,
                    "unit": "式",
                    "unit_price": None,
                    "amount": 450000,
                    "tax_code": "T10",
                },
                {
                    "description": "追加ライセンス",
                    "quantity": None,
                    "unit": "本",
                    "unit_price": 24000,
                    "amount": 24000,
                    "tax_code": "T10",
                },
                {
                    "description": "値引き",
                    "quantity": None,
                    "unit": "式",
                    "unit_price": 30000,
                    "amount": -120000,
                    "tax_code": "T10",
                },
            ],
            "subtotal": 540000,
            "tax_amount": 54000,
            "total_amount": 594000,
            "extraction_confidence": 0.85,
            "warnings": [],
        }
    )

    reconciled = reconcile_invoice_amounts(invoice)

    assert [line.amount for line in reconciled.lines] == [450000, 120000, -30000]
    assert reconciled.lines[1].quantity == 5
    assert any("reconciled" in warning for warning in reconciled.warnings)
