# Submission

- Name: Shariar Alfaz
- Submission date (YYYY-MM-DD): 2026-08-21
- Hours actually spent: 8
- Repository / how to run it: run `.\src\backend\.venv\Scripts\python.exe src\backend\run_server.py` from the repository root. This starts both the mock accounting API on `http://localhost:8080` and the Invoice Agent API on `http://127.0.0.1:8000`. Swagger is available at `http://127.0.0.1:8000/docs` only when `DEBUG=true`, and intentionally exposes only the main invoice workflow plus health. In release mode, `DEBUG=false` disables Swagger, ReDoc, and OpenAPI JSON. The review UI runs from `src/frontend` with `npm start` at `http://localhost:4200`. The backend virtual environment is under `src/backend/.venv`.

## 1. Understanding the request

The client described a manual invoice entry problem: accounting staff read supplier invoices, type them into the accounting system, and risk overtime, duplicate payments, and data-entry mistakes. I treated the real problem as controlled accounting intake, not just OCR. The system should extract invoice data, check it deterministically, match the supplier against the accounting master, and let a reviewer submit only invoices that are safe enough to post.

I set out to build a working demo that covers the full path for the sample invoices: document text extraction, scanned-image OCR, LLM-based structured extraction, supplier matching, validation, human review, and registration into the supplied accounting API. The important product choice was to keep a human approval boundary for uncertain or corrected invoices. A false negative is safer than silently posting a wrong invoice.

## 2. What you would have asked the client

| What you wanted to ask | The assumption you made | Why |
|---|---|---|
| Should every invoice be posted automatically, or should low-confidence invoices require review? | Do not post automatically from the review UI. Extract every invoice into review first, then require reviewer approval before submitting to accounting. | The client mentioned a near duplicate-payment incident, so safety matters more than maximizing automation. |
| Who is allowed to approve corrected invoice data? | Any reviewer using this local demo can approve edits, but production would require authentication and audit history. | The assignment asks for a working demo, not user management. |
| What level of OCR/LLM confidence is acceptable for production posting? | Use configurable thresholds: `EXTRACTION_CONFIDENCE_THRESHOLD=0.85` and `OCR_CONFIDENCE_THRESHOLD=0.60`. | The assignment asks for explainable verification and the sample set contains both text PDFs and poor scans. |
| How should supplier names with OCR mistakes be matched? | Match by registration number first, then normalized name/alias, then only conservative unique fuzzy matching. | Supplier identity is accounting-critical and should not be guessed when ambiguous. |
| Can invoices contain negative adjustments such as discounts? | Yes. Line amounts can be negative, while quantity and unit price remain non-negative or null. | Japanese invoices often include discount rows, and the accounting API only requires integer line amounts. |
| How should users leave a review screen with unsubmitted work? | Show a confirmation before going back if extracted or manually edited work has not been submitted. | Preventing accidental loss of corrected data matters in a review workflow. |

## 3. Scoping decisions

**What you built**

I built a FastAPI application with a clean-architecture layout. It supports PDF text-layer extraction with PyMuPDF, scanned PDF/image OCR with PaddleOCR configured for Japanese, Gemini-based LLM extraction behind an interface, deterministic invoice validation, supplier matching, duplicate detection, and accounting API registration. A single root command starts both the supplied accounting API and the application API.

I also built an Angular + PrimeNG + PrimeUI review screen. The UI supports upload, document preview, OCR text review, partner master loading/retry, editable invoice header fields, editable line items, line add/delete, recalculation, negative discount amounts, a back button with confirmation for unsubmitted work, and a final approve-then-submit workflow. Validation messages are collected behind a floating issue button with severity color and issue count; clicking an issue opens a side drawer and can focus the relevant field, such as an invalid registration number.

The public backend workflow is `/api/invoices/process`. The review UI always calls it with `register=false` first, then posts the corrected payload through the backend only after the reviewer approves the edits and clicks submit. Submit is disabled while there are unresolved client errors, backend validation errors, warnings/review messages, or unapproved manual edits.

**What you left out, and why**

I did not build persistent storage, authentication, a batch queue, or deployment packaging. Those are important production pieces, but the highest-value 8-hour demo was extraction, deterministic verification, human review, and integration with the accounting API.

## 4. Design and technology choices

The flow is:

`upload -> OCR/text extraction -> LLM structured extraction -> deterministic validation -> supplier matching -> duplicate check -> accounting API registration or review`

I used FastAPI and Pydantic v2 for API/schema validation because they make a small typed service quick to build and easy to test. The domain layer contains invoice models, partner models, invoice validation, and partner matching. The application layer coordinates use cases through interfaces. The infrastructure layer contains OCR adapters, the LLM adapter, and the accounting API client.

For OCR, I used PyMuPDF first for text-layer PDFs because it is fast and accurate when embedded text exists. If a PDF has little usable text, pages are rendered to images and sent to PaddleOCR. JPG/JPEG/PNG files go directly to PaddleOCR. PaddleOCR is configured for Japanese so the demo can process scans without a paid OCR service.

For the LLM, I used the Gemini API free tier with `gemini-3.6-flash`, behind an `InvoiceExtractionService` abstraction. The extractor also tries configured fallback models and falls back to a low-confidence heuristic extraction when Gemini is unavailable, so the reviewer still gets something reviewable instead of a hard failure. The prompt asks only for strict JSON extraction; it is not asked to choose `partner_code` or decide whether to post.

The review UI uses Angular, PrimeNG, PrimeUI, and Tailwind. PrimeNG provides the accessible controls used for buttons, drawer, confirmation dialogs, messages, select controls, and tables. PrimeUI license handling is isolated in a generated ignored file so the app can build without committing the token.

The committed configuration template is `.env.example`. It documents the keys used by the demo without committing private secrets:

| Service | Why it is used | Configuration |
|---|---|---|
| Gemini API | Semantic extraction from OCR/text into structured invoice JSON | `LLM_PROVIDER=gemini`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` |
| PaddleOCR | Local Japanese OCR for scanned invoices | `OCR_LANGUAGE=japan` |
| PrimeNG / PrimeUI | Angular review UI controls and licensed PrimeUI integration | `PRIMEUI_LICENSE` |
| Mock accounting API | Required take-home accounting system | `ACCOUNTING_API_KEY=demo-key-1234` |

I intentionally do not commit the real Gemini API key or PrimeUI license token. Those belong in a local `.env` file, which is ignored by Git.

I decided against a database, queue, CQRS, Docker, and a paid OCR provider for this demo because they were less important than showing the accounting safety boundary clearly.

## 5. How you used AI, and how you checked it

**What you delegated to AI**

The LLM receives extracted Japanese invoice text and converts it into structured fields: supplier name, registration number, invoice number, dates, line items, tax codes, subtotal, tax, total, confidence, and warnings.

**How you verified the output**

I did not trust LLM totals, supplier identity, or posting decisions directly. The validator recalculates line math, subtotal, tax by accounting API rules, and total. It checks date order, JPY currency, supported tax codes, required line fields, and `quantity * unit_price == amount` where applicable. Supplier matching uses the accounting `/partners` API and resolves by registration number, normalized name, alias, or a conservative unique fuzzy match. Before registration, the app checks existing invoices for duplicate `partner_code + invoice_number`.

I also added targeted reconciliation for OCR/LLM table mistakes. For example, scanned discount rows can be negative, and invoice 12 needed the line amounts reconciled against a trusted subtotal/tax/total instead of treating the OCR column shift as truth. The reconciliation removes stale amount-mismatch errors only after the totals match accounting rules, and it adds a warning so the reviewer knows the numbers were adjusted.

The frontend repeats the same accounting math for reviewer edits. Recalculate follows the mock API rule: group subtotals by tax code and floor tax per group. Reviewers must approve corrected edits before submission; approval clears resolved issues and changes the local state to ready.

**A case where the AI got it wrong**

On scanned invoices, OCR/LLM output sometimes returned an empty `unit`, misread registration numbers, or shifted table amounts. The system does not silently post those results. Missing units and invalid registration numbers become focused review issues. Invoice 12 exposed a table extraction issue where subtotal/tax/total were trustworthy but one line amount was not; I added backend and frontend reconciliation and a unit test for that case.

## 6. Integrating with the accounting system

The accounting API is isolated behind an async `httpx` client. The base URL and API key come from settings, not hardcoded private secrets. The client supports `/health`, `/partners`, `/tax-codes`, `/invoices`, and `POST /invoices`. It preserves accounting API error codes and surfaces them in the processing result.

The app handles the accounting constraints before posting: dates are ISO formatted, amounts are integer JPY, tax codes are `T10`/`T08`, suppliers must resolve to known partner codes, lines must be present, and totals must match recalculated values. If the accounting API still rejects a payload, the invoice returns to review with the accounting error details.

| Invoice / case | Result | How you handled it |
|---|---|---|
| `invoice_02.pdf` | Registered as `P-1004 / OSK-26-0112` in local verification. | Text-layer PDF extracted with PyMuPDF, supplier matched by registration number, totals validated, then posted to `/invoices`. |
| `invoice_04.jpg` | Review until valid fields are approved, then registration is allowed. | Scanned image OCR uses PaddleOCR. If Gemini/OCR misses a unit or warning remains, submit stays blocked until approved. |
| `invoice_05.jpg` | Review when supplier text or line units are uncertain. | Supplier typo can resolve conservatively, but empty required line units remain review issues. |
| `invoice_12.jpg` | Reconciled after table amount mismatch. | Discount rows can be negative. Line amounts are reconciled against trusted subtotal/tax/total rules and covered by a unit test. |
| Duplicate invoice retry | Review/duplicate state. | Existing invoices are checked before POST, and `409 DUPLICATE_INVOICE` is still handled from the API. |

The Angular review UI uses the same backend workflow. It calls `/api/invoices/process?register=false` first, displays OCR and extraction confidence, validation issues, warnings, OCR text, editable fields, editable line items, and partner selection. No invoice is posted automatically from the UI; the accounting API is called only after review approval and an explicit submit action.

## 7. Cost, limits, and risk in production

- **Cost per invoice** (and what makes it up): OCR is local CPU cost using PaddleOCR in this demo. LLM cost is the Gemini extraction call; in this demo it uses a free-tier Gemini key, so direct API cost is $0 while within free-tier limits. In paid production, cost depends on token volume, selected model, and whether a paid OCR service is added for scanned or handwritten documents.
- **Monthly cost at 1,000 invoices per month**: With free-tier availability, direct API cost could remain near $0 for a small demo, but production should budget for paid LLM usage and compute. If handwriting or poor scans are common, I would also budget for paid OCR on scanned inputs. The real comparison is against month-end overtime and the cost of incorrect payments.
- **Processing time per invoice**: Text-layer PDFs are fast, typically seconds including the LLM call. Scanned images take longer because PaddleOCR runs local detection and recognition; after models are cached, a scan still takes several seconds locally.
- **Where this breaks first**: OCR quality and LLM extraction consistency break first, especially on scans, handwriting, rotated pages, dense tables, and ambiguous units. Free-tier LLM limits and lack of persistence are the next bottlenecks.
- **How you would find out if something was registered incorrectly**: Store original file, OCR text, extracted JSON, validation checks, reconciliation notes, reviewer approval, accounting response, and request IDs in an audit table. Reconcile registered invoice totals and supplier codes against accounting exports, and alert on duplicates, manual corrections, warnings cleared by reviewers, and post-registration reversals.

## 8. What you would do with another 8 hours

1. Add persistence for review cases, original files, OCR text, extracted JSON, validation errors, reviewer approvals, and accounting responses.
2. Add authenticated review roles and an audit log so approval is attributable and submit actions are traceable.
3. Evaluate paid OCR/document AI for scanned and handwritten invoices, then compare it against PaddleOCR on the 12 samples using field-level accuracy, table accuracy, and review-rate reduction.
