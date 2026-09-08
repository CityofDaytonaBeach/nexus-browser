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
    expect(update.buildId).toBe(build.id);
    expect(update.prompt).toContain('User follow-up request');
    expect(update.prompt).toContain('make the homepage feel more cinematic');
    expect(fs.existsSync(path.join(path.dirname(update.logPath), 'opencode-update-prompt.md'))).toBe(true);
    expect(memory.entries.some((entry) => entry.tags.includes('chat-update'))).toBe(true);
  });

  test('rehydrates generated builds from disk after restart', () => {
    const generatedRoot = path.join(process.cwd(), 'generated-apps');
    const diskBuildRoot = path.join(generatedRoot, 'rehydrate-test-abcdef12');
    fs.mkdirSync(path.join(diskBuildRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(diskBuildRoot, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', build: 'vite build' }, dependencies: {} }));
    fs.writeFileSync(path.join(diskBuildRoot, 'README.md'), '# rehydrate-test\n\nPrompt:\nBuild a habitats app\n\nRun locally:');
    const freshPlatform = new BuilderPlatform();
    const hydrated = freshPlatform.getBuild('abcdef12');
    expect(hydrated?.id).toBe('abcdef12');
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
