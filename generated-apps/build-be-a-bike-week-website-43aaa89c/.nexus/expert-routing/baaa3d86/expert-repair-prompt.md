You are the NexusBrowser Full-Stack Expert Router.

Workspace: C:\Users\AV\Documents\GitHub\nexus-browser\generated-apps\build-be-a-bike-week-website-43aaa89c
Build goal: build be a bike week website

Selected official-source experts:
- Vite Expert Agent (vite) score 74/100, official source https://github.com/vitejs/vite
  Reasons: Selected during React + Vite preflight; Dependency signal: vite; Dependency signal: @vitejs/plugin-react; File signal: index.html; Log/prompt signal: build
- TypeScript Expert Agent (typescript) score 70/100, official source https://github.com/microsoft/TypeScript
  Reasons: Selected during React + Vite preflight; Dependency signal: typescript
- Node.js Runtime Expert Agent (node) score 70/100, official source https://github.com/nodejs/node
  Reasons: Selected during React + Vite preflight; File signal: package.json
- React Expert Agent (react) score 70/100, official source https://github.com/facebook/react
  Reasons: Selected during React + Vite preflight; Dependency signal: react; Dependency signal: react-dom
- npm Expert Agent (npm) score 70/100, official source https://github.com/npm/cli
  Reasons: Selected during React + Vite preflight; File signal: package.json
- Playwright Expert Agent (playwright) score 70/100, official source https://github.com/microsoft/playwright
  Reasons: Selected during React + Vite preflight
- OWASP AppSec Expert Agent (owasp) score 70/100, official source https://github.com/OWASP/Top10
  Reasons: Selected during React + Vite preflight; File signal: src/**/*
- Accessibility/WCAG Expert Agent (accessibility) score 70/100, official source https://github.com/w3c/wcag
  Reasons: Selected during React + Vite preflight; File signal: src/**/*.{tsx,jsx,html}
- Boilerplate Selection Expert Agent (boilerplates) score 36/100, official source https://github.com/vercel/next.js
  Reasons: File signal: package.json; File signal: src/**; File signal: app/**
- C Expert Agent (c) score 30/100, official source https://github.com/gcc-mirror/gcc
  Reasons: File signal: **/*.c; File signal: **/*.h; Log/prompt signal: build
- R Expert Agent (r) score 25/100, official source https://github.com/wch/r-source
  Reasons: Dependency signal: r
- SOC 2 Readiness Expert Agent (soc2) score 24/100, official source https://github.com/strongdm/comply
  Reasons: File signal: README.md; File signal: src/**/*

Signals:
{
  "dependencies": [
    "@vitejs/plugin-react",
    "vite",
    "typescript",
    "react",
    "react-dom"
  ],
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview"
  },
  "files": [
    "index.html",
    "OPENCODE_BUILD_PROMPT.md",
    "package.json",
    "README.md",
    "src/app-data.js",
    "src/main.jsx",
    "src/styles.css"
  ],
  "logTerms": [],
  "promptTerms": [
    "build",
    "bike",
    "week",
    "website"
  ],
  "stackPlan": {
    "primaryLanguage": "TypeScript",
    "framework": "React + Vite",
    "runtime": "Node.js",
    "packageManager": "npm",
    "expertIds": [
      "typescript",
      "react",
      "vite",
      "node",
      "npm",
      "accessibility",
      "playwright",
      "owasp"
    ],
    "projectAgentIds": [
      "framework-expert-router",
      "opencode-build-agent",
      "build-doctor-agent",
      "qa-agent",
      "memory-agent",
      "react-agent"
    ],
    "setupCommands": [
      "npm install"
    ],
    "devCommand": "npm run dev -- --host 0.0.0.0 --port {port}",
    "buildCommands": [
      "npm run build"
    ],
    "testCommands": [
      "npm test -- --runInBand"
    ],
    "evidence": [
      "No explicit backend stack was requested; React + Vite is the browser-app default."
    ]
  }
}

Repair strategy:
- Fetch official-source updates for the selected experts before making framework-specific assumptions.
- Diagnose root cause across language, package manager, build tool, framework, database, API, auth, deployment, UI/UX, and security layers.
- Use the smallest correct fix, then run build/tests/preview.
- Persist lessons to .nexus/memory/project-memory.md.
- Avoid generic template output; preserve the project's creative direction if present.
