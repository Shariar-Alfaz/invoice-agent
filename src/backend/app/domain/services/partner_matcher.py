import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

from app.domain.models.invoice import ExtractedInvoice
from app.domain.models.partner import Partner


COMPANY_TOKENS = ("株式会社", "有限会社", "(株)", "（株）", "(有)", "（有）")
FUZZY_MATCH_THRESHOLD = 0.72
FUZZY_MATCH_MARGIN = 0.08


def normalize_partner_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKC", value)
    normalized = re.sub(r"\s+", "", normalized)
    for token in COMPANY_TOKENS:
        normalized = normalized.replace(token, "")
    return normalized.lower()


@dataclass(frozen=True)
class PartnerMatchResult:
    partner_code: str | None
    errors: list[str]
    warnings: list[str]


class PartnerMatcher:
    def match(self, invoice: ExtractedInvoice, partners: list[Partner]) -> PartnerMatchResult:
        if invoice.supplier_registration_number:
            result = self._single(
                [
                    partner
                    for partner in partners
                    if partner.registration_no == invoice.supplier_registration_number
                ],
                "registration number",
            )
            if result.partner_code or result.errors:
                return result

        supplier_name = normalize_partner_text(invoice.supplier_name)
        result = self._single(
            [
                partner
                for partner in partners
                if normalize_partner_text(partner.name) == supplier_name
            ],
            "supplier name",
        )
        if result.partner_code or result.errors:
            return result

        result = self._single(
            [
                partner
                for partner in partners
                if supplier_name in {normalize_partner_text(alias) for alias in partner.aliases}
            ],
            "supplier alias",
        )
        if result.partner_code or result.errors:
            return result

        fuzzy_result = self._safe_fuzzy_match(supplier_name, partners)
        if fuzzy_result.partner_code or fuzzy_result.errors:
            return fuzzy_result

        return PartnerMatchResult(
            partner_code=None,
            errors=["supplier could not be matched uniquely"],
            warnings=[],
        )

    def _single(self, matches: list[Partner], method: str) -> PartnerMatchResult:
        if len(matches) == 1:
            return PartnerMatchResult(
                partner_code=matches[0].partner_code,
                errors=[],
                warnings=[f"supplier matched by {method}"],
            )
        if len(matches) > 1:
            return PartnerMatchResult(
                partner_code=None,
                errors=[f"supplier match is ambiguous by {method}"],
                warnings=[],
            )
        return PartnerMatchResult(partner_code=None, errors=[], warnings=[])

    def _safe_fuzzy_match(self, supplier_name: str, partners: list[Partner]) -> PartnerMatchResult:
        best_by_partner: dict[str, tuple[float, Partner, str]] = {}
        for partner in partners:
            candidates = [partner.name, *partner.aliases]
            for candidate in candidates:
                normalized_candidate = normalize_partner_text(candidate)
                score = SequenceMatcher(None, supplier_name, normalized_candidate).ratio()
                current = best_by_partner.get(partner.partner_code)
                if current is None or score > current[0]:
                    best_by_partner[partner.partner_code] = (score, partner, candidate)

        scored = list(best_by_partner.values())
        scored.sort(key=lambda item: item[0], reverse=True)
        if not scored or scored[0][0] < FUZZY_MATCH_THRESHOLD:
            return PartnerMatchResult(partner_code=None, errors=[], warnings=[])

        best_score, best_partner, best_candidate = scored[0]
        second_score = scored[1][0] if len(scored) > 1 else 0
        if best_score - second_score < FUZZY_MATCH_MARGIN:
            return PartnerMatchResult(
                partner_code=None,
                errors=["supplier fuzzy match is ambiguous"],
                warnings=[],
            )

        return PartnerMatchResult(
            partner_code=best_partner.partner_code,
            errors=[],
            warnings=[
                "supplier matched by conservative fuzzy name match "
                f"against '{best_candidate}' ({best_score:.2f})"
            ],
        )
