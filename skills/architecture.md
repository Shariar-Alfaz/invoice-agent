# Architecture Skill

Use this skill for backend design, cross-layer changes, and rule placement.

## Boundaries

- Preserve clean architecture boundaries: domain, application, infrastructure, and API layers.
- Put deterministic accounting rules in domain services, not route handlers or UI-only logic.
- Keep FastAPI routes thin in `src/backend/app/api`.
- Keep orchestration in `src/backend/app/application/use_cases`.
- Keep external systems behind interfaces/adapters such as the accounting gateway and LLM/OCR services.

## Invoice Rules

- LLM output must be validated deterministically before registration.
- Do not let the LLM choose `partner_code`; supplier matching is deterministic.
- Use application use cases to compose OCR, LLM extraction, validation, supplier matching, duplicate checks, and registration.
- Treat frontend validation as reviewer guidance; backend validation remains authoritative.
- Discount and adjustment lines can be negative and must stay valid.

## Change Guidance

- Add narrow regression tests when changing extraction, reconciliation, validation, or supplier matching behavior.
- Avoid broad refactors unless they directly reduce risk or support the requested change.
