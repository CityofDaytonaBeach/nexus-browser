import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuilderPlatform, BuildWorkspace, StagingReport } from '../platform';

function makeBuild(platform: BuilderPlatform, root: string, prompt = 'Build a React Vite TypeScript app with Stripe, Supabase, Three.js, mobile UI, and accessibility'): BuildWorkspace {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { dev: 'vite', build: 'tsc && vite build' },
    dependencies: { react: 'latest', 'react-dom': 'latest', vite: 'latest', typescript: 'latest', stripe: 'latest', '@supabase/supabase-js': 'latest', three: 'latest' },
  }, null, 2));
  fs.writeFileSync(path.join(root, 'src', 'App.tsx'), 'export function App(){ return <main className="brand focus-visible reduced-motion empty state">Custom game dashboard</main>; }');
  const build: BuildWorkspace = {
    id: 'test-build',
    name: 'test-build',
    root,
    prompt,
    status: 'created',
    previewStatus: 'running',
    previewUrl: 'http://localhost:5173',
    previewPort: 5173,
    opencodeCommand: 'opencode run test',
    logPath: path.join(root, 'opencode-build.log'),
    previewLogPath: path.join(root, 'preview.log'),
    previewCommand: 'npm run dev',
    brain: { mode: 'hybrid', provider: 'openai', executor: 'opencode', notes: [] },
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(build.previewLogPath, 'ready in 100ms');
  (platform as any).builds.set(build.id, build);
  return build;
}

describe('BuilderPlatform intelligence systems', () => {
  let root: string;
  let platform: BuilderPlatform;
  let build: BuildWorkspace;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-builder-test-'));
    platform = new BuilderPlatform();
    build = makeBuild(platform, root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('routes official-source experts from dependencies and prompt', () => {
    const report = platform.routeExperts(build.id);
    expect(report.selectedExperts.length).toBeGreaterThan(0);
    expect(report.selectedExperts.some((expert) => expert.expertId === 'react')).toBe(true);
    expect(fs.existsSync(path.join(report.outputDir, 'expert-routing-report.json'))).toBe(true);
  });

  test('plans React and PHP expert teams before scaffolding', () => {
    const react = platform.planBuildStack('Build a React TypeScript dashboard with Supabase and Stripe');
    const php = platform.planBuildStack('Build a Laravel PHP API with MySQL authentication');

    expect(react.framework).toBe('React + Vite');
    expect(react.expertIds).toEqual(expect.arrayContaining(['typescript', 'react', 'vite', 'supabase', 'stripe']));
    expect(php.framework).toBe('Laravel');
    expect(php.expertIds).toEqual(expect.arrayContaining(['php', 'laravel', 'composer', 'mysql', 'oauth2']));
    expect(php.expertIds).not.toContain('react');
  });

  test('creates a PHP workspace and persists its selected agent knowledge', async () => {
    const phpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-php-builder-test-'));
    try {
      const prompt = 'Build a PHP customer portal with Composer and MySQL';
      const stackPlan = platform.planBuildStack(prompt);
      (platform as any).writeStarterApp(phpRoot, 'php-portal', prompt, stackPlan);
      (platform as any).writeStackAgentManifest(phpRoot, stackPlan);
      const phpBuild: BuildWorkspace = {
        ...build,
        id: 'php-build',
        root: phpRoot,
        prompt,
        stackPlan,
        logPath: path.join(phpRoot, 'opencode-build.log'),
        previewLogPath: path.join(phpRoot, 'preview.log'),
      };
      (platform as any).builds.set(phpBuild.id, phpBuild);

      const route = platform.routeExperts(phpBuild.id);
      const doctor = await platform.runBuildDoctor(phpBuild.id, { runBuild: false });
      const previewCommand = (platform as any).previewCommandForBuild(phpBuild, 5179) as string;
      const brief = (platform as any).buildOpenCodeAppPrompt(prompt, 'work-focused', phpBuild.brain, stackPlan, '') as string;
      const manifest = fs.readFileSync(path.join(phpRoot, '.nexus', 'agents', 'selected-experts.md'), 'utf8');

      expect(fs.existsSync(path.join(phpRoot, 'composer.json'))).toBe(true);
      expect(fs.existsSync(path.join(phpRoot, 'public', 'index.php'))).toBe(true);
      expect(fs.existsSync(path.join(phpRoot, 'package.json'))).toBe(false);
      expect(previewCommand).toBe('php -S 0.0.0.0:5179 -t public');
      expect(route.selectedExperts.some((expert) => expert.expertId === 'php')).toBe(true);
      expect(route.selectedExperts.some((expert) => expert.expertId === 'composer')).toBe(true);
      expect(doctor.issues.some((issue) => /package\.json|React|Vite/.test(`${issue.issue} ${issue.fix}`))).toBe(false);
      expect(manifest).toContain('PHP Expert Agent');
      expect(brief).toContain('Do not silently replace it with a familiar default');
      expect(brief).toContain('Composer Expert Agent');
    } finally {
      fs.rmSync(phpRoot, { recursive: true, force: true });
    }
  });

  test('creates creative direction and persists memory', () => {
    const direction = platform.createCreativeDirection(build.id, 'dark neon game');
    const memory = platform.getProjectMemory(build.id);
    expect(direction.antiTemplateRules.length).toBeGreaterThan(3);
    expect(memory.entries.some((entry) => entry.type === 'creative')).toBe(true);
    expect(fs.existsSync(path.join(direction.outputDir, 'creative-build-prompt.md'))).toBe(true);
  });

  test('creates bounded conversational update runs for existing builds', () => {
    const update = platform.updateBuildFromChat(build.id, 'make the homepage feel more cinematic and add a mobile empty state', { uiLook: 'dark-neon', mode: 'build', launch: false });
    const memory = platform.getProjectMemory(build.id);
    const activity = platform.getBuildActivity(build.id, update.id);
    expect(update.buildId).toBe(build.id);
    expect(update.prompt).toContain('User follow-up request');
    expect(update.prompt).toContain('make the homepage feel more cinematic');
    expect(activity.kind).toBe('update');
    expect(activity.status).toBe('completed');
    expect(activity.terminal).toBe(true);
    expect(activity.log).toContain('launch skipped');
    expect(fs.existsSync(path.join(path.dirname(update.logPath), 'opencode-update-prompt.md'))).toBe(true);
    expect(memory.entries.some((entry) => entry.tags.includes('chat-update'))).toBe(true);
  });

  test('preserves a custom React data schema during chat update preflight', () => {
    const mainPath = path.join(root, 'src', 'main.jsx');
    const dataPath = path.join(root, 'src', 'app-data.js');
    const customData = "export default { events: [{ title: 'Community ride' }] };\n";
    fs.writeFileSync(mainPath, "import data from './app-data.js';\nexport default function App(){ return data.events.map((event) => event.title); }\n");
    fs.writeFileSync(dataPath, customData);

    platform.updateBuildFromChat(build.id, 'add a route map without changing the content model', { launch: false });

    expect(fs.readFileSync(dataPath, 'utf8')).toBe(customData);
  });

  test('queues chat updates while the initial build executor is running', () => {
    build.status = 'opencode-running';
    const update = platform.updateBuildFromChat(build.id, 'make every section responsive on phone and tablet', { mode: 'build' });

    expect(update.status).toBe('queued');
    expect(update.session.status).toBe('created');
    expect(fs.readFileSync(update.logPath, 'utf8')).toContain('Queued behind the active Nexus executor');
    build.status = 'completed';
    expect(platform.getBuildActivity(build.id).pendingUpdates).toBe(1);
    expect(platform.getBuildActivity(build.id).terminal).toBe(false);
  });

  test('reports agent stages and a useful executor connection failure', () => {
    build.status = 'failed';
    build.stackPlan = platform.planBuildStack('Build a React TypeScript website');
    fs.writeFileSync(build.logPath, '\u001b[31mError: Cannot connect to API: Unable to connect.\u001b[0m\nCode executor exited with code 1\n');

    const activity = platform.getBuildActivity(build.id);

    expect(activity.progress.phase).toBe('Executor connection failed');
    expect(activity.progress.failure?.code).toBe('executor-connection');
    expect(activity.progress.failure?.recovery).toContain('retry');
    expect(activity.progress.agents).toEqual(expect.arrayContaining(['opencode-build-agent', 'react-agent', 'typescript', 'react']));
    expect(activity.progress.steps.find((step) => step.id === 'implementation')?.status).toBe('failed');
    expect(activity.progress.recentOutput.join(' ')).not.toContain('\u001b');
    expect(activity.terminal).toBe(true);
  });

  test('passes long OpenCode briefs by file on local builds', () => {
    const prompt = 'Build this app from browser evidence. '.repeat(1000);
    const promptFile = path.join(root, 'OPENCODE_BUILD_PROMPT.md');
    fs.writeFileSync(promptFile, prompt);
    const args = (platform as any).localCodeExecutionArgs(prompt, 'build', promptFile) as string[];
    const command = (platform as any).codeExecutionCommand(prompt, 'build', promptFile) as string;

    expect(args).toContain('--file');
    expect(args).toContain(promptFile);
    expect(args[args.length - 1]).toBe(promptFile);
    expect(args).not.toContain(prompt);
    expect(command).not.toContain(prompt);
  });

  test('rehydrates generated builds from disk after restart', () => {
    const generatedRoot = path.join(process.cwd(), 'generated-apps');
    const diskBuildRoot = path.join(generatedRoot, 'rehydrate-test-abcdef12');
    fs.mkdirSync(path.join(diskBuildRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(diskBuildRoot, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', build: 'vite build' }, dependencies: {} }));
    fs.writeFileSync(path.join(diskBuildRoot, 'README.md'), '# rehydrate-test\n\nPrompt:\nBuild a habitats app\n\nRun locally:');
    fs.writeFileSync(path.join(diskBuildRoot, 'opencode-build.log'), 'Error: Cannot connect to API: Unable to connect.\nCode executor exited with code 1\n');
    const restoredUpdateDir = path.join(diskBuildRoot, '.nexus', 'chat-updates', '1234abcd');
    fs.mkdirSync(restoredUpdateDir, { recursive: true });
    fs.writeFileSync(path.join(restoredUpdateDir, 'opencode-update-prompt.md'), 'User follow-up request:\nRepair and continue the app\n');
    fs.writeFileSync(path.join(restoredUpdateDir, 'opencode-update.log'), '✓ built in 400ms\nNo automated tests configured; build verification is the primary check.\nCode executor exited with code 1\n');
    const freshPlatform = new BuilderPlatform();
    const hydrated = freshPlatform.getBuild('abcdef12');
    expect(hydrated?.id).toBe('abcdef12');
    expect(hydrated?.status).toBe('completed');
    expect(freshPlatform.getBuildActivity('abcdef12').progress.failure).toBeUndefined();
    expect(freshPlatform.getBuildActivity('abcdef12', '1234abcd').status).toBe('completed');
    const update = freshPlatform.updateBuildFromChat('abcdef12', 'add an additional education page about habitats', { launch: false });
    expect(update.prompt).toContain('habitats');
    fs.rmSync(diskBuildRoot, { recursive: true, force: true });
  });

  test('guards staging screenshot access to report output directory', () => {
    const outputDir = path.join(root, '.nexus', 'staging', 'report');
    fs.mkdirSync(outputDir, { recursive: true });
    const screenshotPath = path.join(outputDir, 'desktop-screenshot.png');
    fs.writeFileSync(screenshotPath, 'png');
    const report: StagingReport = {
      id: 'report',
      buildId: build.id,
      createdAt: new Date().toISOString(),
      workspace: root,
      previewUrl: build.previewUrl!,
      previewStatus: 'running',
      devices: [{ device: { id: 'desktop', name: 'Desktop Studio', width: 1440, height: 1024, userAgentHint: 'desktop' }, url: build.previewUrl!, status: 'ready', screenshotPath, consoleErrors: [], networkErrors: [], notes: [] }],
      health: { status: 'ready', score: 100, issues: [] },
      creativeUniqueness: { score: 90, findings: [], antiTemplatePrompt: '' },
      logs: { previewTail: '', errors: [] },
      outputDir,
      summary: 'ok',
    };
    (platform as any).stagingReports.set(report.id, report);
    expect(platform.getStagingScreenshot('report', 'desktop')).toBe(path.resolve(screenshotPath));
  });
});
