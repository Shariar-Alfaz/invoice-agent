import json
import math
import re
from datetime import date
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.core.exceptions import LlmExtractionError
from app.domain.models.invoice import ExtractedInvoice
from app.domain.services.invoice_validator import SUPPORTED_TAX_RATES


SYSTEM_PROMPT = """You extract structured data from Japanese business invoices.
Never invent missing values. Preserve numeric values from the invoice.
Return JPY amounts as integers. Convert dates to YYYY-MM-DD.
Use tax_code T10 or T08 only when sufficiently supported by the invoice.
Lower extraction_confidence and add warnings for handwriting, OCR ambiguity, or missing fields.
Return strict JSON matching the requested schema."""

DATE_RE = re.compile(r"(\d{4})[年/\]\-](\d{1,2})[月/\-](\d{1,2})")
INVOICE_NUMBER_RE = re.compile(r"(?:請求書番号|請求番号|Invoice\s*No\.?)\s*[.:：]?\s*([A-Z0-9丁\-]+)", re.IGNORECASE)
REGISTRATION_RE = re.compile(r"T?\d{13}")
AMOUNT_RE = re.compile(r"\d[\d,/.]*")
DISCOUNT_KEYWORDS = ("値引", "割引", "discount", "rebate", "credit", "adjustment")

GEMINI_INVOICE_SCHEMA = {
    "type": "object",
    "properties": {
        "supplier_name": {"type": "string"},
        "supplier_registration_number": {"type": "string", "nullable": True},
        "invoice_number": {"type": "string"},
        "issue_date": {"type": "string", "format": "date"},
        "due_date": {"type": "string", "format": "date"},
        "currency": {"type": "string", "enum": ["JPY"]},
        "lines": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "quantity": {"type": "integer", "nullable": True},
                    "unit": {"type": "string"},
                    "unit_price": {"type": "integer", "nullable": True},
                    "amount": {"type": "integer"},
                    "tax_code": {"type": "string", "enum": ["T10", "T08"]},
                },
                "required": ["description", "quantity", "unit", "unit_price", "amount", "tax_code"],
            },
        },
        "subtotal": {"type": "integer"},
        "tax_amount": {"type": "integer"},
        "total_amount": {"type": "integer"},
        "extraction_confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "supplier_name",
        "supplier_registration_number",
        "invoice_number",
        "issue_date",
        "due_date",
        "currency",
        "lines",
        "subtotal",
        "tax_amount",
        "total_amount",
        "extraction_confidence",
        "warnings",
    ],
}


def parse_json_object(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        data = json.loads(extract_balanced_json(cleaned))

    if not isinstance(data, dict):
        raise json.JSONDecodeError("LLM response must be a JSON object", cleaned, 0)
    return data


def extract_balanced_json(content: str) -> str:
    start = content.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object found", content, 0)

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(content)):
        character = content[index]

        if escaped:
            escaped = False
            continue
        if character == "\\" and in_string:
            escaped = True
            continue
        if character == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                return content[start : index + 1]

    raise json.JSONDecodeError("Unterminated JSON object", content, start)


def gemini_error_details(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, httpx.HTTPStatusError):
        response = exc.response
        try:
            body: Any = response.json()
        except ValueError:
            body = response.text[:500]
        return {
            "stage": "gemini_http",
            "status_code": response.status_code,
            "response": body,
        }
    if isinstance(exc, ValidationError):
        return {
            "stage": "schema_validation",
            "errors": exc.errors()[:10],
        }
    if isinstance(exc, json.JSONDecodeError):
        return {
            "stage": "json_parse",
            "message": exc.msg,
        }
    return {
        "stage": "gemini_response",
        "message": str(exc),
    }


def extract_with_heuristics(text: str, reason: str) -> ExtractedInvoice:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    joined = "\n".join(lines)
    dates = [normalize_date(match) for match in DATE_RE.finditer(joined)]
    issue_date = date.fromisoformat(dates[0]) if dates else date.today()
    due_date = date.fromisoformat(dates[-1]) if dates else issue_date

    invoice_match = INVOICE_NUMBER_RE.search(joined)
    invoice_number = normalize_invoice_number(invoice_match.group(1)) if invoice_match else "REVIEW-REQUIRED"
    supplier_name = guess_supplier_name(lines)
    registration_number = guess_registration_number(joined)
    total_amount = guess_total_amount(lines)
    tax_amount = math.floor(total_amount / 11) if total_amount else 0
    subtotal = total_amount - tax_amount if total_amount else 0

    return ExtractedInvoice.model_validate(
        {
            "supplier_name": supplier_name,
            "supplier_registration_number": registration_number,
            "invoice_number": invoice_number,
            "issue_date": issue_date,
            "due_date": due_date,
            "currency": "JPY",
            "lines": [
                {
                    "description": "Extracted invoice items",
                    "quantity": 1,
                    "unit": "式",
                    "unit_price": subtotal,
                    "amount": subtotal,
                    "tax_code": "T10",
                }
            ],
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "extraction_confidence": 0.55,
            "warnings": [
                "Gemini was unavailable, so a heuristic fallback extraction was used.",
                reason,
                "Review all fields and line items before accounting submission.",
            ],
        }
    )


def normalize_date(match: re.Match[str]) -> str:
    year, month, day = match.groups()
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def normalize_invoice_number(value: str) -> str:
    return value.replace("丁", "T").strip(" .:：")


def guess_registration_number(text: str) -> str | None:
    match = REGISTRATION_RE.search(text)
    if not match:
        return None
    value = match.group(0)
    return value if value.startswith("T") else f"T{value}"


def guess_supplier_name(lines: list[str]) -> str:
    organization_lines = [
        line
        for line in lines
        if ("株式会社" in line or "有限会社" in line)
        and "サンプル商事" not in line
        and "御中" not in line
    ]
    return organization_lines[-1] if organization_lines else "要確認"


def guess_total_amount(lines: list[str]) -> int:
    for keyword in ("御請求金額", "合計", "合司", "請求金額"):
        for index, line in enumerate(lines):
            if keyword in line:
                amount = first_amount(lines[index : index + 4])
                if amount:
                    return amount
    amounts = [parse_amount(match.group(0)) for match in AMOUNT_RE.finditer("\n".join(lines))]
    return max(amounts, default=0)


def first_amount(lines: list[str]) -> int:
    for line in lines:
        for match in AMOUNT_RE.finditer(line):
            amount = parse_amount(match.group(0))
            if amount:
                return amount
    return 0


def parse_amount(value: str) -> int:
    digits = re.sub(r"\D", "", value)
    return int(digits) if digits else 0


def reconcile_invoice_amounts(invoice: ExtractedInvoice) -> ExtractedInvoice:
    """Correct common OCR/LLM column shifts when invoice totals prove the intended math."""
    lines = [line.model_copy() for line in invoice.lines]
    warnings = list(invoice.warnings)
    changed = False

    for line in lines:
        if not is_discount_line(line.description):
            continue
        original_amount = line.amount
        if line.quantity is not None and line.unit_price is not None:
            line.amount = -abs(line.quantity * line.unit_price)
        elif line.unit_price is not None and line.quantity in (None, 1):
            line.amount = -abs(line.unit_price)
        else:
            line.amount = -abs(line.amount)
        changed = changed or line.amount != original_amount

    subtotal_target = trusted_subtotal(invoice)
    if subtotal_target is not None and sum(line.amount for line in lines) != subtotal_target:
        changed = infer_single_remainder_line(lines, subtotal_target) or changed

    if not changed:
        return invoice

    warnings.append("Line amounts were reconciled against invoice subtotal/tax/total rules.")
    return invoice.model_copy(update={"lines": lines, "warnings": warnings})


def is_discount_line(description: str) -> bool:
    normalized = description.lower()
    return any(keyword in normalized for keyword in DISCOUNT_KEYWORDS)


def trusted_subtotal(invoice: ExtractedInvoice) -> int | None:
    if invoice.subtotal + invoice.tax_amount != invoice.total_amount:
        return None

    tax_rates = {line.tax_code for line in invoice.lines}
    if len(tax_rates) != 1:
        return None

    tax_code = next(iter(tax_rates))
    tax_rate = SUPPORTED_TAX_RATES.get(tax_code)
    if tax_rate is None:
        return None

    return invoice.subtotal if math.floor(invoice.subtotal * tax_rate) == invoice.tax_amount else None


def infer_single_remainder_line(lines: list, subtotal_target: int) -> bool:
    current_sum = sum(line.amount for line in lines)

    for line in lines:
        if is_discount_line(line.description):
            continue
        remainder = subtotal_target - (current_sum - line.amount)
        if remainder == line.amount:
            continue
        if not is_plausible_line_amount(line, remainder):
            continue

        line.amount = remainder
        if line.unit_price and line.quantity is None and remainder % line.unit_price == 0:
            inferred_quantity = remainder // line.unit_price
            if inferred_quantity > 0:
                line.quantity = inferred_quantity
        return True

    return False


def is_plausible_line_amount(line, amount: int) -> bool:
    if amount <= 0:
        return False
    if line.quantity is not None and line.unit_price is not None:
        return amount == line.quantity * line.unit_price
    if line.unit_price is not None and line.unit_price > 0:
        return amount % line.unit_price == 0
    if line.amount > 0:
        ratio = amount / line.amount
        return ratio.is_integer() and 1 < ratio <= 100
    return False


def summarize_gemini_attempts(attempts: list[dict[str, Any]]) -> str:
    summary = []
    for attempt in attempts:
        model = attempt.get("model", "unknown-model")
        status_code = attempt.get("status_code")
        response = attempt.get("response")
        status = None
        if isinstance(response, dict):
            error = response.get("error")
            if isinstance(error, dict):
                status = error.get("status")
        summary.append(f"{model}: {status_code or attempt.get('stage')} {status or ''}".strip())
    return "Gemini attempts failed: " + "; ".join(summary)


class LlmInvoiceExtractor:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def extract(self, text: str) -> ExtractedInvoice:
        if not self.settings.llm_api_key or not self.settings.llm_model or not self.settings.llm_base_url:
            raise LlmExtractionError(
                "LLM is not configured. Set LLM_API_KEY, LLM_MODEL, and LLM_BASE_URL."
            )

        if self.settings.llm_provider.lower() == "gemini":
            return await self._extract_with_gemini(text)
        return await self._extract_with_openai_compatible(text)

    async def _extract_with_openai_compatible(self, text: str) -> ExtractedInvoice:
        schema_hint = json.dumps(ExtractedInvoice.model_json_schema(), ensure_ascii=False)
        payload = {
            "model": self.settings.llm_model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        "Extract this invoice into strict JSON for this schema:\n"
                        f"{schema_hint}\n\nInvoice OCR text:\n{text}"
                    ),
                },
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        headers = {"Authorization": f"Bearer {self.settings.llm_api_key}"}

        try:
            async with httpx.AsyncClient(timeout=self.settings.llm_timeout_seconds) as client:
                response = await client.post(self.settings.llm_base_url, json=payload, headers=headers)
            response.raise_for_status()
            body = response.json()
            content = body["choices"][0]["message"]["content"]
            data = parse_json_object(content)
            return reconcile_invoice_amounts(ExtractedInvoice.model_validate(data))
        except (httpx.HTTPError, KeyError, json.JSONDecodeError, ValidationError) as exc:
            raise LlmExtractionError("LLM extraction failed or returned invalid JSON") from exc

    async def _extract_with_gemini(self, text: str) -> ExtractedInvoice:
        attempts: list[dict[str, Any]] = []
        for model in self._gemini_model_candidates():
            try:
                return await self._extract_with_gemini_model(text, model)
            except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError, ValidationError) as exc:
                details = gemini_error_details(exc)
                details["model"] = model
                attempts.append(details)

        reason = summarize_gemini_attempts(attempts)
        return extract_with_heuristics(text, reason)

    async def _extract_with_gemini_model(self, text: str, model: str) -> ExtractedInvoice:
        prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            "Extract this invoice into strict JSON. Return only values supported by the OCR text. "
            "Use null for unknown optional quantity, unit_price, or supplier_registration_number. "
            "Use an empty string for required text fields only if the OCR truly does not contain the value.\n\n"
            f"Invoice OCR text:\n{text}"
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
                "responseSchema": GEMINI_INVOICE_SCHEMA,
            },
        }
        base_url = self.settings.llm_base_url.rstrip("/")
        url = f"{base_url}/models/{model}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.settings.llm_api_key,
        }

        async with httpx.AsyncClient(timeout=self.settings.llm_timeout_seconds) as client:
            response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        body = response.json()
        candidates = body.get("candidates") or []
        if not candidates:
            raise KeyError(f"No Gemini candidates returned: {body.get('promptFeedback')}")
        candidate = candidates[0]
        finish_reason = candidate.get("finishReason")
        if finish_reason and finish_reason not in {"STOP", "MAX_TOKENS"}:
            raise KeyError(f"Gemini finishReason={finish_reason}: {candidate.get('safetyRatings')}")
        parts = candidate.get("content", {}).get("parts") or []
        content = "".join(part.get("text", "") for part in parts).strip()
        if not content:
            raise KeyError(f"Gemini returned empty content: {candidate}")
        data = parse_json_object(content)
        return reconcile_invoice_amounts(ExtractedInvoice.model_validate(data))

    def _gemini_model_candidates(self) -> list[str]:
        configured = [self.settings.llm_model, *self.settings.llm_fallback_models.split(",")]
        candidates: list[str] = []
        for model in configured:
            normalized = model.strip()
            if normalized and normalized not in candidates:
                candidates.append(normalized)
        return candidates
