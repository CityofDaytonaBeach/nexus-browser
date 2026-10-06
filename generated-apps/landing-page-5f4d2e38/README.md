# Daytona Bike Week Landing Page

React + Vite landing page for a Daytona Bike Week-style rally experience. It includes a high-impact event hero, rally schedule, pass tiers, and a local-only ride alert signup interaction.

Prompt:
build bike week landing page

Planned stack: React + Vite (TypeScript)

Setup:

```bash
npm install
```

Run locally:

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

Build:

```bash
npm run build
```

Test the Nexus product contract:

```bash
npm test -- --runInBand
```

QA checklist:

- Desktop: hero CTAs navigate to schedule/register sections, schedule cards and pass cards are readable above the fold progression.
- Mobile: header wraps cleanly, hero/card sections stack, schedule cards do not overflow.
- Accessibility: links, inputs, select, and submit button have accessible names and visible focus states.
- Runtime: no external APIs, no payments, no production data writes; registration state is local to the page.
- Production: `npm run build` completes TypeScript and Vite checks.
