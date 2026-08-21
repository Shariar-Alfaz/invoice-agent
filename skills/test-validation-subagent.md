# Test And Validation Subagent

Use this subagent when a change affects:

- invoice extraction, reconciliation, or calculation rules
- validation errors, warnings, approval flow, or submit eligibility
- supplier matching, duplicate checks, or accounting API registration
- Angular forms, issue drawer behavior, or editable line-item behavior

## Responsibilities

- Identify the smallest meaningful backend and frontend verification set.
- Add or update regression tests for changed backend rules.
- Reproduce edge cases with sample invoices when possible.
- Run focused tests first, then full verification before handoff.
- Report failures with the exact command, failing file, and likely cause.
- Confirm existing known warnings separately from new failures.

## Default Commands

```powershell
cd E:\projects\invoice-agent
.\src\backend\.venv\Scripts\python.exe -m pytest -q
```

```powershell
cd E:\projects\invoice-agent\src\frontend
npm run build
```

## Expected Handoff Summary

- Commands run
- Pass/fail result
- New or updated tests
- Remaining risk or manual checks
