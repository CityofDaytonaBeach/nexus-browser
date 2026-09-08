export interface ProjectAgentSpec {
  id: string;
  name: string;
  role: string;
  mode: 'research' | 'plan' | 'build' | 'review' | 'operate';
  modelRouting: string[];
  tools: string[];
  memory: string[];
  skills: string[];
  outputs: string[];
  prompt: string;
}

export interface AgentSwarmPlan {
  philosophy: string;
  agents: ProjectAgentSpec[];
  workflows: Array<{ name: string; trigger: string; agents: string[]; output: string }>;
}

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
  ];

  return {
    philosophy: 'Use Hermes-style persistent memory, skills, model routing, subagent delegation, and scheduled automations, but make browser evidence and OpenCode builds the center of every agent workflow.',
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
    ],
  };
}

export function buildAgentFiles(): Record<string, string> {
  const swarm = getProjectAgentSwarm();
  return Object.fromEntries(swarm.agents.map((spec) => [`${spec.id}.md`, spec.prompt]));
}

function agent(id: string, name: string, role: string, mode: ProjectAgentSpec['mode'], modelRouting: string[], tools: string[], memory: string[], skills: string[], outputs: string[]): ProjectAgentSpec {
  return {
    id,
    name,
    role,
    mode,
    modelRouting,
    tools,
    memory,
    skills,
    outputs,
    prompt: `# ${name}\n\nRole: ${role}\n\nMode: ${mode}\n\nModel routing preferences:\n${modelRouting.map((item) => `- ${item}`).join('\n')}\n\nTools:\n${tools.map((item) => `- ${item}`).join('\n')}\n\nMemory to maintain:\n${memory.map((item) => `- ${item}`).join('\n')}\n\nSkills to use or improve:\n${skills.map((item) => `- ${item}`).join('\n')}\n\nExpected outputs:\n${outputs.map((item) => `- ${item}`).join('\n')}\n\nRules:\n- Use browser evidence before making claims.\n- Keep outputs structured and directly usable by OpenCode.\n- Persist reusable lessons as skills.\n- Redact secrets and require explicit permission for risky actions.\n`,
  };
}
