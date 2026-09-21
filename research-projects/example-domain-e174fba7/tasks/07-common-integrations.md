# Common Integrations

Goal: Add selected production integrations: GitHub, Stripe, auth, database providers, email, storage, AI, analytics, deployment, commerce, and monitoring.

Context:
- Target: https://example.com/
- Endpoints: 0
- UI components: 5
- Inferred models: 0

Required outputs:
- integrations/
- .env.example
- src/integrations/

Rules:
- Read project-brain.json before editing.
- Use generated artifacts as references, not as unreviewed final code.
- Keep secrets in environment variables.
- Add tests or examples for every generated SDK function or user flow.
