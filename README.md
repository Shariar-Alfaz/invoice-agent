# Invoice Agent

Small FastAPI application for Japanese invoice intake. It extracts document text, sends the text to a configurable LLM for semantic invoice extraction, validates the result deterministically, matches the supplier against the mock accounting API, checks duplicates, and only registers invoices that pass all safeguards.

## Architecture

The project uses a pragmatic clean architecture layout:

- `src/backend/app/main.py`: the FastAPI entrypoint, exposed as `app.main:app`.
- `src/backend/app/domain`: Pydantic domain models, deterministic invoice validation, supplier matching.
- `src/backend/app/application`: use cases and protocol interfaces.
- `src/backend/app/infrastructure`: PyMuPDF/PaddleOCR OCR, LLM adapter, accounting API client.
- `src/backend/app/api`: FastAPI dependencies and routes.
- `src/backend/run_server.py`: local launcher that starts both backend services.
- `src/backend/accounting_api.py`: the supplied mock accounting API, copied unchanged in behavior from `docs/TAKE_HOME.md`.
- `src/frontend`: Angular + PrimeNG + PrimeUI + Tailwind review screen for correcting extracted invoices before accounting submission.

The route layer is intentionally thin. OCR, LLM extraction, supplier matching, validation, duplicate detection, and accounting registration are composed in the use cases.

## Prerequisites

- Python 3.11+ for the Invoice Agent app
- Python 3.9+ is enough for the supplied `src/backend/accounting_api.py` mock by itself
- The project virtual environment, or a new venv with `requirements.txt`
- PaddleOCR and PaddlePaddle for scanned PDFs/images
- A Gemini API key, or another configured LLM provider
- Node.js/npm for the optional review UI

## Installation

```powershell
cd E:\projects\invoice-agent
.\src\backend\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If PaddleOCR installation is too heavy for a quick local review, the API still starts and text-layer PDFs can be detected with PyMuPDF, but scanned documents will return a clear OCR configuration error.

## Environment

Copy `.env.example` to `.env` and fill in the LLM settings:

```env
ACCOUNTING_API_URL=http://localhost:8080
ACCOUNTING_API_KEY=demo-key-1234
DEBUG=true
API_PORT=8000
FRONTEND_API_BASE_URL=http://127.0.0.1:8000
PRIMEUI_LICENSE=

LLM_PROVIDER=gemini
LLM_API_KEY=
LLM_MODEL=gemini-3.6-flash
LLM_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.7-flash
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta

OCR_LANGUAGE=japan
EXTRACTION_CONFIDENCE_THRESHOLD=0.85
OCR_CONFIDENCE_THRESHOLD=0.60
MAX_UPLOAD_MB=15
```

Do not commit `.env`.

`DEBUG=true` enables Swagger, ReDoc, and `/openapi.json` for local development. In release mode, set `DEBUG=false` or omit it; the app disables `/docs`, `/redoc`, `/openapi.json`, and `/swagger`.

`PRIMEUI_LICENSE` is read by the Angular app during `npm start` and `npm run build`. The value is written to an ignored generated file at `src/frontend/src/environments/primeui-license.generated.ts`.

## Submitted Configuration And Keys

No private API keys or license tokens are committed to this repository. The assignment demo uses the following services and configuration names:

| Service | Purpose | Config key |
|---|---|---|
| Mock accounting API | Required assignment integration | `ACCOUNTING_API_KEY=demo-key-1234` |
| Gemini API | LLM invoice extraction | `LLM_PROVIDER=gemini`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` |
| PaddleOCR | Local Japanese OCR for scanned images/PDFs | `OCR_LANGUAGE=japan` |
| PrimeNG / PrimeUI | Angular review UI components and license handling | `PRIMEUI_LICENSE` |

Use `.env.example` as the committed template and place real local secrets in `.env`, which is ignored by Git.

## Start Both APIs

Single command:

```powershell
cd E:\projects\invoice-agent
.\src\backend\.venv\Scripts\python.exe src\backend\run_server.py
```

This starts:

- Mock accounting API: `http://localhost:8080`
- Invoice Agent API: `http://127.0.0.1:8000`

## Start the Accounting API Only

In one terminal:

```powershell
cd E:\projects\invoice-agent
.\src\backend\.venv\Scripts\python.exe src\backend\accounting_api.py
```

Check it:

```powershell
Invoke-RestMethod http://localhost:8080/health
```

Swagger UI in debug mode:

```text
http://127.0.0.1:8000/docs
```

Swagger is available only when `DEBUG=true`. It intentionally shows only the single full invoice workflow endpoint, `/api/invoices/process`, plus `/health`.

## Start the Review UI

In another terminal:

```powershell
cd E:\projects\invoice-agent\src\frontend
npm install
npm start
```

Open:

```text
http://localhost:4200
```

The UI calls `/api/invoices/process?register=false` first, shows OCR/LLM confidence, validation issues, editable invoice fields, editable line items, and then posts the reviewed payload to the accounting API through the backend.

PyCharm FastAPI configuration:

- App type: FastAPI
- Application file/module: `E:\projects\invoice-agent\src\backend\app\main.py`
- App name: `app`
- Working directory: `E:\projects\invoice-agent\src\backend`
- Python interpreter: `E:\projects\invoice-agent\src\backend\.venv\Scripts\python.exe`
- Additional uvicorn parameters: `--host 127.0.0.1 --port 8000`

Equivalent module command:

```powershell
cd E:\projects\invoice-agent\src\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If PyCharm uses `E:\projects\invoice-agent\src` as the working directory, use this module path instead:

```powershell
cd E:\projects\invoice-agent\src
.\backend\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

## API Examples

Health:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Process and register if every safeguard passes, the default:

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/invoices/process" `
  -F "file=@E:\projects\invoice-agent\docs\invoices\invoice_01.pdf"
```

Process as dry-run:

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/invoices/process?register=false" `
  -F "file=@E:\projects\invoice-agent\docs\invoices\invoice_01.pdf"
```

## Validation And Review Strategy

The LLM is allowed to extract semantics only. It does not choose `partner_code` and it does not decide whether an invoice is safe to register.

The deterministic validator checks:

- date order
- JPY currency
- line presence and supported tax codes
- `quantity * unit_price == amount` when both values exist
- subtotal equals the sum of line amounts
- tax follows the accounting API rule: group by `T10` and `T08`, floor tax per group
- total equals subtotal plus recalculated tax

The process returns `review` instead of registering when confidence is low, supplier matching is unresolved or ambiguous, a duplicate exists, validation fails, or the accounting API rejects the payload.

## Assumptions

- The accounting API base URL and key are environment-specific settings.
- LLM extraction uses Gemini by default in this local setup.
- Supplier matching is conservative: registration number, exact normalized name, then exact normalized alias.
- Automatic registration is attempted by `/api/invoices/process` when validation passes.
- Dry-run is available with `register=false`.

## Known Limitations

- The review screen is included, but review records are not persisted.
- No persistent review queue or database is included.
- PaddleOCR is lazy-loaded and must be installed for scanned PDFs/images.
- LLM extraction requires real environment configuration; no API key is committed.
- The current fuzzy supplier matching intentionally stops before risky automatic matches.

## Production Improvements

- Add persistent storage for review states, original files, OCR text, and audit history.
- Add an authenticated review queue with persisted reviewer decisions and audit history.
- Add observability with request IDs, metrics, and redacted structured logs.
- Add retry/backoff policies for external API failures.
- Add model evaluation fixtures for known invoices and regression scoring.

## Tests

```powershell
.\src\backend\.venv\Scripts\python.exe -m pytest -q
```
