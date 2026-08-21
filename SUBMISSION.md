# Submission

- Name: Shariar Alfaz
- Submission date (YYYY-MM-DD): 2026-08-21
- Hours actually spent: 8
- Repository / how to run it: Git repository: `https://github.com/Shariar-Alfaz/invoice-agent`.

Windows Command Prompt setup from a fresh clone:

```cmd
git clone https://github.com/Shariar-Alfaz/invoice-agent.git
cd invoice-agent
python -m venv src\backend\.venv
src\backend\.venv\Scripts\python.exe -m pip install --upgrade pip
src\backend\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
notepad .env
```

Fill `LLM_API_KEY` and `PRIMEUI_LICENSE` in `.env`, then start both backend services:

```cmd
src\backend\.venv\Scripts\python.exe src\backend\run_server.py
```

This starts the mock accounting API on `http://localhost:8080` and the Invoice Agent API on `http://127.0.0.1:8000`. Swagger is available at `http://127.0.0.1:8000/docs` when `DEBUG=true`.

Start the UI in a second Command Prompt:

```cmd
cd src\frontend
npm install
npm start
```

Open `http://localhost:4200`.

PyCharm setup: open the repository root, add the interpreter at `src\backend\.venv\Scripts\python.exe`, then create a Python run configuration with script path `src\backend\run_server.py` and working directory set to the repository root. The app reads `.env` automatically from the repository root or `src/backend`. Use PyCharm's terminal to run the frontend commands above.

## 1. Understanding the request

The client is spending too much time entering invoice data by hand, and the bigger risk is that a typo or duplicate entry can turn into a payment mistake. I did not treat this as an OCR-only problem. The useful product is an intake flow that reads the invoice, checks the extracted data, matches the supplier against the accounting master, and gives a reviewer a controlled way to submit the invoice.

I built the demo around that review step. The UI does not post invoices automatically. It extracts the data first, shows the invoice and OCR text beside editable fields, highlights issues, and only submits to accounting after the reviewer approves the corrections and clicks submit. That is slower than full automation, but it is the right tradeoff for invoices with scans, OCR ambiguity, and duplicate-payment risk.

## 2. What you would have asked the client

| What you wanted to ask | The assumption you made | Why |
|---|---|---|
| Should the system ever submit invoices without a person reviewing them? | For this demo, no. The UI always starts in review mode and requires approval before submit. | The sample set includes scans and noisy extraction cases, and the client already had a near duplicate-payment incident. |
| Who is allowed to approve corrected invoice data? | Any local reviewer can approve in the demo. In production this should require login and an audit trail. | Access control is important, but outside the core 8-hour demo. |
| How strict should supplier matching be? | Prefer registration number, then normalized name or alias, then only a conservative unique fuzzy match. | A wrong supplier is worse than sending the invoice to review. |
| Can invoices include discounts or negative adjustments? | Yes. Line amounts may be negative, while quantity and unit price remain non-negative or blank. | Discount rows are common on invoices and the accounting API accepts integer amounts. |
| What should happen if a reviewer tries to leave with unsent work? | Show a confirmation before going back. | Losing corrected invoice work would be frustrating and risky. |
| What confidence level is enough? | Use configurable thresholds: `EXTRACTION_CONFIDENCE_THRESHOLD=0.85` and `OCR_CONFIDENCE_THRESHOLD=0.60`. | The thresholds should be adjustable after seeing real invoice quality. |

## 3. Scoping decisions

**What you built**

I built a FastAPI backend that handles the full intake flow: PDF text extraction, OCR for scanned files, LLM extraction, validation, supplier matching, duplicate checking, and accounting API registration. The backend is split into domain, application, infrastructure, and API layers so the accounting rules and matching logic are not tied to FastAPI route code.

I also built an Angular review UI with PrimeNG/PrimeUI. The reviewer can upload an invoice, see the source document, inspect OCR text, edit invoice fields and line items, reload partners, add or delete lines, recalculate totals, approve edits, and submit to accounting. Validation messages are shown through a floating issue button with a count badge. Clicking an issue opens a drawer and can focus the related field, such as an invalid registration number.

The main backend endpoint is `/api/invoices/process`. The UI calls it with `register=false` first. The corrected payload is submitted through the backend only after the reviewer approves the edits and clicks submit. Submit stays disabled while there are unresolved form errors, backend validation errors, warnings, or unapproved manual edits.

**What you left out, and why**

I did not add persistence, authentication, a batch queue, or deployment packaging. Those would be required before production, but they would not prove the most important parts of this assignment. I focused the time on extraction, verification, review, and the accounting API integration.

## 4. Design and technology choices

The flow is:

`upload -> OCR/text extraction -> LLM extraction -> validation -> supplier matching -> review -> accounting submission`

For the backend, I used FastAPI and Pydantic v2. They are quick to work with, strongly typed enough for this size of project, and easy to test. The domain layer contains invoice models, partner models, validation, and supplier matching. The infrastructure layer contains the OCR service, LLM adapter, and accounting API client.

For OCR, the app first tries PyMuPDF on text-layer PDFs. That is fast and avoids unnecessary OCR when the text is already embedded. Scanned PDFs and image files go through PaddleOCR configured for Japanese. I used local OCR for the demo to keep the project runnable without a paid OCR account. For production, I would benchmark **Azure AI Document Intelligence Prebuilt Invoice** first, with **Google Document AI Form Parser or Custom Extractor** as the Google-cloud alternative. Azure is invoice-specific and supports Japanese invoice extraction; Google is a good fit if the team wants to keep OCR and Gemini on the same cloud.

For LLM extraction, I used Gemini through a small `InvoiceExtractionService` abstraction. The configured model is `gemini-3.6-flash`, with fallback models available through environment variables. The LLM is asked to return strict structured JSON. It is not asked to choose the accounting `partner_code`, and it is not allowed to decide whether an invoice should be posted.

The review UI uses Angular, PrimeNG, PrimeUI, and Tailwind. PrimeNG was useful for accessible controls such as buttons, drawers, confirmation dialogs, messages, selects, and tables. PrimeUI license handling is kept in a generated file that is ignored by Git.

The committed `.env.example` documents the environment variables needed to run the demo:

| Service | Why it is used | Configuration |
|---|---|---|
| Gemini API | Structured extraction from OCR/text | `LLM_PROVIDER=gemini`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` |
| PaddleOCR | Local Japanese OCR for scanned invoices | `OCR_LANGUAGE=japan` |
| Azure AI Document Intelligence Prebuilt Invoice | First production OCR/document extraction candidate | Production replacement for local PaddleOCR |
| Google Document AI Form Parser / Custom Extractor | Google-cloud OCR/document extraction alternative | Production replacement for local PaddleOCR |
| PrimeNG / PrimeUI | Review UI controls and licensed PrimeUI integration | `PRIMEUI_LICENSE` |
| Mock accounting API | Required assignment API | `ACCOUNTING_API_KEY=demo-key-1234` |

For evaluator setup, copy `.env.example` to `.env` and fill in the Gemini API key and PrimeUI license token. If actual temporary demo credentials are required, I would provide them through the private submission channel rather than public repository history.

## 5. How you used AI, and how you checked it

**What you delegated to AI**

The LLM receives the extracted Japanese invoice text and returns structured invoice fields: supplier name, registration number, invoice number, dates, line items, tax codes, subtotal, tax, total, confidence, and warnings.

**How you verified the output**

I did not trust the LLM's totals or supplier choice. The app recalculates line totals, subtotal, tax by tax code, and final total using the same rules as the accounting API. It also checks date order, JPY currency, required line fields, supported tax codes, and duplicate `partner_code + invoice_number`.

Supplier matching is checked against `/partners` from the accounting API. The safest match is the registration number. If that is missing or noisy, the matcher uses normalized supplier names and aliases, then a conservative fuzzy match only when the result is unique.

I also added a reconciliation step for OCR table mistakes. Invoice 12 exposed this clearly: the subtotal, tax, and total were internally consistent, but one line amount had been shifted by extraction. The backend and frontend now handle discount rows as negative amounts and can reconcile a single bad line against a trusted subtotal/tax/total. When that happens, the system adds a warning instead of pretending nothing changed.

**A case where the AI got it wrong**

On scanned invoices, extraction sometimes missed a line unit, misread a registration number, or shifted table amounts. Those cases do not go straight to accounting. Missing units and invalid registration numbers become review issues, and clicking the issue focuses the related field. The invoice 12 amount problem is covered by a unit test so the same class of error is less likely to come back unnoticed.

## 6. Integrating with the accounting system

The accounting API is wrapped in an async `httpx` client. The base URL and API key come from settings. The client calls `/health`, `/partners`, `/tax-codes`, `/invoices`, and `POST /invoices`, and it preserves the API's error codes in the processing result.

Before submitting, the app shapes the payload to match the API: dates are `YYYY-MM-DD`, amounts are integer JPY, tax codes are `T10` or `T08`, suppliers must resolve to a known `partner_code`, and line totals must match the recalculated subtotal, tax, and total. If the accounting API still rejects the invoice, the response is shown to the reviewer instead of hiding the failure.

| Invoice / case | Result | How you handled it |
|---|---|---|
| `invoice_02.pdf` | Registered as `P-1004 / OSK-26-0112` in local verification. | Text-layer PDF extraction worked well. Supplier and totals passed validation before submission. |
| `invoice_04.jpg` | Requires review until fields are valid and approved. | Scanned image OCR can miss units, so submit stays blocked until the reviewer resolves issues. |
| `invoice_05.jpg` | Review when supplier text or line units are uncertain. | Supplier typo can resolve conservatively, but missing required line units remain review issues. |
| `invoice_12.jpg` | Reconciled after an amount mismatch. | Discount rows can be negative. A bad line amount can be reconciled against trusted subtotal/tax/total rules. |
| Duplicate invoice retry | Review/duplicate state. | Existing invoices are checked before submission, and `409 DUPLICATE_INVOICE` is still handled from the API. |

## 7. Cost, limits, and risk in production

- **Cost per invoice** (and what makes it up): For production, I would budget for a document extraction service plus an LLM. I assume one invoice is one page, and each LLM call uses about 5,000 input tokens and 1,000 output tokens. Azure AI Document Intelligence Prebuilt Invoice is roughly `$9.50` per 1,000 pages at current listed pricing, or `$0.0095` per invoice. Google Document AI Form Parser or Custom Extractor is about `$30` per 1,000 pages, or `$0.030` per invoice. The LLM cost would be about `$0.00325` with OpenAI GPT-5 mini, `$0.01625` with OpenAI GPT-5, about `$0.0075` with Gemini 3.6 Flash introductory pricing, or about `$0.022` with Gemini 3.1 Pro Preview. My first production estimate would be Azure Document Intelligence plus GPT-5 mini, about `$0.01275` per one-page invoice before hosting, storage, and reviewer labor.
- **Monthly cost at 1,000 invoices per month**: Azure Document Intelligence plus OpenAI GPT-5 mini would be about `$12.75/month`: `$9.50` for document extraction and `$3.25` for the LLM. Azure plus OpenAI GPT-5 would be about `$25.75/month`. Google Document AI plus GPT-5 mini would be about `$33.25/month`. Google Document AI plus Gemini 3.6 Flash would be about `$37.50/month` through December 31, 2026, and about `$45.00/month` from January 1, 2027. Google Document AI plus Gemini 3.1 Pro Preview would be about `$52.00/month`. I would start production evaluation with Azure Document Intelligence plus GPT-5 mini, then use a stronger LLM only for low-confidence or disputed invoices if accuracy requires it. Raw OCR alone can be much cheaper, but I would not rely on raw OCR alone for messy invoice tables.
- **Processing time per invoice**: Text-layer PDFs should finish in a few seconds including the LLM call. Scanned images are slower because OCR has to detect and recognize text from pixels; locally that can take several seconds per invoice after models are cached.
- **Where this breaks first**: The first weak point is document quality: low-resolution scans, handwriting, rotated pages, and dense tables. The next issues are rate limits, missing persistence, and lack of reviewer audit history.
- **How you would find out if something was registered incorrectly**: Store the original file, OCR text, extracted JSON, validation results, reconciliation notes, reviewer approval, accounting response, and request IDs. Then reconcile registered invoices against accounting exports and alert on duplicates, manual corrections, cleared warnings, and post-registration reversals.

## 8. What you would do with another 8 hours

1. Add persistence for review cases, original files, OCR text, extracted JSON, validation errors, reviewer approvals, and accounting responses.
2. Add authenticated reviewer roles and an audit log so approval and submit actions are traceable.
3. Compare PaddleOCR with Azure AI Document Intelligence Prebuilt Invoice and Google Document AI Form Parser / Custom Extractor on the 12 sample invoices, measuring field accuracy, table accuracy, and how often a reviewer still has to fix the output.
