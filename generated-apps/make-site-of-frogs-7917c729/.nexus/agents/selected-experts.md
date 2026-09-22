# Nexus Build Agent Team

## Stack
- Language: TypeScript
- Framework: React + Vite
- Runtime: Node.js
- Package manager: npm

## Setup And Verification
- `npm install`
- `npm run build`
- `npm test -- --runInBand`

## Orchestrating Agents
### OpenCode Build Agent (opencode-build-agent)
Execute the build plan, edit files, run commands, fix failures, and stream progress.

Expected outputs: src/**, tests/**, build-log.md.

### Build Doctor Agent (build-doctor-agent)
Diagnose the entire generated app lifecycle: workspace shape, package scripts, dependencies, env vars, APIs, database setup, build output, preview logs, tests, and deployment readiness.

Expected outputs: .nexus/doctor/doctor-report.json, .nexus/doctor/repair-plan.md.

### Full-Stack Expert Router (framework-expert-router)
Routes build failures to official-source expert agents for languages, runtimes, frontend frameworks, backend frameworks, databases, ORMs, package managers, build tools, test tools, DevOps, cloud deploys, APIs, auth, payments, mobile, AI SDKs, and observability based on files, logs, dependencies, and error signatures.

Expected outputs: expert-routing-report.json.

### React Agent (react-agent)
Create React pages, hooks, providers, routing, state, loading/error states, and UI/API wiring.

Expected outputs: src/components, src/hooks, src/app.

### QA Agent (qa-agent)
Run browser QA, visual comparison, flow replay, accessibility checks, API tests, and repair tasks.

Expected outputs: qa-report.md, repair-tasks.md.

### Memory And Skills Agent (memory-agent)
Persist project knowledge, summarize sessions, create reusable skills, and retrieve previous decisions.

Expected outputs: memory/project.md, skills/*.md.

## Stack Experts
### TypeScript Expert Agent (typescript)
Official source: https://github.com/microsoft/TypeScript

Checks:
- tsconfig validity
- strict-mode errors
- module resolution
- JSX config
- missing @types packages

Skills:
- fix compiler options
- add missing types
- repair imports/exports
- align framework type settings

### Node.js Runtime Expert Agent (node)
Official source: https://github.com/nodejs/node

Checks:
- engine mismatch
- ESM/CJS mismatch
- script failures
- env handling

Skills:
- fix scripts
- align module type
- repair server startup
- add env validation

### React Expert Agent (react)
Official source: https://github.com/facebook/react

Checks:
- invalid hooks
- root render
- hydration risks
- accessibility

Skills:
- fix render errors
- repair component boundaries
- wire loading/error states

### npm Expert Agent (npm)
Official source: https://github.com/npm/cli

Checks:
- lockfile state
- scripts
- dependency ranges
- install failures

Skills:
- fix package scripts
- repair lock/deps
- stabilize npm install

### Vite Expert Agent (vite)
Official source: https://github.com/vitejs/vite

Checks:
- dev script
- build script
- entry module
- plugin config
- env naming

Skills:
- fix Vite config
- repair index.html entry
- resolve transform errors

### Playwright Expert Agent (playwright)
Official source: https://github.com/microsoft/playwright

Checks:
- browser install
- selectors
- timeouts
- visual tests

Skills:
- fix Playwright config
- repair tests
- add stable locators

### OWASP AppSec Expert Agent (owasp)
Official source: https://github.com/OWASP/Top10

Checks:
- injection
- auth failures
- secrets exposure
- XSS
- SSRF

Skills:
- add validation
- repair auth boundaries
- harden headers
- redact secrets

### Accessibility/WCAG Expert Agent (accessibility)
Official source: https://github.com/w3c/wcag

Checks:
- semantic HTML
- keyboard flow
- contrast
- ARIA correctness
- screen-reader labels

Skills:
- fix semantic markup
- repair ARIA usage
- add keyboard states
- add accessibility tests
