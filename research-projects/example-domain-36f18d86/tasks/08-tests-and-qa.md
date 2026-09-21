# Tests And QA

Goal: Generate Playwright smoke tests, API tests, visual comparison tasks, and agent repair loops.

Context:
- Target: https://example.com/
- Endpoints: 0
- UI components: 5
- Inferred models: 0

Required outputs:
- tests/
- playwright.config.ts
- qa-report.md

Rules:
- Read project-brain.json before editing.
- Use generated artifacts as references, not as unreviewed final code.
- Keep secrets in environment variables.
- Add tests or examples for every generated SDK function or user flow.
