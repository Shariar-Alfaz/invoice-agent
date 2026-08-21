# Agent Notes

## Project Shape

- Backend: `src/backend`, FastAPI, clean-architecture layout.
- Frontend: `src/frontend`, Angular + PrimeNG + Tailwind.
- Sample invoices: `docs/invoices`.
- Python virtual environment: `src/backend/.venv`.
- Root `.env` is local-only and must not be committed.

## Skills

Read the relevant skill before making changes:

- Angular/frontend work: `skills/angular.md`
- Backend architecture and rule placement: `skills/architecture.md`
- Testing and validation subagent: `skills/test-validation-subagent.md`

## Common Commands

```powershell
cd E:\projects\invoice-agent
.\src\backend\.venv\Scripts\python.exe -m pytest -q
```

```powershell
cd E:\projects\invoice-agent
.\src\backend\.venv\Scripts\python.exe src\backend\run_server.py
```

```powershell
cd E:\projects\invoice-agent\src\frontend
npm run build
```

```powershell
cd E:\projects\invoice-agent\src\frontend
npm start
```

## Local Services

- Mock accounting API: `http://localhost:8080`
- Invoice Agent API: `http://127.0.0.1:8000`
- Review UI: `http://localhost:4200`
- Swagger is available only when `DEBUG=true`: `http://127.0.0.1:8000/docs`

## Verification

- For backend changes, run the relevant unit tests and preferably the full suite.
- For frontend changes, run `npm run build`.
- Existing known warning: frontend initial bundle exceeds the configured budget.
