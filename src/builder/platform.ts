import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import { chromium } from 'playwright';
import { getLanguageExperts, LanguageExpertProfile } from '../languages/registry';

export interface AiProviderProfile {
  id: string;
  name: string;
  kind: 'cloud' | 'local' | 'openai-compatible';
  env: string[];
  capabilities: string[];
  recommendedFor: string[];
}

export interface WorkspaceSnapshot {
  id: string;
  createdAt: string;
  root: string;
  reason: string;
  files: Array<{ path: string; size: number; modified: number }>;
}

export interface FileLock {
  path: string;
  owner: string;
  reason: string;
  createdAt: string;
}

export interface OpenCodeSessionStub {
  id: string;
  workspace: string;
  mode: string;
  status: 'created' | 'running' | 'waiting-review' | 'completed' | 'failed';
  prompt: string;
  createdAt: string;
}

export interface BuildWorkspace {
  id: string;
  name: string;
  root: string;
  prompt: string;
  status: 'created' | 'opencode-running' | 'opencode-unavailable' | 'failed';
  previewStatus: 'stopped' | 'starting' | 'running' | 'failed';
  previewUrl?: string;
  previewPort?: number;
  opencodeCommand: string;
  logPath: string;
  previewLogPath: string;
  previewCommand: string;
  createdAt: string;
}

export interface BuildDoctorIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  area: 'workspace' | 'package' | 'dependencies' | 'build' | 'preview' | 'api' | 'env' | 'quality';
  issue: string;
  evidence: string;
  fix: string;
}

export interface BuildDoctorReport {
  id: string;
  createdAt: string;
  buildId: string;
  workspace: string;
  score: number;
  status: 'healthy' | 'needs-attention' | 'broken';
  issues: BuildDoctorIssue[];
  checks: Record<string, any>;
  outputDir: string;
  repairPrompt: string;
  autoHealSession?: OpenCodeSessionStub;
}

export interface AutoHealLoopRun {
  id: string;
  buildId: string;
  startedAt: string;
  completedAt: string;
  threshold: number;
  maxPasses: number;
  status: 'healthy' | 'improved' | 'needs-human-review' | 'failed';
  reports: BuildDoctorReport[];
  healLogs: Array<{ pass: number; code: number | null; timedOut: boolean; logPath: string }>;
  preview?: BuildWorkspace;
  summary: string;
}

export interface ProjectMemoryEntry {
  id: string;
  createdAt: string;
  type: 'decision' | 'diagnostic' | 'repair' | 'creative' | 'expert-routing' | 'qa' | 'deployment' | 'user-preference';
  summary: string;
  evidence: string[];
  tags: string[];
}

export interface ProjectMemory {
  buildId: string;
  workspace: string;
  updatedAt: string;
  entries: ProjectMemoryEntry[];
  preferences: Record<string, string>;
  workingFixes: string[];
  failedFixes: string[];
}

export interface ExpertRouteDecision {
  expertId: string;
  name: string;
  category: string;
  officialGithub: string;
  score: number;
  reasons: string[];
  checks: string[];
  repairSkills: string[];
}

export interface ExpertRoutingReport {
  id: string;
  buildId: string;
  createdAt: string;
  workspace: string;
  selectedExperts: ExpertRouteDecision[];
  signals: Record<string, any>;
  prompt: string;
  outputDir: string;
}

export interface CreativeDirection {
  id: string;
  buildId: string;
  createdAt: string;
  name: string;
  thesis: string;
  antiTemplateRules: string[];
  visualLanguage: string[];
  layoutMoves: string[];
  interactionMoves: string[];
  typography: string[];
  colorSystem: string[];
  signatureDetails: string[];
  prompt: string;
  outputDir: string;
}

export interface BuildUpdateRun {
  id: string;
  buildId: string;
  createdAt: string;
  workspace: string;
  userMessage: string;
  status: 'running' | 'completed' | 'failed';
  prompt: string;
  logPath: string;
  session: OpenCodeSessionStub;
}

export interface StagingDevicePreset {
  id: 'desktop' | 'laptop' | 'tablet' | 'mobile' | 'game' | 'app-store-mobile';
  name: string;
  width: number;
  height: number;
  userAgentHint: string;
}

export interface StagingDeviceCheck {
  device: StagingDevicePreset;
  url: string;
  status: 'ready' | 'starting' | 'failed';
  healthCode?: number;
  latencyMs?: number;
  screenshotPath?: string;
  screenshotUrl?: string;
  consoleErrors: string[];
  networkErrors: string[];
  notes: string[];
}

export interface StagingReport {
  id: string;
  buildId: string;
  createdAt: string;
  workspace: string;
  previewUrl: string;
  previewStatus: BuildWorkspace['previewStatus'];
  devices: StagingDeviceCheck[];
  health: {
    status: 'ready' | 'degraded' | 'failed';
    score: number;
    issues: string[];
  };
  creativeUniqueness: {
    score: number;
    findings: string[];
    antiTemplatePrompt: string;
  };
  logs: {
    previewTail: string;
    errors: string[];
  };
  outputDir: string;
  summary: string;
}

export class BuilderPlatform {
  private snapshots: Map<string, WorkspaceSnapshot> = new Map();
  private locks: Map<string, FileLock> = new Map();
  private sessions: Map<string, OpenCodeSessionStub> = new Map();
  private builds: Map<string, BuildWorkspace> = new Map();
  private buildProcesses: Map<string, ChildProcess> = new Map();
  private previewProcesses: Map<string, ChildProcess> = new Map();
  private doctorReports: Map<string, BuildDoctorReport> = new Map();
  private autoHealLoops: Map<string, AutoHealLoopRun> = new Map();
  private memories: Map<string, ProjectMemory> = new Map();
  private expertRoutes: Map<string, ExpertRoutingReport> = new Map();
  private creativeDirections: Map<string, CreativeDirection> = new Map();
  private stagingReports: Map<string, StagingReport> = new Map();
  private buildUpdates: Map<string, BuildUpdateRun> = new Map();

  getProviders(): AiProviderProfile[] {
    return [
      { id: 'openai', name: 'OpenAI', kind: 'cloud', env: ['OPENAI_API_KEY'], capabilities: ['chat', 'vision', 'code', 'tools'], recommendedFor: ['codegen', 'ui reasoning', 'planning'] },
      { id: 'anthropic', name: 'Anthropic Claude', kind: 'cloud', env: ['ANTHROPIC_API_KEY'], capabilities: ['chat', 'vision', 'long-context', 'code'], recommendedFor: ['large code review', 'planning', 'agent reasoning'] },
      { id: 'gemini', name: 'Google Gemini', kind: 'cloud', env: ['GEMINI_API_KEY'], capabilities: ['chat', 'vision', 'large-context'], recommendedFor: ['research synthesis', 'multimodal UI analysis'] },
      { id: 'openrouter', name: 'OpenRouter', kind: 'openai-compatible', env: ['OPENROUTER_API_KEY'], capabilities: ['model-router', 'chat', 'code'], recommendedFor: ['model choice', 'fallback routing'] },
      { id: 'ollama', name: 'Ollama', kind: 'local', env: ['OLLAMA_BASE_URL'], capabilities: ['local', 'privacy', 'offline'], recommendedFor: ['private research', 'cheap iteration'] },
      { id: 'lmstudio', name: 'LM Studio', kind: 'local', env: ['LMSTUDIO_BASE_URL'], capabilities: ['local', 'openai-compatible'], recommendedFor: ['local coding models'] },
      { id: 'github-models', name: 'GitHub Models', kind: 'cloud', env: ['GITHUB_TOKEN'], capabilities: ['chat', 'code'], recommendedFor: ['GitHub-native workflows'] },
    ];
  }

  createOpenCodeSession(workspace: string, prompt: string, mode = 'build'): OpenCodeSessionStub {
    const session: OpenCodeSessionStub = {
      id: uuid(),
      workspace: path.resolve(workspace || process.cwd()),
      mode,
      status: 'created',
      prompt,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getOpenCodeSessions(): OpenCodeSessionStub[] {
    return Array.from(this.sessions.values());
  }

  startBuildFromPrompt(prompt: string, options: { workspaceRoot?: string; uiLook?: string; mode?: string } = {}): BuildWorkspace {
    const id = uuid().slice(0, 8);
    const name = this.safeProjectName(prompt) || `nexus-app-${id}`;
    const root = path.join(path.resolve(options.workspaceRoot || path.join(process.cwd(), 'generated-apps')), `${name}-${id}`);
    const logPath = path.join(root, 'opencode-build.log');
    const previewLogPath = path.join(root, 'preview.log');
    const opencodePrompt = this.buildOpenCodeAppPrompt(prompt, options.uiLook || 'modern-saas');

    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    this.writeStarterApp(root, name, prompt);
    fs.writeFileSync(path.join(root, 'OPENCODE_BUILD_PROMPT.md'), opencodePrompt);

    const command = `opencode run ${JSON.stringify(opencodePrompt)}`;
    const build: BuildWorkspace = {
      id,
      name,
      root,
      prompt,
      status: 'created',
      previewStatus: 'stopped',
      opencodeCommand: command,
      logPath,
      previewLogPath,
      previewCommand: 'npm install && npm run dev',
      createdAt: new Date().toISOString(),
    };

    try {
      const commandParts = process.platform === 'win32'
        ? { command: 'cmd.exe', args: ['/c', 'opencode', 'run', opencodePrompt] }
        : { command: 'opencode', args: ['run', opencodePrompt] };
      const child = spawn(commandParts.command, commandParts.args, {
        cwd: root,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
      const log = fs.createWriteStream(logPath, { flags: 'a' });
      child.stdout.pipe(log);
      child.stderr.pipe(log);
      child.on('exit', (code) => {
        log.write(`\nOpenCode exited with code ${code}\n`);
        this.buildProcesses.delete(id);
      });
      child.on('error', (error) => {
        log.write(`\nOpenCode failed to start: ${error.message}\n`);
        build.status = 'opencode-unavailable';
      });
      this.buildProcesses.set(id, child);
      build.status = 'opencode-running';
    } catch {
      fs.writeFileSync(logPath, `OpenCode could not be launched automatically. Run this manually from ${root}:\n${command}\n`);
      build.status = 'opencode-unavailable';
    }

    this.builds.set(id, build);
    this.createOpenCodeSession(root, opencodePrompt, options.mode || 'build');
    return build;
  }

  getBuilds(): BuildWorkspace[] {
    return Array.from(this.builds.values());
  }

  updateBuildFromChat(buildId: string, message: string, options: { uiLook?: string; mode?: string; launch?: boolean } = {}): BuildUpdateRun {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    const id = uuid().slice(0, 8);
    const outputDir = path.join(build.root, '.nexus', 'chat-updates', id);
    fs.mkdirSync(outputDir, { recursive: true });
    this.createSnapshot(build.root, `chat update ${id}: ${message.slice(0, 120)}`);
    this.applyDeterministicAppUpdate(build, message);
    const prompt = this.buildChatUpdatePrompt(build, message, options.uiLook || 'modern-saas');
    const logPath = path.join(outputDir, 'opencode-update.log');
    fs.writeFileSync(path.join(outputDir, 'opencode-update-prompt.md'), prompt);
    const session = this.createOpenCodeSession(build.root, prompt, options.mode || 'update');
    session.status = 'running';
    const run: BuildUpdateRun = { id, buildId, createdAt: new Date().toISOString(), workspace: build.root, userMessage: message, status: 'running', prompt, logPath, session };
    this.buildUpdates.set(id, run);
    if (options.launch === false) {
      run.status = 'completed';
      session.status = 'completed';
      fs.writeFileSync(logPath, 'Chat update launch skipped.\n');
      this.addProjectMemory(buildId, { type: 'decision', summary: `Chat update requested: ${message}`, evidence: [outputDir], tags: ['chat-update', options.uiLook || 'modern-saas'] });
      return run;
    }
    const commandParts = process.platform === 'win32'
      ? { command: 'cmd.exe', args: ['/c', 'opencode', 'run', prompt] }
      : { command: 'opencode', args: ['run', prompt] };
    try {
      const child = spawn(commandParts.command, commandParts.args, { cwd: build.root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true });
      const log = fs.createWriteStream(logPath, { flags: 'a' });
      child.stdout.pipe(log);
      child.stderr.pipe(log);
      child.on('exit', (code) => {
        log.write(`\nChat update exited with code ${code}\n`);
        run.status = code === 0 ? 'completed' : 'failed';
        session.status = run.status;
        this.stopPreview(buildId);
        this.startPreview(buildId);
      });
      child.on('error', (error) => {
        log.write(`\nChat update failed to start: ${error.message}\n`);
        run.status = 'failed';
        session.status = 'failed';
      });
    } catch (error: any) {
      fs.writeFileSync(logPath, `Chat update could not launch: ${error.message}\n`);
      run.status = 'failed';
      session.status = 'failed';
    }
    this.addProjectMemory(buildId, { type: 'decision', summary: `Chat update requested: ${message}`, evidence: [outputDir], tags: ['chat-update', options.uiLook || 'modern-saas'] });
    return run;
  }

  getBuildUpdates(): BuildUpdateRun[] {
    return Array.from(this.buildUpdates.values());
  }

  startPreview(buildId: string): BuildWorkspace {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    const existing = this.previewProcesses.get(buildId);
    if (existing && !existing.killed && build.previewUrl) return build;

    const port = build.previewPort || this.allocatePreviewPort();
    build.previewPort = port;
    build.previewUrl = `http://127.0.0.1:${port}`;
    build.previewStatus = 'starting';
    build.previewCommand = `npm install && npm run dev -- --host 0.0.0.0 --port ${port}`;

    fs.writeFileSync(build.previewLogPath, `Starting preview for ${build.name}\n${build.previewCommand}\n\n`, { flag: 'a' });
    const commandParts = process.platform === 'win32'
      ? { command: 'cmd.exe', args: ['/c', build.previewCommand] }
      : { command: 'sh', args: ['-lc', build.previewCommand] };

    const child = spawn(commandParts.command, commandParts.args, {
      cwd: build.root,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    const log = fs.createWriteStream(build.previewLogPath, { flags: 'a' });
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      log.write(text);
      if (/local:\s+https?:\/\//i.test(text) || /ready in/i.test(text)) build.previewStatus = 'running';
    });
    child.stderr.on('data', (chunk) => log.write(chunk));
    child.on('exit', (code) => {
      log.write(`\nPreview exited with code ${code}\n`);
      log.end();
      this.previewProcesses.delete(buildId);
      if (build.previewStatus !== 'stopped') build.previewStatus = code === 0 ? 'stopped' : 'failed';
    });
    child.on('error', (error) => {
      log.write(`\nPreview failed to start: ${error.message}\n`);
      build.previewStatus = 'failed';
    });

    this.previewProcesses.set(buildId, child);
    setTimeout(() => {
      if (build.previewStatus === 'starting') build.previewStatus = 'running';
    }, 4000);
    return build;
  }

  stopPreview(buildId: string): BuildWorkspace {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    const child = this.previewProcesses.get(buildId);
    if (child && !child.killed) {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill('SIGTERM');
    }
    this.previewProcesses.delete(buildId);
    build.previewStatus = 'stopped';
    return build;
  }

  getPreviewLog(buildId: string): { buildId: string; log: string } {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    if (!fs.existsSync(build.previewLogPath)) return { buildId, log: '' };
    const log = fs.readFileSync(build.previewLogPath, 'utf8');
    return { buildId, log: log.slice(-20000) };
  }

  async runBuildDoctor(buildId: string, options: { runBuild?: boolean; autoHeal?: boolean } = {}): Promise<BuildDoctorReport> {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    const issues: BuildDoctorIssue[] = [];
    const checks: Record<string, any> = { files: {}, scripts: {}, commands: {}, logs: {} };
    const packagePath = path.join(build.root, 'package.json');
    const srcDir = path.join(build.root, 'src');
    const indexHtml = path.join(build.root, 'index.html');

    checks.files.packageJson = fs.existsSync(packagePath);
    checks.files.src = fs.existsSync(srcDir);
    checks.files.indexHtml = fs.existsSync(indexHtml);
    if (!checks.files.packageJson) issues.push(this.issue('critical', 'package', 'Missing package.json', packagePath, 'Create package.json with dev, build, preview scripts and React/Vite dependencies.'));
    if (!checks.files.src) issues.push(this.issue('critical', 'workspace', 'Missing src directory', srcDir, 'Create src directory and application entry files.'));
    if (!checks.files.indexHtml) issues.push(this.issue('high', 'workspace', 'Missing index.html', indexHtml, 'Create index.html with a root element and module script entry.'));

    let pkg: any = undefined;
    if (checks.files.packageJson) {
      try {
        pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        checks.scripts = pkg.scripts || {};
        for (const script of ['dev', 'build']) {
          if (!pkg.scripts?.[script]) issues.push(this.issue('critical', 'package', `Missing npm script: ${script}`, JSON.stringify(pkg.scripts || {}), `Add a working \"${script}\" script.`));
        }
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        checks.dependencies = Object.keys(deps);
        for (const dep of ['react', 'react-dom', 'vite']) {
          if (!deps[dep]) issues.push(this.issue('high', 'dependencies', `Missing dependency: ${dep}`, packagePath, `Install and declare ${dep}.`));
        }
      } catch (error: any) {
        issues.push(this.issue('critical', 'package', 'Invalid package.json', error.message, 'Fix package.json so it is valid JSON.'));
      }
    }

    const envExample = path.join(build.root, '.env.example');
    checks.files.envExample = fs.existsSync(envExample);
    if (!checks.files.envExample && this.promptLikelyNeedsEnv(build.prompt)) issues.push(this.issue('medium', 'env', 'No .env.example for integration-heavy app', build.prompt, 'Create .env.example documenting required API, auth, database, and deployment variables.'));

    if (fs.existsSync(build.previewLogPath)) {
      const previewLog = fs.readFileSync(build.previewLogPath, 'utf8').slice(-12000);
      checks.logs.preview = previewLog.slice(-2000);
      if (/error|failed|eaddrinuse|module not found|cannot find|syntaxerror|vite.*error/i.test(previewLog)) {
        issues.push(this.issue('high', 'preview', 'Preview log contains runtime errors', previewLog.slice(-4000), 'Fix dev server/runtime errors, dependency failures, occupied ports, or import problems.'));
      }
    }

    if (fs.existsSync(build.logPath)) {
      const opencodeLog = fs.readFileSync(build.logPath, 'utf8').slice(-12000);
      checks.logs.opencode = opencodeLog.slice(-2000);
      if (/failed|error|exception|cannot|not found/i.test(opencodeLog)) issues.push(this.issue('medium', 'quality', 'OpenCode build log shows possible failures', opencodeLog.slice(-4000), 'Review OpenCode output and complete failed implementation tasks.'));
    }

    if (options.runBuild && pkg?.scripts?.build) {
      const result = await this.runCommand(build.root, process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/c', 'npm', 'run', 'build'] : ['run', 'build'], 90000);
      checks.commands.build = result;
      if (result.code !== 0) issues.push(this.issue('critical', 'build', 'Production build failed', `${result.stdout}\n${result.stderr}`.slice(-8000), 'Fix TypeScript, imports, bundler config, missing dependencies, and failing build scripts until npm run build passes.'));
    }

    const report = this.createDoctorReport(build, issues, checks);
    if (options.autoHeal) report.autoHealSession = this.startAutoHeal(build, report);
    this.doctorReports.set(report.id, report);
    return report;
  }

  getDoctorReports(): BuildDoctorReport[] {
    return Array.from(this.doctorReports.values());
  }

  getAutoHealLoops(): AutoHealLoopRun[] {
    return Array.from(this.autoHealLoops.values());
  }

  getProjectMemory(buildId: string): ProjectMemory {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    return this.loadProjectMemory(build);
  }

  addProjectMemory(buildId: string, entry: Omit<ProjectMemoryEntry, 'id' | 'createdAt'>): ProjectMemory {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    const memory = this.loadProjectMemory(build);
    memory.entries.push({ ...entry, id: uuid().slice(0, 8), createdAt: new Date().toISOString() });
    memory.updatedAt = new Date().toISOString();
    this.saveProjectMemory(memory);
    return memory;
  }

  routeExperts(buildId: string): ExpertRoutingReport {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    const packagePath = path.join(build.root, 'package.json');
    const pkg = fs.existsSync(packagePath) ? this.safeJson(packagePath) : {};
    const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
    const files = this.listWorkspaceFiles(build.root).slice(0, 600).map((file) => file.path.replace(/\\/g, '/'));
    const logs = [build.logPath, build.previewLogPath]
      .filter((file) => fs.existsSync(file))
      .map((file) => fs.readFileSync(file, 'utf8').slice(-8000))
      .join('\n');
    const signals = {
      dependencies: deps,
      scripts: pkg.scripts || {},
      files: files.slice(0, 160),
      logTerms: this.extractSignalTerms(logs),
      promptTerms: this.extractSignalTerms(build.prompt),
    };
    const selectedExperts = getLanguageExperts()
      .map((expert) => this.scoreExpert(expert, files, deps, logs, build.prompt))
      .filter((decision) => decision.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    const id = uuid().slice(0, 8);
    const outputDir = path.join(build.root, '.nexus', 'expert-routing', id);
    fs.mkdirSync(outputDir, { recursive: true });
    const prompt = this.buildExpertRoutingPrompt(build, selectedExperts, signals);
    const report: ExpertRoutingReport = { id, buildId, createdAt: new Date().toISOString(), workspace: build.root, selectedExperts, signals, prompt, outputDir };
    fs.writeFileSync(path.join(outputDir, 'expert-routing-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outputDir, 'expert-repair-prompt.md'), prompt);
    this.expertRoutes.set(id, report);
    this.addProjectMemory(buildId, { type: 'expert-routing', summary: `Routed to ${selectedExperts.map((expert) => expert.expertId).join(', ') || 'no experts'}`, evidence: selectedExperts.flatMap((expert) => expert.reasons.slice(0, 2)), tags: selectedExperts.map((expert) => expert.expertId) });
    return report;
  }

  createCreativeDirection(buildId: string, styleSeed = ''): CreativeDirection {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    const id = uuid().slice(0, 8);
    const seed = `${build.prompt} ${styleSeed}`.toLowerCase();
    const palettes = [
      ['oxidized copper', 'warm ivory', 'deep ink', 'signal coral'],
      ['midnight glass', 'electric cyan', 'soft graphite', 'acid lime'],
      ['bone paper', 'clay red', 'moss black', 'dust blue'],
      ['ultraviolet', 'charcoal', 'laser pink', 'frost white'],
    ];
    const palette = palettes[Math.abs(this.hash(seed)) % palettes.length];
    const name = this.creativeName(seed);
    const direction: CreativeDirection = {
      id,
      buildId,
      createdAt: new Date().toISOString(),
      name,
      thesis: `Build ${build.name} with a distinctive product identity, not a generic SaaS template. The UI should feel designed around the product's job, evidence, and user emotion.`,
      antiTemplateRules: [
        'Do not use the default centered hero plus three cards unless the product truly needs it.',
        'Avoid interchangeable blue gradients, generic glass cards, and filler dashboard widgets.',
        'Every section must have a specific user job and a distinct visual rhythm.',
        'Prefer one memorable signature interaction over many shallow animations.',
        'Use templates only as structural references; replace their visual language with this direction.',
      ],
      visualLanguage: ['asymmetric hierarchy', 'editorial spacing', 'data-informed surfaces', 'tactile depth', `${palette.join(', ')} palette`],
      layoutMoves: ['one unexpected navigation pattern', 'section shapes that change by content purpose', 'responsive composition that reflows intentionally instead of stacking mechanically', 'hero area with a product-specific artifact or live object'],
      interactionMoves: ['microinteractions on primary decisions', 'stateful empty/loading/error screens', 'reduced-motion fallback', 'animated progress that explains work being done'],
      typography: ['one strong display treatment', 'dense but readable technical labels', 'clear form and data hierarchy', 'consistent numeric/data typography'],
      colorSystem: palette,
      signatureDetails: ['custom loading state', 'distinct empty state illustration or pattern', 'one branded motion curve', 'component states designed for hover/focus/disabled/error/success'],
      prompt: '',
      outputDir: path.join(build.root, '.nexus', 'creative', id),
    };
    direction.prompt = this.buildCreativePrompt(build, direction);
    fs.mkdirSync(direction.outputDir, { recursive: true });
    fs.writeFileSync(path.join(direction.outputDir, 'creative-direction.json'), JSON.stringify(direction, null, 2));
    fs.writeFileSync(path.join(direction.outputDir, 'creative-build-prompt.md'), direction.prompt);
    this.creativeDirections.set(id, direction);
    this.addProjectMemory(buildId, { type: 'creative', summary: `Creative direction selected: ${direction.name}`, evidence: [direction.thesis, ...direction.visualLanguage], tags: ['creative-direction', 'anti-template', direction.name] });
    return direction;
  }

  getExpertRoutes(): ExpertRoutingReport[] {
    return Array.from(this.expertRoutes.values());
  }

  getCreativeDirections(): CreativeDirection[] {
    return Array.from(this.creativeDirections.values());
  }

  getStagingReports(): StagingReport[] {
    return Array.from(this.stagingReports.values());
  }

  async runStagingStudio(buildId: string, options: { devices?: string[]; runDoctor?: boolean } = {}): Promise<StagingReport> {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    if (!build.previewUrl || build.previewStatus === 'stopped' || build.previewStatus === 'failed') this.startPreview(buildId);
    const devices = this.stagingDevicePresets().filter((device) => !options.devices?.length || options.devices.includes(device.id));
    const id = uuid().slice(0, 8);
    const outputDir = path.join(build.root, '.nexus', 'staging', id);
    fs.mkdirSync(outputDir, { recursive: true });
    const previewLog = fs.existsSync(build.previewLogPath) ? fs.readFileSync(build.previewLogPath, 'utf8').slice(-20000) : '';
    const errors = this.extractPreviewErrors(previewLog);
    await this.waitForPreview(build.previewUrl!, 12000);
    const deviceChecks = await this.captureStagingDevices(build.previewUrl!, devices, outputDir);
    const creativeUniqueness = this.scoreCreativeUniqueness(build);
    const failedDevices = deviceChecks.filter((check) => check.status === 'failed').length;
    const runtimeErrors = deviceChecks.flatMap((check) => [...check.consoleErrors, ...check.networkErrors]);
    const healthScore = Math.max(0, 100 - failedDevices * 25 - errors.length * 10 - runtimeErrors.length * 8 - (build.previewStatus === 'running' ? 0 : 10));
    const status = failedDevices || errors.length ? (healthScore < 60 ? 'failed' : 'degraded') : 'ready';
    const report: StagingReport = {
      id,
      buildId,
      createdAt: new Date().toISOString(),
      workspace: build.root,
      previewUrl: build.previewUrl!,
      previewStatus: build.previewStatus,
      devices: deviceChecks,
      health: { status, score: healthScore, issues: [...errors, ...runtimeErrors, ...deviceChecks.flatMap((check) => check.status === 'failed' ? check.notes : [])] },
      creativeUniqueness,
      logs: { previewTail: previewLog.slice(-5000), errors },
      outputDir,
      summary: `Staging Studio ${status}: preview ${build.previewStatus}, ${deviceChecks.length} devices, health ${healthScore}/100, creative uniqueness ${creativeUniqueness.score}/100.`,
    };
    report.devices.forEach((check) => {
      if (check.screenshotPath) check.screenshotUrl = `/api/builder/staging-reports/${report.id}/devices/${check.device.id}/screenshot`;
    });
    fs.writeFileSync(path.join(outputDir, 'staging-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outputDir, 'staging-report.md'), this.stagingReportMarkdown(report));
    fs.writeFileSync(path.join(outputDir, 'creative-uniqueness-prompt.md'), creativeUniqueness.antiTemplatePrompt);
    this.stagingReports.set(id, report);
    this.addProjectMemory(buildId, { type: 'qa', summary: report.summary, evidence: [report.outputDir, ...report.health.issues.slice(0, 4)], tags: ['staging-studio', status, `creative-${creativeUniqueness.score}`] });
    return report;
  }

  getStagingScreenshot(reportId: string, deviceId: string): string {
    const report = this.stagingReports.get(reportId);
    if (!report) throw new Error('Staging report not found');
    const check = report.devices.find((item) => item.device.id === deviceId);
    if (!check?.screenshotPath || !fs.existsSync(check.screenshotPath)) throw new Error('Staging screenshot not found');
    const resolved = path.resolve(check.screenshotPath);
    if (!resolved.startsWith(path.resolve(report.outputDir))) throw new Error('Invalid staging screenshot path');
    return resolved;
  }

  async runAutoHealLoop(buildId: string, options: { threshold?: number; maxPasses?: number; timeoutMs?: number } = {}): Promise<AutoHealLoopRun> {
    const build = this.builds.get(buildId);
    if (!build) throw new Error('Build not found');
    const id = uuid().slice(0, 8);
    const threshold = Math.max(50, Math.min(options.threshold || 90, 100));
    const maxPasses = Math.max(1, Math.min(options.maxPasses || 3, 6));
    const timeoutMs = Math.max(30000, Math.min(options.timeoutMs || 180000, 600000));
    const reports: BuildDoctorReport[] = [];
    const healLogs: AutoHealLoopRun['healLogs'] = [];
    const startedAt = new Date().toISOString();

    this.createSnapshot(build.root, `auto-heal loop ${id} start`);
    let bestScore = 0;

    for (let pass = 1; pass <= maxPasses; pass++) {
      const report = await this.runBuildDoctor(buildId, { runBuild: true, autoHeal: false });
      reports.push(report);
      bestScore = Math.max(bestScore, report.score);
      if (report.score >= threshold && report.status === 'healthy') break;

      const healLogPath = path.join(report.outputDir, `auto-heal-loop-pass-${pass}.log`);
      fs.writeFileSync(healLogPath, `Auto-heal loop ${id}, pass ${pass}\n\n`, { flag: 'a' });
      const commandParts = process.platform === 'win32'
        ? { command: 'cmd.exe', args: ['/c', 'opencode', 'run', report.repairPrompt] }
        : { command: 'opencode', args: ['run', report.repairPrompt] };
      const result = await this.runCommand(build.root, commandParts.command, commandParts.args, timeoutMs);
      fs.writeFileSync(healLogPath, `${result.stdout}\n${result.stderr}\n`, { flag: 'a' });
      healLogs.push({ pass, code: result.code, timedOut: result.timedOut, logPath: healLogPath });
      this.stopPreview(buildId);
      this.startPreview(buildId);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    const finalReport = await this.runBuildDoctor(buildId, { runBuild: true, autoHeal: false });
    reports.push(finalReport);
    bestScore = Math.max(bestScore, finalReport.score);
    const completedAt = new Date().toISOString();
    const status = finalReport.score >= threshold && finalReport.status === 'healthy'
      ? 'healthy'
      : bestScore > reports[0].score
        ? 'improved'
        : healLogs.some((log) => log.code === -1 || log.timedOut)
          ? 'failed'
          : 'needs-human-review';
    const run: AutoHealLoopRun = {
      id,
      buildId,
      startedAt,
      completedAt,
      threshold,
      maxPasses,
      status,
      reports,
      healLogs,
      preview: this.builds.get(buildId),
      summary: `Auto-heal loop ${status}. Started at ${reports[0].score}/100, ended at ${finalReport.score}/100, best ${bestScore}/100.`,
    };
    this.autoHealLoops.set(id, run);
    fs.writeFileSync(path.join(build.root, '.nexus', `auto-heal-loop-${id}.json`), JSON.stringify(run, null, 2));
    return run;
  }

  private issue(severity: BuildDoctorIssue['severity'], area: BuildDoctorIssue['area'], issue: string, evidence: string, fix: string): BuildDoctorIssue {
    return { severity, area, issue, evidence, fix };
  }

  private loadProjectMemory(build: BuildWorkspace): ProjectMemory {
    const memoryPath = path.join(build.root, '.nexus', 'memory', 'project-memory.json');
    if (this.memories.has(build.id)) return this.memories.get(build.id)!;
    if (fs.existsSync(memoryPath)) {
      const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8')) as ProjectMemory;
      this.memories.set(build.id, memory);
      return memory;
    }
    const memory: ProjectMemory = { buildId: build.id, workspace: build.root, updatedAt: new Date().toISOString(), entries: [], preferences: {}, workingFixes: [], failedFixes: [] };
    this.memories.set(build.id, memory);
    this.saveProjectMemory(memory);
    return memory;
  }

  private saveProjectMemory(memory: ProjectMemory): void {
    const memoryDir = path.join(memory.workspace, '.nexus', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(path.join(memoryDir, 'project-memory.json'), JSON.stringify(memory, null, 2));
    fs.writeFileSync(path.join(memoryDir, 'project-memory.md'), this.memoryMarkdown(memory));
  }

  private memoryMarkdown(memory: ProjectMemory): string {
    return `# Nexus Project Memory\n\nWorkspace: ${memory.workspace}\nUpdated: ${memory.updatedAt}\n\n## Entries\n${memory.entries.map((entry) => `- ${entry.createdAt} [${entry.type}] ${entry.summary} (${entry.tags.join(', ')})`).join('\n') || 'No memory entries yet.'}\n\n## Working Fixes\n${memory.workingFixes.map((fix) => `- ${fix}`).join('\n') || 'None recorded.'}\n\n## Failed Fixes\n${memory.failedFixes.map((fix) => `- ${fix}`).join('\n') || 'None recorded.'}\n`;
  }

  private scoreExpert(expert: LanguageExpertProfile, files: string[], deps: string[], logs: string, prompt: string): ExpertRouteDecision {
    const reasons: string[] = [];
    let score = 0;
    const haystack = `${logs}\n${prompt}`.toLowerCase();
    for (const signal of expert.packageSignals) {
      if (deps.some((dep) => dep.toLowerCase() === signal.toLowerCase() || dep.toLowerCase().includes(signal.toLowerCase()))) {
        score += 25;
        reasons.push(`Dependency signal: ${signal}`);
      }
    }
    for (const pattern of expert.filePatterns) {
      const normalized = pattern.toLowerCase().replace(/\*\*\//g, '').replace(/\*/g, '');
      if (files.some((file) => file.toLowerCase().includes(normalized.replace(/[{}]/g, '').split(',')[0]) || this.fileMatchesSimplePattern(file, pattern))) {
        score += 12;
        reasons.push(`File signal: ${pattern}`);
      }
    }
    const terms = [expert.id, expert.category, ...expert.checks, ...expert.repairSkills].map((term) => term.toLowerCase());
    for (const term of terms) {
      const key = term.split(/[^a-z0-9]+/).filter((part) => part.length > 3)[0];
      if (key && haystack.includes(key)) {
        score += 6;
        reasons.push(`Log/prompt signal: ${key}`);
      }
    }
    return { expertId: expert.id, name: expert.name, category: expert.category, officialGithub: expert.officialGithub, score: Math.min(100, score), reasons: Array.from(new Set(reasons)).slice(0, 8), checks: expert.checks, repairSkills: expert.repairSkills };
  }

  private fileMatchesSimplePattern(file: string, pattern: string): boolean {
    const lower = file.toLowerCase();
    const clean = pattern.toLowerCase().replace('**/', '').replace('/**', '').replace('*.', '.').replace('*', '');
    if (clean.includes('{')) return clean.replace(/[{}]/g, '').split(',').some((part) => part && lower.endsWith(part.replace('*', '')));
    return clean.length > 0 && (lower.endsWith(clean) || lower.includes(clean.replace('/', '')));
  }

  private extractSignalTerms(text: string): string[] {
    return Array.from(new Set(text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [])).slice(0, 80);
  }

  private safeJson(filePath: string): any {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  private buildExpertRoutingPrompt(build: BuildWorkspace, selectedExperts: ExpertRouteDecision[], signals: Record<string, any>): string {
    return `You are the NexusBrowser Full-Stack Expert Router.\n\nWorkspace: ${build.root}\nBuild goal: ${build.prompt}\n\nSelected official-source experts:\n${selectedExperts.map((expert) => `- ${expert.name} (${expert.expertId}) score ${expert.score}/100, official source https://github.com/${expert.officialGithub}\n  Reasons: ${expert.reasons.join('; ')}`).join('\n') || '- No expert selected; inspect workspace manually.'}\n\nSignals:\n${JSON.stringify(signals, null, 2).slice(0, 12000)}\n\nRepair strategy:\n- Fetch official-source updates for the selected experts before making framework-specific assumptions.\n- Diagnose root cause across language, package manager, build tool, framework, database, API, auth, deployment, UI/UX, and security layers.\n- Use the smallest correct fix, then run build/tests/preview.\n- Persist lessons to .nexus/memory/project-memory.md.\n- Avoid generic template output; preserve the project's creative direction if present.\n`;
  }

  private hash(value: string): number {
    return value.split('').reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
  }

  private creativeName(seed: string): string {
    const names = ['Signal Atelier', 'Kinetic Ledger', 'Orbit Studio', 'Field Notes OS', 'Glass Foundry', 'Civic Neon', 'Quiet Machine', 'Tactile Console'];
    return names[Math.abs(this.hash(seed)) % names.length];
  }

  private buildCreativePrompt(build: BuildWorkspace, direction: CreativeDirection): string {
    return `You are the NexusBrowser Creative Mind Builder.\n\nWorkspace: ${build.root}\nProduct request: ${build.prompt}\nCreative direction: ${direction.name}\nThesis: ${direction.thesis}\n\nAnti-template rules:\n${direction.antiTemplateRules.map((rule) => `- ${rule}`).join('\n')}\n\nVisual language:\n${direction.visualLanguage.map((item) => `- ${item}`).join('\n')}\n\nLayout moves:\n${direction.layoutMoves.map((item) => `- ${item}`).join('\n')}\n\nInteraction and animation moves:\n${direction.interactionMoves.map((item) => `- ${item}`).join('\n')}\n\nTypography:\n${direction.typography.map((item) => `- ${item}`).join('\n')}\n\nColor system:\n${direction.colorSystem.map((item) => `- ${item}`).join('\n')}\n\nSignature details:\n${direction.signatureDetails.map((item) => `- ${item}`).join('\n')}\n\nBuild rules:\n- Do not make this look like a stock SaaS template.\n- Every screen needs a distinct reason for its layout, spacing, typography, and motion.\n- Use design-system consistency without making every section visually identical.\n- Include accessible focus states, reduced-motion handling, empty states, loading states, and error states.\n- If using an existing component library, restyle it until the app has its own identity.\n`;
  }

  private buildChatUpdatePrompt(build: BuildWorkspace, message: string, uiLook: string): string {
    const memory = this.loadProjectMemory(build);
    const latestCreative = Array.from(this.creativeDirections.values()).filter((item) => item.buildId === build.id).slice(-1)[0];
    const latestRoute = Array.from(this.expertRoutes.values()).filter((item) => item.buildId === build.id).slice(-1)[0];
    const previewLog = fs.existsSync(build.previewLogPath) ? fs.readFileSync(build.previewLogPath, 'utf8').slice(-5000) : '';
    return `You are OpenCode updating an existing NexusBrowser generated app from a conversational user request.\n\nWorkspace: ${build.root}\nOriginal app goal: ${build.prompt}\nUser follow-up request: ${message}\nCurrent preview URL: ${build.previewUrl || 'not running'}\nRequested look/mode: ${uiLook}\n\nProject memory:\n${memory.entries.slice(-20).map((entry) => `- [${entry.type}] ${entry.summary}`).join('\n') || '- No memory yet.'}\n\n${latestCreative ? `Creative direction to preserve and improve:\n${latestCreative.prompt.slice(0, 6000)}` : 'No creative direction exists yet. Create a distinct, anti-template design direction before changing UI.'}\n\n${latestRoute ? `Relevant expert routing context:\n${latestRoute.selectedExperts.map((expert) => `- ${expert.name}: ${expert.reasons.join('; ')}`).join('\n')}` : 'No expert route exists yet. Infer needed experts from package.json, files, and errors.'}\n\nRecent preview log:\n${previewLog || 'No preview log yet.'}\n\nUpdate rules:\n- Treat the user message as a modification to the existing app, not a request to start over.\n- Inspect files before editing.\n- Make the smallest complete code changes that satisfy the request.\n- If UI changes are requested, make them visually distinctive and avoid generic templates.\n- Preserve existing working functionality unless the user explicitly asks to replace it.\n- Update related loading, empty, error, hover, focus, mobile, and reduced-motion states when relevant.\n- Run npm install only if dependencies change.\n- Run npm run build and fix any failures.\n- Leave a concise summary in .nexus/memory/project-memory.md if you learn a durable decision.\n`;
  }

  private stagingDevicePresets(): StagingDevicePreset[] {
    return [
      { id: 'desktop', name: 'Desktop Studio', width: 1440, height: 1024, userAgentHint: 'desktop' },
      { id: 'laptop', name: 'Laptop Product', width: 1280, height: 800, userAgentHint: 'desktop' },
      { id: 'tablet', name: 'Tablet Touch', width: 834, height: 1112, userAgentHint: 'tablet' },
      { id: 'mobile', name: 'Mobile App', width: 390, height: 844, userAgentHint: 'mobile' },
      { id: 'game', name: 'Game Viewport', width: 960, height: 540, userAgentHint: 'game' },
      { id: 'app-store-mobile', name: 'App Store Shot', width: 1290, height: 2796, userAgentHint: 'mobile-screenshot' },
    ];
  }

  private async checkPreviewHealth(url: string): Promise<{ ok: boolean; code?: number; latencyMs?: number; error?: string }> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(url, { signal: controller.signal });
      return { ok: response.status < 500, code: response.status, latencyMs: Date.now() - started };
    } catch (error: any) {
      return { ok: false, latencyMs: Date.now() - started, error: error.message };
    } finally {
      clearTimeout(timer);
    }
  }

  private async waitForPreview(url: string, timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const health = await this.checkPreviewHealth(url);
      if (health.ok) return;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  private async captureStagingDevices(url: string, devices: StagingDevicePreset[], outputDir: string): Promise<StagingDeviceCheck[]> {
    const browser = await chromium.launch({ headless: true });
    try {
      const checks: StagingDeviceCheck[] = [];
      for (const device of devices) {
        const consoleErrors: string[] = [];
        const networkErrors: string[] = [];
        const screenshotPath = path.join(outputDir, `${device.id}-screenshot.png`);
        const context = await browser.newContext({
          viewport: { width: device.width, height: device.height },
          isMobile: device.userAgentHint.includes('mobile'),
          hasTouch: device.userAgentHint.includes('mobile') || device.userAgentHint.includes('tablet'),
          deviceScaleFactor: device.id === 'app-store-mobile' ? 3 : 1,
        });
        const page = await context.newPage();
        page.on('console', (message) => {
          if (['error', 'warning'].includes(message.type())) consoleErrors.push(`${message.type()}: ${message.text()}`.slice(0, 1000));
        });
        page.on('requestfailed', (request) => networkErrors.push(`${request.method()} ${request.url()} failed: ${request.failure()?.errorText || 'unknown'}`.slice(0, 1000)));
        try {
          const started = Date.now();
          const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
          await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
          checks.push({
            device,
            url,
            status: response && response.status() < 500 ? 'ready' : 'failed',
            healthCode: response?.status(),
            latencyMs: Date.now() - started,
            screenshotPath,
            consoleErrors: Array.from(new Set(consoleErrors)).slice(0, 8),
            networkErrors: Array.from(new Set(networkErrors)).slice(0, 8),
            notes: [`Captured ${device.width}x${device.height} rendered screenshot.`],
          });
        } catch (error: any) {
          checks.push({
            device,
            url,
            status: 'failed',
            screenshotPath,
            consoleErrors: Array.from(new Set(consoleErrors)).slice(0, 8),
            networkErrors: Array.from(new Set(networkErrors)).slice(0, 8),
            notes: [`Capture failed: ${error.message}`],
          });
        } finally {
          await context.close();
        }
      }
      return checks;
    } finally {
      await browser.close();
    }
  }

  private extractPreviewErrors(log: string): string[] {
    return Array.from(new Set(log.split(/\r?\n/)
      .filter((line) => /error|failed|exception|cannot find|module not found|syntaxerror|typeerror|referenceerror|vite.*error|eaddrinuse/i.test(line))
      .map((line) => line.trim())
      .filter(Boolean)))
      .slice(-12);
  }

  private scoreCreativeUniqueness(build: BuildWorkspace): StagingReport['creativeUniqueness'] {
    const files = this.listWorkspaceFiles(build.root).filter((file) => /\.(tsx|ts|jsx|js|css|html)$/.test(file.path)).slice(0, 120);
    const sample = files.map((file) => {
      const fullPath = path.join(build.root, file.path);
      return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').slice(0, 4000) : '';
    }).join('\n').toLowerCase();
    const genericSignals = ['modern saas', 'hero section', 'feature cards', 'lorem ipsum', 'blue gradient', 'get started', 'learn more', 'trusted by', 'glassmorphism'];
    const distinctSignals = ['reduced-motion', 'empty state', 'loading state', 'error state', 'focus-visible', 'aria-', 'custom property', 'signature', 'motion', 'brand', 'theme', 'tokens'];
    const genericHits = genericSignals.filter((signal) => sample.includes(signal));
    const distinctHits = distinctSignals.filter((signal) => sample.includes(signal));
    const score = Math.max(0, Math.min(100, 68 + distinctHits.length * 5 - genericHits.length * 7));
    const findings = [
      ...distinctHits.map((signal) => `Distinctive/system signal found: ${signal}`),
      ...genericHits.map((signal) => `Generic-template signal found: ${signal}`),
    ];
    if (!findings.length) findings.push('Not enough UI source signal yet; run Creative Mind before the next build pass.');
    return { score, findings, antiTemplatePrompt: this.buildAntiTemplateStagingPrompt(build, score, findings) };
  }

  private buildAntiTemplateStagingPrompt(build: BuildWorkspace, score: number, findings: string[]): string {
    return `You are the NexusBrowser Creative Divergence QA agent.\n\nWorkspace: ${build.root}\nPreview: ${build.previewUrl || 'not running'}\nCreative uniqueness score: ${score}/100\nFindings:\n${findings.map((finding) => `- ${finding}`).join('\n')}\n\nImprove the app until it no longer resembles a stock generated template.\n\nRequired changes:\n- Replace generic hero/card/grid composition with product-specific layout logic.\n- Add a signature visual system: typography, spacing, color, texture, and component states.\n- Add custom loading, empty, error, focus, hover, and mobile states.\n- Ensure desktop, tablet, mobile, game, and app-store screenshot sizes feel intentionally designed.\n- Preserve accessibility and reduced-motion support.\n- Run build and rerun Staging Studio after edits.\n`;
  }

  private stagingReportMarkdown(report: StagingReport): string {
    return `# Nexus Staging Studio\n\n${report.summary}\n\nPreview: ${report.previewUrl}\nWorkspace: ${report.workspace}\nCreated: ${report.createdAt}\n\n## Health\n- Status: ${report.health.status}\n- Score: ${report.health.score}/100\n${report.health.issues.map((issue) => `- ${issue}`).join('\n') || '- No blocking health issues detected.'}\n\n## Devices\n${report.devices.map((check) => `- ${check.device.name}: ${check.status}, ${check.device.width}x${check.device.height}, HTTP ${check.healthCode || 'n/a'}, ${check.latencyMs || 0}ms`).join('\n')}\n\n## Creative Uniqueness\n- Score: ${report.creativeUniqueness.score}/100\n${report.creativeUniqueness.findings.map((finding) => `- ${finding}`).join('\n')}\n\n## Logs\n\n\`\`\`text\n${report.logs.previewTail.slice(-3000)}\n\`\`\`\n`;
  }

  private createDoctorReport(build: BuildWorkspace, issues: BuildDoctorIssue[], checks: Record<string, any>): BuildDoctorReport {
    const id = uuid().slice(0, 8);
    const createdAt = new Date().toISOString();
    const penalty = issues.reduce((sum, item) => sum + (item.severity === 'critical' ? 35 : item.severity === 'high' ? 22 : item.severity === 'medium' ? 12 : 5), 0);
    const score = Math.max(0, 100 - penalty);
    const status = issues.some((item) => item.severity === 'critical') ? 'broken' : issues.length ? 'needs-attention' : 'healthy';
    const outputDir = path.join(build.root, '.nexus', 'doctor', id);
    fs.mkdirSync(outputDir, { recursive: true });
    const repairPrompt = this.buildDoctorRepairPrompt(build, issues, checks);
    const report: BuildDoctorReport = { id, createdAt, buildId: build.id, workspace: build.root, score, status, issues, checks, outputDir, repairPrompt };
    fs.writeFileSync(path.join(outputDir, 'doctor-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outputDir, 'repair-plan.md'), this.buildDoctorRepairPlan(report));
    fs.writeFileSync(path.join(outputDir, 'opencode-auto-heal-prompt.md'), repairPrompt);
    return report;
  }

  private startAutoHeal(build: BuildWorkspace, report: BuildDoctorReport): OpenCodeSessionStub {
    this.createSnapshot(build.root, `auto-heal before doctor report ${report.id}`);
    const session = this.createOpenCodeSession(build.root, report.repairPrompt, 'auto-heal');
    session.status = 'running';
    const commandParts = process.platform === 'win32'
      ? { command: 'cmd.exe', args: ['/c', 'opencode', 'run', report.repairPrompt] }
      : { command: 'opencode', args: ['run', report.repairPrompt] };
    const healLogPath = path.join(report.outputDir, 'auto-heal.log');
    try {
      const child = spawn(commandParts.command, commandParts.args, { cwd: build.root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true });
      const log = fs.createWriteStream(healLogPath, { flags: 'a' });
      child.stdout.pipe(log);
      child.stderr.pipe(log);
      child.on('exit', (code) => {
        log.write(`\nAuto-heal exited with code ${code}\n`);
        session.status = code === 0 ? 'completed' : 'failed';
      });
      child.on('error', (error) => {
        log.write(`\nAuto-heal failed to start: ${error.message}\n`);
        session.status = 'failed';
      });
    } catch (error: any) {
      fs.writeFileSync(healLogPath, `Auto-heal could not launch: ${error.message}\n`);
      session.status = 'failed';
    }
    return session;
  }

  private buildDoctorRepairPlan(report: BuildDoctorReport): string {
    return `# Nexus Build Doctor\n\nScore: ${report.score}/100\nStatus: ${report.status}\nWorkspace: ${report.workspace}\n\n## Issues\n${report.issues.map((item, index) => `${index + 1}. [${item.severity}] ${item.area}: ${item.issue}\nFix: ${item.fix}`).join('\n\n') || 'No issues found.'}\n`;
  }

  private buildDoctorRepairPrompt(build: BuildWorkspace, issues: BuildDoctorIssue[], checks: Record<string, any>): string {
    return `You are the NexusBrowser Build Doctor Auto-Heal Agent. You understand the full app-building lifecycle: package setup, dev server, React/Vite/Next structure, API clients, env vars, database wiring, tests, visual QA, deployment readiness, and safe agent repair.\n\nWorkspace: ${build.root}\nOriginal user request: ${build.prompt}\nPreview URL: ${build.previewUrl || 'not running'}\n\nDiagnosed issues:\n${issues.map((item) => `- [${item.severity}] ${item.area}: ${item.issue}\n  Evidence: ${item.evidence.slice(0, 1000)}\n  Fix: ${item.fix}`).join('\n') || '- No hard failures found; improve production readiness.'}\n\nChecks JSON:\n${JSON.stringify(checks, null, 2).slice(0, 12000)}\n\nAuto-heal rules:\n- Inspect files before editing.\n- Fix package scripts, dependencies, imports, missing files, TypeScript errors, Vite/runtime errors, API/env setup, and broken preview wiring.\n- Create .env.example when APIs, auth, payments, database, email, storage, AI, or deployment are implied.\n- Add safe mocks or local fallbacks when live APIs require secrets.\n- Preserve maintainable React/Tailwind code.\n- Never hardcode secrets or captured cookies.\n- Run npm install when dependencies change.\n- Run npm run build and fix failures.\n- If preview failed, ensure npm run dev works.\n- Update README with setup, env vars, scripts, and known limitations.\n- Keep changes minimal but complete enough for a working app.\n`;
  }

  private async runCommand(cwd: string, command: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (!child.killed) child.kill();
        resolve({ code: null, stdout: stdout.slice(-12000), stderr: stderr.slice(-12000), timedOut: true });
      }, timeoutMs);
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ code, stdout: stdout.slice(-12000), stderr: stderr.slice(-12000), timedOut: false });
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ code: -1, stdout: stdout.slice(-12000), stderr: `${stderr}\n${error.message}`.slice(-12000), timedOut: false });
      });
    });
  }

  private promptLikelyNeedsEnv(prompt: string): boolean {
    return /api|database|db|auth|login|stripe|payment|email|storage|github|supabase|openai|anthropic|deploy|webhook/i.test(prompt);
  }

  createSnapshot(root: string, reason = 'manual snapshot'): WorkspaceSnapshot {
    const resolvedRoot = path.resolve(root || process.cwd());
    const snapshot: WorkspaceSnapshot = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      root: resolvedRoot,
      reason,
      files: this.listWorkspaceFiles(resolvedRoot).slice(0, 2000),
    };
    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  getSnapshots(): WorkspaceSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  lockFile(filePath: string, owner: string, reason: string): FileLock {
    const lock: FileLock = { path: path.resolve(filePath), owner, reason, createdAt: new Date().toISOString() };
    this.locks.set(lock.path, lock);
    return lock;
  }

  unlockFile(filePath: string): boolean {
    return this.locks.delete(path.resolve(filePath));
  }

  getLocks(): FileLock[] {
    return Array.from(this.locks.values());
  }

  getDeployTargets(): Array<{ id: string; name: string; files: string[]; env: string[]; notes: string[] }> {
    return [
      { id: 'vercel', name: 'Vercel', files: ['vercel.json'], env: ['VERCEL_TOKEN'], notes: ['Best for Next.js apps', 'Use env vars for all secrets'] },
      { id: 'netlify', name: 'Netlify', files: ['netlify.toml'], env: ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'], notes: ['Best for static/Vite apps and functions'] },
      { id: 'cloudflare', name: 'Cloudflare Workers/Pages', files: ['wrangler.toml'], env: ['CLOUDFLARE_API_TOKEN'], notes: ['Best for edge apps and durable integrations'] },
      { id: 'railway', name: 'Railway', files: ['railway.json'], env: ['RAILWAY_TOKEN'], notes: ['Good for Node apps with databases'] },
      { id: 'docker', name: 'Docker', files: ['Dockerfile', 'docker-compose.yml'], env: [], notes: ['Portable local and production runtime'] },
    ];
  }

  createVisualQaPlan(targetUrl: string, localUrl: string): Record<string, any> {
    return {
      targetUrl,
      localUrl,
      checks: ['layout similarity', 'text coverage', 'color palette', 'component presence', 'responsive breakpoints', 'interactive states'],
      outputs: ['target-screenshot.png', 'local-screenshot.png', 'visual-diff.json', 'repair-tasks.md'],
      repairPrompt: `Compare ${localUrl} against ${targetUrl}. Identify visual mismatches, missing interactions, API data gaps, and Tailwind component fixes. Produce ordered OpenCode repair tasks.`,
    };
  }

  private listWorkspaceFiles(root: string): WorkspaceSnapshot['files'] {
    const files: WorkspaceSnapshot['files'] = [];
    const visit = (dir: string) => {
      if (files.length >= 2000) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(fullPath);
        else {
          try {
            const stat = fs.statSync(fullPath);
            files.push({ path: path.relative(root, fullPath), size: stat.size, modified: stat.mtimeMs });
          } catch {}
        }
      }
    };
    visit(root);
    return files;
  }

  private allocatePreviewPort(): number {
    const used = new Set(Array.from(this.builds.values()).map((build) => build.previewPort).filter((port): port is number => Boolean(port)));
    let port = 5173;
    while (used.has(port)) port += 1;
    return port;
  }

  private safeProjectName(prompt: string): string {
    const base = prompt.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42);
    if (base.includes('landing')) return 'landing-page';
    if (base.includes('dashboard')) return 'dashboard-app';
    if (base.includes('saas')) return 'saas-app';
    return base || 'nexus-app';
  }

  private writeStarterApp(root: string, name: string, prompt: string): void {
    const data = this.createGeneratedAppData(name, prompt, []);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview' },
      dependencies: { '@vitejs/plugin-react': 'latest', vite: 'latest', typescript: 'latest', react: 'latest', 'react-dom': 'latest' },
      devDependencies: {},
    }, null, 2));
    fs.writeFileSync(path.join(root, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>\n');
    fs.writeFileSync(path.join(root, 'src', 'main.jsx'), `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport './styles.css';\n\nfunction App() {\n  return (\n    <main className="page">\n      <nav className="nav"><strong>${name}</strong><a>Features</a><a>Pricing</a><button>Start Building</button></nav>\n      <section className="hero">\n        <p className="eyebrow">NexusBrowser generated starter</p>\n        <h1>${this.escapeHtml(prompt).slice(0, 90) || 'Build a production landing page'}</h1>\n        <p>OpenCode is now connected to this workspace. It should turn this starter into a polished application using the prompt in OPENCODE_BUILD_PROMPT.md.</p>\n        <div className="actions"><button>Get Started</button><button className="ghost">View Plan</button></div>\n      </section>\n      <section className="grid"><article>Research</article><article>Plan</article><article>Build</article></section>\n    </main>\n  );\n}\n\ncreateRoot(document.getElementById('root')).render(<App />);\n`);
    fs.writeFileSync(path.join(root, 'src', 'styles.css'), `body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f7fbff;color:#0f172a}.page{min-height:100vh}.nav{height:64px;display:flex;align-items:center;gap:24px;padding:0 40px;border-bottom:1px solid #dbeafe;background:white}.nav strong{margin-right:auto;color:#0284c7}.nav a{color:#475569}.nav button,.hero button{border:0;border-radius:12px;background:#0284c7;color:white;padding:12px 18px;font-weight:700}.hero{max-width:920px;margin:0 auto;padding:96px 24px;text-align:center}.eyebrow{color:#0284c7;font-weight:800;text-transform:uppercase;letter-spacing:.16em}.hero h1{font-size:clamp(40px,8vw,84px);line-height:.95;margin:16px 0}.hero p{font-size:20px;color:#475569}.actions{display:flex;gap:12px;justify-content:center;margin-top:28px}.hero .ghost{background:white;color:#0284c7;border:1px solid #bae6fd}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:980px;margin:0 auto;padding:0 24px 80px}.grid article{border:1px solid #dbeafe;border-radius:20px;background:white;padding:28px;font-weight:800;color:#0284c7}@media(max-width:760px){.nav{padding:0 16px}.nav a{display:none}.grid{grid-template-columns:1fr}.hero{text-align:left}.actions{justify-content:flex-start}}`);
    fs.writeFileSync(path.join(root, 'src', 'app-data.js'), this.renderGeneratedAppData(data));
    fs.writeFileSync(path.join(root, 'src', 'main.jsx'), this.renderGeneratedAppMain());
    fs.writeFileSync(path.join(root, 'src', 'styles.css'), this.renderGeneratedAppCss());
    fs.writeFileSync(path.join(root, 'README.md'), `# ${name}\n\nGenerated by NexusBrowser Builder.\n\nPrompt:\n${prompt}\n\nRun locally:\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`);
  }

  private applyDeterministicAppUpdate(build: BuildWorkspace, message: string): void {
    const updateLogPath = path.join(build.root, '.nexus', 'memory', 'chat-updates.json');
    const updates = fs.existsSync(updateLogPath) ? this.safeJson(updateLogPath) : [];
    const nextUpdates = Array.isArray(updates) ? [...updates, message].slice(-12) : [message];
    fs.mkdirSync(path.dirname(updateLogPath), { recursive: true });
    fs.writeFileSync(updateLogPath, JSON.stringify(nextUpdates, null, 2));
    fs.mkdirSync(path.join(build.root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(build.root, 'src', 'app-data.js'), this.renderGeneratedAppData(this.createGeneratedAppData(build.name, build.prompt, nextUpdates)));
    if (!fs.existsSync(path.join(build.root, 'src', 'main.jsx'))) fs.writeFileSync(path.join(build.root, 'src', 'main.jsx'), this.renderGeneratedAppMain());
    if (!fs.existsSync(path.join(build.root, 'src', 'styles.css'))) fs.writeFileSync(path.join(build.root, 'src', 'styles.css'), this.renderGeneratedAppCss());
  }

  private createGeneratedAppData(name: string, prompt: string, updates: string[]): Record<string, any> {
    const text = `${prompt} ${updates.join(' ')}`.toLowerCase();
    const category = /game|phaser|three|webgl|unity|godot/.test(text) ? 'Game' : /mobile|ios|android|expo|native/.test(text) ? 'Mobile' : /dashboard|admin|analytics|crm/.test(text) ? 'Dashboard' : /shop|commerce|stripe|payment/.test(text) ? 'Commerce' : /saas|subscription|team/.test(text) ? 'SaaS' : 'Web App';
    const palette = /game|neon|dark|cyber/.test(text)
      ? { accent: '#8b5cf6', ink: '#f8fafc', paper: '#09090f' }
      : /luxury|editorial|premium/.test(text)
        ? { accent: '#b45309', ink: '#20160f', paper: '#f8f1e7' }
        : { accent: '#0f8b8d', ink: '#102027', paper: '#f7fbf8' };
    const nouns = this.extractSignalTerms(prompt).filter((term) => term.length > 4).slice(0, 6);
    const focus = nouns.length ? nouns.join(', ') : category.toLowerCase();
    return {
      name,
      category,
      theme: palette,
      signature: `${category} Command Surface`,
      metric: String(Math.max(3, nouns.length + updates.length + 4)).padStart(2, '0'),
      metricLabel: 'live product systems',
      primaryCta: /shop|commerce|stripe|payment/.test(text) ? 'Launch checkout' : /game/.test(text) ? 'Start mission' : 'Run workflow',
      pages: [
        { id: 'overview', label: 'Overview', headline: this.titleFromPrompt(prompt, category), summary: `A working ${category.toLowerCase()} experience generated from your request, focused on ${focus}.`, features: ['Live product shell', 'Responsive command flow', 'Distinct visual system'] },
        { id: 'builder', label: 'Builder', headline: `Build and iterate ${category.toLowerCase()} screens`, summary: 'Chat changes update the app structure, copy, visual direction, and implementation prompts without starting over.', features: ['Conversation updates', 'Agent handoff', 'Preview-first QA'] },
        { id: 'launch', label: 'Launch', headline: 'Production readiness board', summary: 'The app includes setup, staging, QA, accessibility, and deployment surfaces for the requested product.', features: ['Health checks', 'Creative QA', 'Deployment checklist'] },
      ],
      featureDetails: ['Generated from prompt signals instead of a static template.', 'Designed to change when you continue the conversation.', 'Ready for OpenCode, Expert Router, Build Doctor, and Staging Studio.'],
      workflow: ['Capture the product intent', 'Generate real app files', 'Preview in browser', 'Update from chat', 'Run staging and repair loops'],
      updates,
    };
  }

  private titleFromPrompt(prompt: string, category: string): string {
    const cleaned = prompt.replace(/\b(build|create|make|generate|code|app|website|page)\b/gi, '').replace(/\s+/g, ' ').trim();
    return cleaned ? cleaned.slice(0, 96) : `Custom ${category} builder`;
  }

  private renderGeneratedAppData(data: Record<string, any>): string {
    return `export default ${JSON.stringify(data, null, 2)};\n`;
  }

  private renderGeneratedAppMain(): string {
    return `import React, { useState } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport data from './app-data.js';\nimport './styles.css';\n\nfunction App() {\n  const [activeId, setActiveId] = useState(data.pages[0].id);\n  const active = data.pages.find((page) => page.id === activeId) || data.pages[0];\n  return <main className=\"app-shell\" style={{ '--accent': data.theme.accent, '--ink': data.theme.ink, '--paper': data.theme.paper }}>\n    <nav className=\"nav\"><strong>{data.name}</strong>{data.pages.map((page) => <button key={page.id} className={page.id === active.id ? 'active' : ''} onClick={() => setActiveId(page.id)}>{page.label}</button>)}</nav>\n    <section className=\"hero\"><div><p className=\"eyebrow\">{data.category} builder</p><h1>{active.headline}</h1><p>{active.summary}</p><div className=\"actions\"><button>{data.primaryCta}</button><button className=\"ghost\">View system</button></div></div><aside className=\"artifact\"><span>{data.signature}</span><b>{data.metric}</b><small>{data.metricLabel}</small></aside></section>\n    <section className=\"feature-grid\">{active.features.map((feature, index) => <article key={feature}><span>{String(index + 1).padStart(2, '0')}</span><h2>{feature}</h2><p>{data.featureDetails[index % data.featureDetails.length]}</p></article>)}</section>\n    <section className=\"workflow\"><h2>Live product workflow</h2>{data.workflow.map((step) => <div key={step}><span></span>{step}</div>)}</section>\n    <section className=\"updates\"><h2>Conversation updates</h2>{data.updates.length ? data.updates.map((update) => <p key={update}>{update}</p>) : <p>Ask Nexus to change layout, content, integrations, mobile states, game feel, or UI direction and this app will update from chat.</p>}</section>\n  </main>;\n}\n\ncreateRoot(document.getElementById('root')).render(<App />);\n`;
  }

  private renderGeneratedAppCss(): string {
    return `*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:var(--paper);color:var(--ink)}button{font:inherit}.app-shell{min-height:100vh;overflow:hidden;background:radial-gradient(circle at 12% 10%,color-mix(in srgb,var(--accent),transparent 72%),transparent 30%),linear-gradient(135deg,var(--paper),color-mix(in srgb,var(--accent),white 88%))}.nav{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:14px clamp(16px,4vw,52px);backdrop-filter:blur(18px);background:color-mix(in srgb,var(--paper),transparent 14%);border-bottom:1px solid color-mix(in srgb,var(--ink),transparent 86%)}.nav strong{margin-right:auto;font-size:18px;letter-spacing:-.04em}.nav button{border:1px solid color-mix(in srgb,var(--ink),transparent 82%);border-radius:999px;background:transparent;color:inherit;padding:9px 12px;cursor:pointer}.nav button.active{background:var(--ink);color:var(--paper)}.hero{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:34px;align-items:center;padding:clamp(44px,8vw,118px) clamp(18px,5vw,72px)}.eyebrow{text-transform:uppercase;letter-spacing:.18em;color:var(--accent);font-weight:900}.hero h1{max-width:980px;font-size:clamp(42px,8vw,104px);line-height:.86;letter-spacing:-.08em;margin:10px 0 18px}.hero p{max-width:720px;font-size:clamp(17px,2vw,23px);line-height:1.45;color:color-mix(in srgb,var(--ink),transparent 28%)}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.actions button{border:0;border-radius:18px;background:var(--accent);color:white;padding:14px 19px;font-weight:900;box-shadow:0 18px 40px color-mix(in srgb,var(--accent),transparent 64%)}.actions .ghost{background:transparent;color:var(--ink);border:1px solid color-mix(in srgb,var(--ink),transparent 78%);box-shadow:none}.artifact{min-height:360px;border:1px solid color-mix(in srgb,var(--ink),transparent 80%);border-radius:34px;padding:24px;display:grid;align-content:end;background:linear-gradient(160deg,color-mix(in srgb,var(--accent),transparent 12%),color-mix(in srgb,var(--ink),transparent 8%));color:white;box-shadow:0 40px 90px color-mix(in srgb,var(--ink),transparent 82%);transform:rotate(2deg)}.artifact span{font-size:13px;text-transform:uppercase;letter-spacing:.2em}.artifact b{font-size:72px;line-height:.9;letter-spacing:-.08em}.artifact small{font-size:15px;opacity:.82}.feature-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:0 clamp(18px,5vw,72px) 28px}.feature-grid article,.workflow,.updates{border:1px solid color-mix(in srgb,var(--ink),transparent 84%);border-radius:28px;background:color-mix(in srgb,var(--paper),white 55%);padding:24px;box-shadow:0 18px 54px color-mix(in srgb,var(--ink),transparent 92%)}.feature-grid span{color:var(--accent);font-weight:900}.feature-grid h2{font-size:24px;letter-spacing:-.05em}.feature-grid p,.updates p{color:color-mix(in srgb,var(--ink),transparent 35%);line-height:1.55}.workflow,.updates{margin:14px clamp(18px,5vw,72px)}.workflow div{display:flex;gap:12px;align-items:center;padding:12px 0;border-top:1px solid color-mix(in srgb,var(--ink),transparent 88%)}.workflow div span{width:11px;height:11px;border-radius:99px;background:var(--accent);box-shadow:0 0 0 6px color-mix(in srgb,var(--accent),transparent 82%)}@media(max-width:880px){.hero{grid-template-columns:1fr}.artifact{min-height:220px;transform:none}.feature-grid{grid-template-columns:1fr}.nav{overflow:auto}.nav strong{position:sticky;left:0;background:var(--paper)}}@media(prefers-reduced-motion:no-preference){.artifact{animation:float 7s ease-in-out infinite}@keyframes float{50%{transform:translateY(-12px) rotate(-1deg)}}}`;
  }

  private buildOpenCodeAppPrompt(prompt: string, uiLook: string): string {
    return `You are OpenCode inside a NexusBrowser generated app workspace.\n\nUser request: ${prompt}\n\nUI look: ${uiLook}\n\nBuild a real working application, not just notes. Use the starter files already created in this workspace. Improve the landing page/application with clean React, production-quality CSS, responsive layout, accessible components, and clear project structure.\n\nRequired work:\n- Inspect the current files.\n- Replace the starter with a polished implementation matching the request.\n- Keep the app runnable with npm install and npm run dev.\n- Add clear README usage instructions.\n- Do not hardcode secrets.\n- Run or explain build verification.\n`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
  }
}
