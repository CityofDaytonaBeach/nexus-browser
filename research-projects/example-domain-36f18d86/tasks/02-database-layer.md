# Database Layer

Goal: Create local SQLite schema, ORM models, and seed data from discovered API response samples.

Context:
- Target: https://example.com/
- Endpoints: 0
- UI components: 5
- Inferred models: 0

Required outputs:
- database/schema.sql
- database/schema.prisma
- database/seed.json

Rules:
- Read project-brain.json before editing.
- Use generated artifacts as references, not as unreviewed final code.
- Keep secrets in environment variables.
- Add tests or examples for every generated SDK function or user flow.
