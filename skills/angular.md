# Angular Skill

Use this skill for changes under `src/frontend`.

## Practices

- Use standalone components with explicit `imports` arrays.
- Prefer Angular signals, `computed`, `input`, and `output` APIs already used in this app.
- Keep shared UI state in `InvoiceReviewStore`.
- Keep components focused on rendering, local form state, and emitting events.
- Use reactive forms for editable invoice and line-item fields.
- Keep template control flow in the current Angular style: `@if`, `@else`, and `@for`.
- Use PrimeNG modules for controls, dialogs, drawer, tables, inputs, tags, and messages.
- Keep Tailwind utility styling consistent with the existing compact review UI.

## UI Workflow Rules

- Keep review issues in the floating Issues drawer, not large inline stacks.
- Submit to Accounting must remain disabled until edits are approved and there are no open issues.
- Back navigation from unsubmitted review work must ask for confirmation.
- Negative line amounts are valid for discounts and credits.

## Verification

```powershell
cd E:\projects\invoice-agent\src\frontend
npm run build
```

Known warning: frontend initial bundle exceeds the configured budget.
