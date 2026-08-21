# Submission

- Name: [Your name]
- Submission date (YYYY-MM-DD): 2026-08-20
- Hours actually spent: 8
- Repository / how to run it: run `.\src\backend\.venv\Scripts\python.exe src\backend\run_server.py` from the repository root. This starts both the mock accounting API on `http://localhost:8080` and the Invoice Agent API on `http://127.0.0.1:8000`. Swagger is available at `http://127.0.0.1:8000/docs` only when `DEBUG=true`, and intentionally shows only the single full workflow endpoint. In release mode, `DEBUG=false` disables Swagger, ReDoc, and OpenAPI JSON. The review UI runs from `src/frontend` with `npm start` at `http://localhost:4200`. The supplied accounting API itself only requires Python 3.9+, as stated in the assignment; the Invoice Agent app uses Python 3.11+ because of its FastAPI, Pydantic v2, PyMuPDF, and PaddleOCR dependencies.

## 1. Understanding the request

The client described a manual invoice entry problem: staff read invoices from suppliers, type them into the accounting system, and risk overtime, duplicate payments, and data-entry mistakes. I treated the real problem as controlled automation, not just OCR. The system should extract invoice data, check it deterministically, match the supplier against the accounting master, and register only invoices that are safe enough to post automatically.

I set out to build a small backend that demonstrates the full intake path for the sample invoices: document text extraction, LLM-based semantic extraction, validation, supplier matching, duplicate checking, and registration into the supplied accounting API. I deliberately kept a review boundary for uncertain cases because a false negative is safer than an incorrect accounting entry.

## 2. What you would have asked the client

| What you wanted to ask | The assumption you made | Why |
|---|---|---|
| Should every invoice be posted automatically, or should low-confidence invoices require review? | Post automatically only when validation, supplier matching, and duplicate checks pass. Route the rest to review. | The client mentioned a near duplicate-payment incident, so safety is more important than maximizing automation. |
| What level of OCR/LLM confidence is acceptable for production posting? | Use an extraction confidence threshold of `0.85` and an OCR confidence threshold of `0.60`, both configurable. | The assignment gives `0.85` as the default extraction threshold and asks for explainable verification. |
| How should supplier names with OCR mistakes be matched? | Match by registration number first, then exact normalized name/alias, then only conservative unique fuzzy matching. | Japanese OCR can confuse similar characters, but supplier matching must not guess among multiple possible partners. |
| How should invoices with missing line units be handled? | Treat missing `unit` as a validation error and route to review. | The accounting API requires a non-empty `unit` for each line. |
| Is a frontend review tool required for the demo? | Add a small review screen after the backend flow works. | The assignment lists this as optional differentiation, and it is valuable for low-confidence or corrected submissions. |

## 3. Scoping decisions

**What you built**

I built a FastAPI application with a clean-architecture layout. It supports PDF text-layer extraction with PyMuPDF, scanned PDF/image OCR with PaddleOCR configured for Japanese, Gemini-based LLM extraction behind an interface, deterministic invoice validation, supplier matching, duplicate detection, and accounting API registration. A single root command starts both the supplied accounting API and the application API. I also added an Angular + PrimeNG + Tailwind review screen for correcting extracted fields and submitting the reviewed invoice.

The public invoice workflow is `/api/invoices/process`. By default it runs extraction, validation, supplier matching, duplicate checking, and accounting registration when the invoice passes the safety gates. The review UI uses the same workflow with `register=false` first, then submits the corrected invoice through a hidden backend review route.

**What you left out, and why**

I did not build a persistent database, batch processing queue, or deployment packaging. Those are useful production pieces, but they would take time away from the core evaluation points: extraction, validation, supplier matching, review, and integration with the existing accounting API.

## 4. Design and technology choices

The flow is:

`upload -> OCR/text extraction -> LLM structured extraction -> deterministic validation -> supplier matching -> duplicate check -> accounting API registration or review`

I used FastAPI and Pydantic v2 for API/schema validation because they are quick to build with and can expose Swagger for local debugging. Swagger/OpenAPI is disabled in release mode. The domain layer contains the invoice models, partner model, validator, and partner matcher so business rules do not depend on FastAPI. The application layer coordinates use cases through interfaces. The infrastructure layer contains the OCR adapters, LLM adapter, and accounting API client.

For OCR, I used PyMuPDF first for text-layer PDFs because it is fast and preserves text accurately. If a PDF has little usable text, pages are rendered to images and sent to PaddleOCR. JPG/JPEG/PNG files go directly to PaddleOCR. PaddleOCR was configured with Japanese recognition and local model files, so scanned invoices can be processed without a paid OCR service.

For a production version, I would evaluate a paid document OCR service for scanned and handwritten invoices, such as Google Document AI, Azure AI Document Intelligence, or AWS Textract. I did not use one in the demo because the assignment sample set is small and a local/free approach keeps the take-home easy to run, but paid OCR would likely improve handwriting, low-resolution scans, field geometry, and table reconstruction.

For the LLM, I used the Gemini API free tier with `gemini-3.6-flash`, behind an `InvoiceExtractionService` abstraction. The extractor also tries configured Gemini fallback models and falls back to a low-confidence heuristic extraction when Gemini is temporarily unavailable, so the reviewer still receives a reviewable invoice instead of a hard failure. The LLM prompt asks only for semantic extraction into strict JSON; it is not asked to choose a `partner_code` or decide whether the invoice should be posted.

The committed configuration template is `.env.example`. It documents the keys used by the demo without committing private secrets:

| Service | Why it is used | Configuration |
|---|---|---|
| Gemini API | Semantic extraction from OCR/text into structured invoice JSON | `LLM_PROVIDER=gemini`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` |
| PaddleOCR | Local Japanese OCR for scanned invoices | `OCR_LANGUAGE=japan` |
| PrimeNG / PrimeUI | Angular review UI controls and licensed PrimeUI integration | `PRIMEUI_LICENSE` |
| Mock accounting API | Required take-home accounting system | `ACCOUNTING_API_KEY=demo-key-1234` |

I intentionally do not commit the real Gemini API key or PrimeUI license token. Those belong in a local `.env` file, which is ignored by Git.

I decided against a database, queue, CQRS, or Docker because they were not necessary for a credible 8-hour demo.

## 5. How you used AI, and how you checked it

**What you delegated to AI**

The LLM receives the extracted Japanese invoice text and converts it into structured invoice fields: supplier name, registration number, invoice number, dates, line items, tax codes, subtotal, tax, total, confidence, and warnings.

**How you verified the output**

I did not trust the LLM totals or supplier identity directly. The validator recalculates line math, subtotal, tax by accounting API rules, and total. It checks date order, JPY currency, supported tax codes, required line fields, and `quantity * unit_price == amount` where applicable. Supplier matching uses the accounting `/partners` API and resolves by registration number, normalized name, alias, or a conservative unique fuzzy match. Before registration, the app checks existing invoices for duplicate `partner_code + invoice_number`.

**A case where the AI got it wrong**

On scanned invoices, OCR/LLM output sometimes returned an empty `unit` for a line or produced a noisy supplier spelling such as `みらいソリユーツョンズ株式会社`. The system did not silently fix line units. Missing units route the invoice to review because the accounting API requires them. For supplier names, I added conservative fuzzy matching only when the match is unique and clearly points to one partner.

## 6. Integrating with the accounting system

The accounting API is isolated behind an async `httpx` client. The base URL and API key come from settings, not hardcoded secrets. The client supports `/health`, `/partners`, `/tax-codes`, `/invoices`, and `POST /invoices`. It preserves accounting API error codes and surfaces them in the processing result.

The app handles the accounting constraints before posting: dates are ISO formatted, amounts are integer JPY, tax codes are `T10`/`T08`, suppliers must resolve to known partner codes, lines must be present, and totals must match recalculated values. If the accounting API still rejects a payload, the invoice returns to review with the accounting error details.

| Invoice | Result | How you handled it |
|---|---|---|
| `invoice_02.pdf` | Registered as `P-1004 / OSK-26-0112` in local verification. | Text-layer PDF extracted with PyMuPDF, supplier matched by registration number, totals validated, then posted to `/invoices`. |
| `invoice_04.jpg` | Review in one run, registered in another run when Gemini produced complete valid line data. | Scanned image OCR used PaddleOCR. If the LLM returned missing line units, validation blocked submission. |
| `invoice_05.jpg` | Review when line units were missing. | Supplier typo can now be resolved conservatively, but empty line units remain a review issue because the accounting API requires `unit`. |
| Duplicate invoice retry | Review/duplicate state. | Existing invoices are checked before POST, and `409 DUPLICATE_INVOICE` is still handled from the API. |

The Angular review UI uses the same backend workflow. It calls `/api/invoices/process?register=false` first, displays OCR and extraction confidence, validation errors, warnings, OCR text, editable header fields, editable line items, and partner selection. The final reviewer action posts the corrected payload through the backend so the accounting API is called only after review.

## 7. Cost, limits, and risk in production

- **Cost per invoice** (and what makes it up): OCR is local CPU cost using PaddleOCR in this demo. LLM cost is the Gemini extraction call; in this demo it uses a free-tier Gemini key, so direct API cost is $0 while within free-tier limits. In paid production, cost depends on token volume, selected model, and whether a paid OCR service is added for scanned/handwritten documents.
- **Monthly cost at 1,000 invoices per month**: With free-tier availability, direct API cost could remain near $0 for a small demo, but production should budget for paid LLM usage and compute. If handwriting or poor scans are common, I would also budget for paid OCR on only those documents or on all scanned inputs. Even with paid OCR plus LLM calls, the cost should be weighed against month-end overtime and the risk of incorrect payments.
- **Processing time per invoice**: Text-layer PDFs are fast, typically seconds including the LLM call. Scanned images take longer because PaddleOCR runs local detection and recognition; in local testing a scanned image took several seconds after models were cached.
- **Where this breaks first**: OCR quality and LLM extraction consistency break first, especially on scans, handwriting, rotated documents, and tables with ambiguous units. This is where paid OCR/document extraction would be the first production upgrade. Free-tier API rate limits are another early bottleneck.
- **How you would find out if something was registered incorrectly**: Store original file, OCR text, extracted JSON, validation checks, accounting response, and reviewer decisions in an audit table. Reconcile registered invoice totals and supplier codes against accounting exports, and alert on duplicates, manual corrections, and post-registration reversals.

## 8. What you would do with another 8 hours

1. Add persistence for review cases, original files, OCR text, extracted JSON, validation errors, and manual corrections.
2. Evaluate paid OCR/document AI for scanned and handwritten invoices, then compare it against PaddleOCR on the 12 samples using field-level accuracy, table accuracy, and review-rate reduction. I would especially test Google Document AI, Azure AI Document Intelligence, and AWS Textract.
3. Add production hardening: structured request IDs, redacted logs, retry/backoff policies, rate-limit handling, deployment scripts, and UI authentication.
