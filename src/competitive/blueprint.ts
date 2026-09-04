export interface CompetitiveFeature {
  area: string;
  inspiration: string;
  nexusAdvantage: string;
  priority: 'now' | 'next' | 'later';
  buildTasks: string[];
}

export interface CompetitiveBlueprint {
  goal: string;
  positioning: string;
  features: CompetitiveFeature[];
  nextMilestones: Array<{ name: string; outcome: string; tasks: string[] }>;
}

export function getCompetitiveBlueprint(): CompetitiveBlueprint {
  const features: CompetitiveFeature[] = [
    {
      area: 'OpenCode Chat And Sessions',
      inspiration: 'Palot: multi-project OpenCode GUI, real-time streaming, slash commands, context mentions, draft persistence.',
      nexusAdvantage: 'Add browser context as first-class chat context: current page, network, UI blocks, screenshots, API discoveries, and research project brain.',
      priority: 'now',
      buildTasks: ['Stream OpenCode turns into the builder chat', 'Render tool calls inline', 'Add /research, /plan, /build, /qa slash commands', 'Persist drafts by research project'],
    },
    {
      area: 'Diff Review And Permissions',
      inspiration: 'Palot: dedicated diff review panel, permission approvals, undo/redo, comments on diffs.',
      nexusAdvantage: 'Pair code diffs with visual browser diffs so users approve both source changes and UI changes together.',
      priority: 'now',
      buildTasks: ['Add changed-files panel', 'Add inline approve/deny for shell/file/network actions', 'Add visual diff comments', 'Add rollback snapshots'],
    },
    {
      area: 'Live Full-Stack Preview',
      inspiration: 'bolt.diy: browser app building, terminal, project snapshots, deploy targets.',
      nexusAdvantage: 'Use real website research plus Playwright-controlled browser QA against target and generated app previews.',
      priority: 'now',
      buildTasks: ['Run local app preview beside target page', 'Capture target/generated screenshots', 'Generate repair tasks from visual mismatches', 'Persist app snapshots'],
    },
    {
      area: 'Provider And Model System',
      inspiration: 'bolt.diy: many cloud/local LLM providers and OpenAI-compatible endpoints.',
      nexusAdvantage: 'Route models by task type: research, UI vision, codegen, database design, MCP generation, and QA repair.',
      priority: 'next',
      buildTasks: ['Add provider registry', 'Add model capability tags', 'Add local Ollama/LM Studio detection', 'Add per-agent model selection'],
    },
    {
      area: 'File Locking And Snapshots',
      inspiration: 'bolt.diy: file locking and snapshot restoration.',
      nexusAdvantage: 'Lock files per agent and tie every snapshot to browser evidence, screenshots, endpoints, and build-plan steps.',
      priority: 'next',
      buildTasks: ['Add workspace snapshot manifest', 'Add file lock registry', 'Add restore snapshot route', 'Add generated-file collapse rules'],
    },
    {
      area: 'MCP And SDK Factory',
      inspiration: 'Both projects treat MCP/tools as a major extension surface.',
      nexusAdvantage: 'Discover APIs from live websites and turn them into MCP tools, SDKs, docs, local DB schemas, and UI wiring automatically.',
      priority: 'now',
      buildTasks: ['Improve endpoint response sampling', 'Generate complete MCP server from tools', 'Generate JS/PHP/React SDKs', 'Map UI regions to tools'],
    },
    {
      area: 'Automations And Scheduled Agents',
      inspiration: 'Palot: scheduled OpenCode runs with human review.',
      nexusAdvantage: 'Schedule recurring website/API research and app-regression QA in the browser.',
      priority: 'later',
      buildTasks: ['Add scheduled research crawls', 'Add recurring visual QA', 'Queue pending review runs', 'Auto-archive no-change runs'],
    },
  ];

  return {
    goal: 'Make NexusBrowser better than Palot, bolt.diy, and visual UI builders by combining browser research, OpenCode execution, live app preview, UI intelligence, API/MCP discovery, and visual QA.',
    positioning: 'NexusBrowser should be the research-to-code browser: it studies real apps, creates a project brain, builds locally with OpenCode, and verifies the result through the browser.',
    features,
    nextMilestones: [
      {
        name: 'OpenCode Runtime Bridge',
        outcome: 'Chat can start real OpenCode sessions, stream tool calls, and show diffs.',
        tasks: ['Spawn OpenCode server', 'Connect SDK/client', 'Stream messages', 'Render tool calls', 'Add permission gates'],
      },
      {
        name: 'Live Build Workspace',
        outcome: 'Generated apps run locally with terminal logs, preview URL, snapshots, and rollback.',
        tasks: ['Create workspace manager', 'Run npm/pnpm commands', 'Track files', 'Open preview browser', 'Add snapshots'],
      },
      {
        name: 'Visual QA Loop',
        outcome: 'Nexus compares target vs generated UI and creates repair tasks automatically.',
        tasks: ['Capture target screenshot', 'Capture app screenshot', 'Compare layout/colors/text', 'Generate fix tasks', 'Re-run QA'],
      },
    ],
  };
}
