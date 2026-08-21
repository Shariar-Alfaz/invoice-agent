from datetime import date

from app.domain.models.invoice import ExtractedInvoice, InvoiceLine
from app.domain.models.partner import Partner
from app.domain.services.partner_matcher import PartnerMatcher


def invoice(name: str, registration_no: str | None = None) -> ExtractedInvoice:
    return ExtractedInvoice(
        supplier_name=name,
        supplier_registration_number=registration_no,
        invoice_number="INV-1",
        issue_date=date(2026, 1, 1),
        due_date=date(2026, 1, 31),
        lines=[InvoiceLine(description="Item", quantity=None, unit="lot", unit_price=None, amount=1000, tax_code="T10")],
        subtotal=1000,
        tax_amount=100,
        total_amount=1100,
        extraction_confidence=0.99,
    )


def partners() -> list[Partner]:
    return [
        Partner(partner_code="P-1", name="株式会社山田製作所", aliases=["山田製作所"], registration_no="T1"),
        Partner(partner_code="P-2", name="有限会社佐藤商店", aliases=["佐藤商店"], registration_no="T2"),
        Partner(
            partner_code="P-5",
            name="みらいITソリューションズ株式会社",
            aliases=["みらいIT", "みらいITソリューションズ"],
            registration_no="T5050005000505",
        ),
    ]


def test_exact_registration_number():
    result = PartnerMatcher().match(invoice("Unknown", "T2"), partners())
    assert result.partner_code == "P-2"


def test_exact_company_name():
    result = PartnerMatcher().match(invoice("株式会社山田製作所"), partners())
    assert result.partner_code == "P-1"


def test_alias():
    result = PartnerMatcher().match(invoice("佐藤商店"), partners())
    assert result.partner_code == "P-2"


def test_unresolved():
    result = PartnerMatcher().match(invoice("未登録会社"), partners())
    assert result.partner_code is None
    assert result.errors


def test_ambiguous_match():
    duplicate_partners = [
        Partner(partner_code="P-1", name="株式会社山田製作所", aliases=[], registration_no=None),
        Partner(partner_code="P-2", name="山田製作所", aliases=[], registration_no=None),
    ]
    result = PartnerMatcher().match(invoice("山田製作所"), duplicate_partners)
    assert result.partner_code is None
    assert any("ambiguous" in error for error in result.errors)


def test_conservative_fuzzy_match_for_ocr_supplier_typo():
    result = PartnerMatcher().match(invoice("みらいソリユーツョンズ株式会社", "T15050005000505"), partners())
    assert result.partner_code == "P-5"
    assert any("fuzzy" in warning for warning in result.warnings)
