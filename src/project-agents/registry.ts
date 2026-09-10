export interface ProjectAgentSpec {
  id: string;
  name: string;
  role: string;
  mode: 'research' | 'plan' | 'build' | 'review' | 'operate';
  runtime?: 'nexus' | 'nexus-native';
  modelRouting: string[];
  tools: string[];
  memory: string[];
  skills: string[];
  outputs: string[];
  prompt: string;
}

export interface AgentSwarmPlan {
  philosophy: string;
  nativeAgentRuntime: NexusNativeAgentIntegration;
  sharedKnowledge: string[];
  agents: ProjectAgentSpec[];
  workflows: Array<{ name: string; trigger: string; agents: string[]; output: string }>;
}

export interface NexusNativeAgentIntegration {
  storage: string;
  apiBase: string;
  commands: {
    state: string;
    memory: string;
    skills: string;
    delegations: string;
    jobs: string;
  };
  capabilities: string[];
}

const NEXUS_NATIVE_AGENT_RUNTIME: NexusNativeAgentIntegration = {
  storage: '.nexus/agent-runtime/state.json',
  apiBase: '/api/agent-runtime',
  commands: {
    state: 'GET /api/agent-runtime',
    memory: 'POST /api/agent-runtime/memory and GET /api/agent-runtime/memory/search?q=',
    skills: 'POST /api/agent-runtime/skills',
    delegations: 'POST /api/agent-runtime/delegations',
    jobs: 'POST /api/agent-runtime/jobs and DELETE /api/agent-runtime/jobs/:id',
  },
  capabilities: [
    'persistent memory and session search',
    'self-improving Nexus coding skills',
    'chat-triggered specialist agent delegation',
    'recurring autonomous build, QA, research, and memory jobs',
    'browser-first evidence loop using DOM, styles, console, network, screenshots, and backend observations',
    'OpenCode build/update handoff with runtime memory and matching skills',
    'MCP, API, integration, QA, and release tooling plans',
  ],
};

const SHARED_ADVANCED_KNOWLEDGE = [
  'NexusBrowser advantage: treat the browser as the development brain, not just a preview. Use live pages, screenshots, DOM, computed styles, console logs, network traffic, storage, cookies, API discovery, accessibility signals, and visual QA as evidence for every coding decision.',
  'Backend Observer advantage: infer hidden functionality from package scripts, dependencies, server files, API routes, data models, env keys, logs, request/response shapes, auth/session flows, webhooks, and background jobs so the duplicated app works like the original, not just looks like it.',
  'Developer employee model: package expert agents as hireable/schedulable dev employees with clear jobs, triggers, integrations, outputs, run history, cost/risk controls, and human approval gates for risky actions.',
  'Senior software engineering: requirements analysis, architecture tradeoffs, code review, refactoring, debugging, testing strategy, observability, maintainability, and delivery planning.',
  'Full-stack web: TypeScript, JavaScript, React, Next.js, Vite, Node.js, Express, REST, GraphQL, WebSockets, auth, payments, email, storage, background jobs, caching, and API design.',
  'System engineering: operating systems, shells, filesystems, networking, DNS, HTTP/TLS, reverse proxies, containers, CI/CD, cloud deployment, secrets, logs, metrics, tracing, backups, and incident response.',
  'Data engineering: SQL, schema design, migrations, indexes, transactions, SQLite, Postgres, Prisma, Drizzle, Redis-style caching, search, analytics, seed data, and local-first sync patterns.',
  'Frontend craft: accessibility, semantic HTML, responsive layouts, component systems, state machines, forms, validation, loading/empty/error states, performance, browser APIs, and progressive enhancement.',
  'Real rendering and device QA: verify apps as real websites across desktop, tablet, mobile touch emulation, kiosk/fullscreen, app-store screenshot sizes, game/canvas viewports, reduced-motion, offline/slow-network, and authenticated states.',
  'Graphic and product design: hierarchy, typography, color theory, spacing, grids, contrast, brand systems, iconography, motion, composition, information architecture, usability, and non-template visual direction.',
  'Security and privacy: OWASP risks, input validation, auth/session safety, least privilege, dependency risk, env handling, secret redaction, safe tool execution, and user-approval boundaries.',
  'Quality loops: run focused tests, build verification, browser QA, visual regression checks, accessibility checks, performance checks, and root-cause repair instead of cosmetic fixes.',
];

const SHARED_AGENT_RULES = [
  'Think like a professional developer: inspect evidence before conclusions, name tradeoffs, and prefer the smallest complete fix.',
  'Default to a browser-first workflow: open the target or preview, inspect DOM/styles/network/console, identify the user-visible problem, then edit code and verify in the browser.',
  'Use current project files, logs, package scripts, browser evidence, and user intent as the source of truth.',
  'Use DevTools-style reasoning: map visible UI to components, map network calls to APIs/data models, map console errors to code fixes, and map visual differences to CSS/layout changes.',
  'Use backend-observer reasoning: map rendered behavior to server routes, dependencies, database schemas, env requirements, auth/payment/email/storage integrations, and deployment/runtime constraints.',
  'Always ask what the real browser reveals that chat-only coding would miss: layout overflow, broken routing, missing assets, runtime errors, failed requests, cookies/storage state, touch behavior, viewport breakpoints, and kiosk constraints.',
  'When the user wants autonomy, propose a developer-employee workflow: choose agents, connect tools, set trigger/schedule, define deliverables, run safely, report results, and persist lessons.',
  'When building UI, avoid generic AI-template layouts; create a product-specific visual system with real responsive and accessibility states.',
  'When diagnosing failures, classify the layer first: requirements, package manager, language/compiler, framework, runtime, API, database, auth, browser, deployment, or design.',
  'Do not invent credentials, APIs, files, or successful test results. Redact secrets and ask for permission before destructive or external-risk actions.',
  'Persist durable decisions, successful repairs, failed repairs, environment assumptions, and user preferences into project memory.',
  'Use the Nexus Native Agent Runtime when the user asks for persistent memory, self-improving skills, recurring work, vibe coding autonomy, or parallel specialist delegation.',
];

export function getProjectAgentSwarm(): AgentSwarmPlan {
  const agents: ProjectAgentSpec[] = [
    agent('research-agent', 'Research Agent', 'Find websites, docs, repos, examples, APIs, competitors, and implementation references.', 'research', ['large-context', 'web-research', 'cheap-fast'], ['browser.search', 'browser.open', 'browser.crawl', 'web.fetch'], ['sources', 'decisions', 'open questions'], ['source-ranking', 'fact-checking', 'citation-notes'], ['research-notes.md', 'sources.json']),
    agent('browser-ui-agent', 'Browser UI Agent', 'Inspect live pages and convert visual structure into UI components, Tailwind tokens, and build overlays.', 'research', ['vision', 'ui-reasoning'], ['browser.screenshot', 'browser.dom', 'browser.computedStyles', 'ui-intelligence'], ['design tokens', 'component patterns'], ['component-classification', 'responsive-analysis'], ['ui-report.json', 'components/*.tsx']),
    agent('api-agent', 'API Agent', 'Discover endpoints, auth requirements, response samples, SDK methods, and OpenAPI specs.', 'research', ['code', 'structured-output'], ['network.capture', 'api-crawl', 'openapi.generate'], ['endpoint history', 'auth signals'], ['endpoint-deduplication', 'schema-inference'], ['endpoints.json', 'openapi.json']),
    agent('database-agent', 'Database Agent', 'Infer local-first database schema, seed data, cache strategy, sync jobs, and migrations.', 'plan', ['code', 'database'], ['schema.generate', 'response.sample', 'forms.inspect'], ['models', 'relations', 'cache rules'], ['normalization', 'sqlite-first', 'migration-design'], ['schema.sql', 'schema.prisma', 'seed.json']),
    agent('mcp-agent', 'MCP Agent', 'Turn discovered APIs and app actions into safe MCP tools for OpenCode and other agents.', 'build', ['code', 'tools'], ['mcp.generate', 'sdk.generate', 'auth.redact'], ['tool usage', 'security decisions'], ['tool-schema-design', 'permission-boundaries'], ['mcp/server.ts', 'mcp/tools.ts']),
    agent('opencode-build-agent', 'OpenCode Build Agent', 'Execute the build plan, edit files, run commands, fix failures, and stream progress.', 'build', ['best-code-model', 'reasoning'], ['opencode.session', 'files.edit', 'terminal.run', 'tests.run'], ['build decisions', 'failures', 'fixes'], ['incremental-implementation', 'test-driven-repair'], ['src/**', 'tests/**', 'build-log.md']),
    agent('build-doctor-agent', 'Build Doctor Agent', 'Diagnose the entire generated app lifecycle: workspace shape, package scripts, dependencies, env vars, APIs, database setup, build output, preview logs, tests, and deployment readiness.', 'review', ['reasoning', 'code', 'tools'], ['builder.doctor', 'terminal.run', 'files.inspect', 'preview.logs', 'visual-qa'], ['diagnostics', 'root causes', 'repair history'], ['full-stack-diagnostics', 'error-classification', 'safe-autofix'], ['.nexus/doctor/doctor-report.json', '.nexus/doctor/repair-plan.md']),
    agent('auto-heal-agent', 'Auto Heal Agent', 'Use Build Doctor reports, logs, visual QA artifacts, and app intent to launch bounded OpenCode repairs, then rerun build and preview checks until the app is healthy or needs human approval.', 'operate', ['best-code-model', 'reasoning'], ['builder.autoHeal', 'opencode.session', 'workspace.snapshot', 'tests.run', 'preview.restart'], ['healing attempts', 'accepted fixes', 'blocked issues'], ['repair-loop', 'snapshot-before-edit', 'human-approval-boundaries'], ['auto-heal.log', 'healing-summary.md']),
    agent('typescript-expert-agent', 'TypeScript Expert Agent', 'Pull current official TypeScript GitHub release/repo signals and repair compiler, tsconfig, JSX, module-resolution, and type-dependency failures with current best practices.', 'review', ['code', 'official-source-reasoning'], ['languageExpert.typescript.update', 'terminal.tsc', 'files.inspect', 'package.inspect'], ['compiler errors', 'tsconfig decisions', 'official release notes'], ['official-doc-refresh', 'compiler-diagnostics', 'typed-repair'], ['typescript-expert-report.md', 'tsconfig.patch.md']),
    agent('framework-expert-router', 'Full-Stack Expert Router', 'Routes build failures to official-source expert agents for languages, runtimes, frontend frameworks, backend frameworks, databases, ORMs, package managers, build tools, test tools, DevOps, cloud deploys, APIs, auth, payments, mobile, AI SDKs, and observability based on files, logs, dependencies, and error signatures.', 'operate', ['reasoning', 'classifier'], ['languageExpert.list', 'languageExpert.update', 'builder.doctor', 'logs.classify'], ['routing decisions', 'error signatures', 'official GitHub source updates'], ['expert-routing', 'stack-detection', 'official-source-selection'], ['expert-routing-report.json']),
    agent('creative-mind-agent', 'Creative Mind Builder', 'Creates a product-specific visual thesis, anti-template rules, layout rhythm, interaction language, typography, color system, and signature details so web, mobile, game, and UI/UX outputs do not look interchangeable.', 'plan', ['vision', 'creative-reasoning', 'frontend-code'], ['browser.screenshot', 'ui-intelligence', 'creative.direction', 'component.inspect'], ['creative direction', 'anti-template rules', 'brand DNA', 'interaction decisions'], ['visual-dna', 'design-system-generation', 'creative-divergence', 'accessibility-by-design'], ['.nexus/creative/creative-direction.json', '.nexus/creative/creative-build-prompt.md']),
    agent('react-agent', 'React Agent', 'Create React pages, hooks, providers, routing, state, loading/error states, and UI/API wiring.', 'build', ['frontend-code'], ['ui-report', 'api-sdk', 'tailwind'], ['component contracts', 'hook patterns'], ['react-architecture', 'accessibility'], ['src/components', 'src/hooks', 'src/app']),
    agent('tailwind-agent', 'Tailwind Agent', 'Create compact responsive Tailwind components, variants, theme tokens, and restyle modes.', 'build', ['ui-code', 'vision'], ['design-tokens', 'component-classifier'], ['theme decisions', 'variants'], ['tailwind-tokenization', 'responsive-variants'], ['tailwind.config.ts', 'components/ui']),
    agent('integration-agent', 'Integration Agent', 'Add GitHub, Stripe, auth, email, storage, analytics, deployment, monitoring, and AI integrations.', 'build', ['code', 'security'], ['integration.registry', 'env.example'], ['enabled integrations', 'secret rules'], ['env-validation', 'webhook-safety'], ['integrations/**', '.env.example']),
    agent('qa-agent', 'QA Agent', 'Run browser QA, visual comparison, flow replay, accessibility checks, API tests, and repair tasks.', 'review', ['vision', 'code-review'], ['browser.compare', 'playwright', 'api.test'], ['known regressions', 'accepted diffs'], ['visual-qa', 'flow-replay', 'repair-loop'], ['qa-report.md', 'repair-tasks.md']),
    agent('memory-agent', 'Memory And Skills Agent', 'Persist project knowledge, summarize sessions, create reusable skills, and retrieve previous decisions.', 'operate', ['summarization', 'retrieval'], ['memory.write', 'memory.search', 'skills.create'], ['project memory', 'user preferences', 'skills'], ['context-compression', 'skill-creation', 'session-recall'], ['memory/project.md', 'skills/*.md']),
    agent('scheduler-agent', 'Automation Scheduler Agent', 'Schedule recurring crawls, nightly QA, dependency checks, endpoint monitoring, and build audits.', 'operate', ['cheap-fast', 'ops'], ['cron.schedule', 'browser.crawl', 'qa.run'], ['schedule history', 'run summaries'], ['recurring-automation', 'human-review-queue'], ['automations.json', 'scheduled-runs.md']),
    agent('nexus-memory-agent', 'Nexus Memory Agent', 'Use persistent runtime memory, session search, user preferences, and context summaries so Nexus remembers durable project decisions across sessions.', 'operate', ['long-context', 'retrieval', 'summarization'], ['agentRuntime.memory', 'agentRuntime.search', 'builder.memory'], ['project memory', 'user preferences', 'session summaries'], ['memory-curation', 'session-search', 'context-files'], ['.nexus/agent-runtime/state.json'], 'nexus-native'),
    agent('nexus-skills-agent', 'Nexus Skills Agent', 'Create, refine, and apply Nexus coding skills so repeated browser-build workflows become reusable procedures.', 'operate', ['procedural-memory', 'code', 'reasoning'], ['agentRuntime.skills', 'skills.create', 'skills.improve', 'files.inspect'], ['skill usage', 'successful procedures', 'failed procedures'], ['skill-authoring', 'skill-refinement', 'workflow-reuse'], ['.nexus/agent-runtime/state.json'], 'nexus-native'),
    agent('nexus-delegation-agent', 'Nexus Delegation Agent', 'Launch specialist Nexus agents for parallel research, coding, review, debugging, and QA workstreams, then merge findings into the browser-native build loop.', 'build', ['best-code-model', 'parallel-reasoning'], ['agentRuntime.delegations', 'terminal.run', 'files.inspect', 'tests.run'], ['delegation plan', 'specialist outputs', 'merge decisions'], ['agent-orchestration', 'parallel-workstreams', 'result-synthesis'], ['.nexus/agent-runtime/state.json'], 'nexus-native'),
    agent('nexus-operator-agent', 'Nexus Operator Agent', 'Turn chat requests into safe autonomous operations with approval boundaries, connector routing, release checks, and progress reporting.', 'operate', ['ops', 'messaging', 'security'], ['agentRuntime.jobs', 'connector.auth', 'builder.doctor', 'deploy.check'], ['operation status', 'approval gates', 'channel-ready reports'], ['operator-loop', 'secret-redaction', 'human-approval-gates'], ['.nexus/agent-runtime/state.json'], 'nexus-native'),
    agent('nexus-scheduler-agent', 'Nexus Scheduler Agent', 'Create recurring native jobs for nightly QA, dependency audits, research updates, endpoint monitoring, backups, and progress reports.', 'operate', ['cheap-fast', 'ops', 'summarization'], ['agentRuntime.jobs', 'scheduler.create', 'tests.run', 'browser.crawl'], ['schedule history', 'run summaries', 'failure reports'], ['recurring-automation', 'safe-notifications', 'memory-updates'], ['.nexus/agent-runtime/state.json', 'scheduled-runs.md'], 'nexus-native'),
    agent('nexus-mcp-tooling-agent', 'Nexus MCP And Tooling Agent', 'Wire Nexus tools, browser evidence, generated APIs, and external services into MCP servers, integrations, and safe agent tool plans.', 'build', ['tools', 'code', 'security'], ['mcp.server', 'plugin.catalog', 'api.discovery', 'auth.redact'], ['tool inventory', 'MCP schemas', 'permission notes'], ['mcp-integration', 'plugin-selection', 'toolset-design'], ['mcp/nexus-tools.md', '.nexus/tooling-report.md'], 'nexus-native'),
  ];

  return {
    philosophy: 'Use the Nexus Native Agent Runtime for persistent memory, coding skills, model routing, specialist delegation, operator loops, and scheduled automations, with browser evidence and OpenCode builds at the center of every workflow.',
    nativeAgentRuntime: NEXUS_NATIVE_AGENT_RUNTIME,
    sharedKnowledge: SHARED_ADVANCED_KNOWLEDGE,
    agents,
    workflows: [
      { name: 'Research Mode', trigger: 'User says research mode or asks to find resources.', agents: ['research-agent', 'browser-ui-agent', 'api-agent'], output: 'project-brain research update' },
      { name: 'Plan Mode', trigger: 'User says plan mode.', agents: ['creative-mind-agent', 'framework-expert-router', 'database-agent', 'mcp-agent', 'react-agent', 'tailwind-agent', 'integration-agent'], output: 'creative direction, expert route, build-plan.json, and tasks/*.md' },
      { name: 'Build Mode', trigger: 'User says build mode.', agents: ['creative-mind-agent', 'framework-expert-router', 'opencode-build-agent', 'react-agent', 'tailwind-agent', 'mcp-agent'], output: 'distinct running local app, expert-backed implementation, and changed files' },
      { name: 'Review Mode', trigger: 'After every build phase.', agents: ['build-doctor-agent', 'qa-agent', 'memory-agent'], output: 'doctor-report.json, qa-report.md, and repair-tasks.md' },
      { name: 'Auto Heal Mode', trigger: 'Build Doctor finds critical setup, build, preview, API, env, or QA failures.', agents: ['auto-heal-agent', 'opencode-build-agent', 'build-doctor-agent', 'qa-agent'], output: 'bounded repair run, passing build when possible, and healing-summary.md' },
      { name: 'Official-Source Expert Repair', trigger: 'Build logs show language, framework, database, package manager, build tool, test, deployment, API, auth, payment, AI, or observability failures.', agents: ['framework-expert-router', 'typescript-expert-agent', 'build-doctor-agent', 'auto-heal-agent'], output: 'official-source expert report and targeted repair prompt' },
      { name: 'Creative Divergence Pass', trigger: 'User asks for advanced creative output, mobile/game/UI builder mode, or says nothing should look the same.', agents: ['creative-mind-agent', 'browser-ui-agent', 'tailwind-agent', 'qa-agent', 'memory-agent'], output: 'anti-template creative prompt, design system rules, visual QA checks, and memory update' },
      { name: 'Operate Mode', trigger: 'User schedules recurring research or QA.', agents: ['scheduler-agent', 'memory-agent', 'build-doctor-agent'], output: 'scheduled-runs.md' },
      { name: 'Developer Employee Mode', trigger: 'User asks for Twin-style employees, autopilot, recurring dev work, or the smartest vibe coding system.', agents: ['research-agent', 'browser-ui-agent', 'api-agent', 'framework-expert-router', 'opencode-build-agent', 'build-doctor-agent', 'qa-agent', 'memory-agent', 'scheduler-agent'], output: 'hireable developer employee plan, triggers, integrations, approval gates, and recurring run reports' },
      { name: 'Nexus Native Agent Runtime', trigger: 'User asks for autonomy, persistent memory, skills, vibe coding, recurring work, operator loops, or subagent delegation.', agents: ['nexus-memory-agent', 'nexus-skills-agent', 'nexus-delegation-agent', 'nexus-operator-agent', 'nexus-scheduler-agent', 'nexus-mcp-tooling-agent'], output: 'runtime memory updates, selected skills, schedules, specialist delegations, MCP/tooling plan, and reusable coding procedures' },
    ],
  };
}

export function buildAgentFiles(): Record<string, string> {
  const swarm = getProjectAgentSwarm();
  return Object.fromEntries(swarm.agents.map((spec) => [`${spec.id}.md`, spec.prompt]));
}

function agent(id: string, name: string, role: string, mode: ProjectAgentSpec['mode'], modelRouting: string[], tools: string[], memory: string[], skills: string[], outputs: string[], runtime: ProjectAgentSpec['runtime'] = 'nexus'): ProjectAgentSpec {
  return {
    id,
    name,
    role,
    mode,
    runtime,
    modelRouting,
    tools,
    memory,
    skills,
    outputs,
    prompt: `# ${name}\n\nRole: ${role}\n\nMode: ${mode}\n\nShared advanced knowledge every Nexus agent must apply:\n${SHARED_ADVANCED_KNOWLEDGE.map((item) => `- ${item}`).join('\n')}\n\nProfessional operating rules:\n${SHARED_AGENT_RULES.map((item) => `- ${item}`).join('\n')}\n\nModel routing preferences:\n${modelRouting.map((item) => `- ${item}`).join('\n')}\n\nTools:\n${tools.map((item) => `- ${item}`).join('\n')}\n\nMemory to maintain:\n${memory.map((item) => `- ${item}`).join('\n')}\n\nSkills to use or improve:\n${skills.map((item) => `- ${item}`).join('\n')}\n\nExpected outputs:\n${outputs.map((item) => `- ${item}`).join('\n')}\n`,
  };
}
