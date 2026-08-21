import math
from dataclasses import dataclass

from app.domain.models.invoice import ExtractedInvoice


SUPPORTED_TAX_RATES = {"T10": 0.10, "T08": 0.08}


@dataclass(frozen=True)
class ValidationResult:
    errors: list[str]
    warnings: list[str]

    @property
    def is_valid(self) -> bool:
        return not self.errors


class InvoiceValidator:
    def validate(self, invoice: ExtractedInvoice) -> ValidationResult:
        errors: list[str] = []
        warnings: list[str] = []

        if invoice.due_date < invoice.issue_date:
            errors.append("due_date must be on or after issue_date")

        if invoice.currency != "JPY":
            errors.append("currency must be JPY")

        if not invoice.lines:
            errors.append("invoice must contain at least one line")

        unknown_tax_codes = sorted(
            {line.tax_code for line in invoice.lines if line.tax_code not in SUPPORTED_TAX_RATES}
        )
        for tax_code in unknown_tax_codes:
            errors.append(f"unsupported tax code: {tax_code}")

        for index, line in enumerate(invoice.lines):
            if not line.description.strip():
                errors.append(f"lines[{index}].description is required")
            if not line.unit.strip():
                errors.append(f"lines[{index}].unit is required")
            if line.quantity is not None and line.unit_price is not None:
                expected_amount = line.quantity * line.unit_price
                if expected_amount != line.amount:
                    errors.append(
                        f"lines[{index}] quantity x unit_price mismatch: "
                        f"expected {expected_amount}, received {line.amount}"
                    )

        expected_subtotal = sum(line.amount for line in invoice.lines)
        if invoice.subtotal != expected_subtotal:
            errors.append(
                f"subtotal mismatch: expected {expected_subtotal}, received {invoice.subtotal}"
            )

        if not unknown_tax_codes:
            subtotal_by_code: dict[str, int] = {}
            for line in invoice.lines:
                subtotal_by_code[line.tax_code] = subtotal_by_code.get(line.tax_code, 0) + line.amount
            expected_tax = sum(
                math.floor(subtotal * SUPPORTED_TAX_RATES[code])
                for code, subtotal in subtotal_by_code.items()
            )
            if invoice.tax_amount != expected_tax:
                errors.append(
                    f"tax_amount mismatch: expected {expected_tax}, received {invoice.tax_amount}"
                )
        else:
            expected_tax = invoice.tax_amount

        expected_total = expected_subtotal + expected_tax
        if invoice.total_amount != expected_total:
            errors.append(
                f"total_amount mismatch: expected {expected_total}, received {invoice.total_amount}"
            )

        warnings.extend(invoice.warnings)
        return ValidationResult(errors=errors, warnings=warnings)
