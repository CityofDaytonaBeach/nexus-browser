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
      { name: 'Plan Mode', trigger: 'User says plan mode.', agents: ['database-agent', 'mcp-agent', 'react-agent', 'tailwind-agent', 'integration-agent'], output: 'build-plan.json and tasks/*.md' },
      { name: 'Build Mode', trigger: 'User says build mode.', agents: ['opencode-build-agent', 'react-agent', 'tailwind-agent', 'mcp-agent'], output: 'running local app and changed files' },
      { name: 'Review Mode', trigger: 'After every build phase.', agents: ['qa-agent', 'memory-agent'], output: 'qa-report.md and repair-tasks.md' },
      { name: 'Operate Mode', trigger: 'User schedules recurring research or QA.', agents: ['scheduler-agent', 'memory-agent'], output: 'scheduled-runs.md' },
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
