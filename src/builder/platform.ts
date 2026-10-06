import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import { config } from '../core/config';
import { launchChromium } from '../browser/launch';
import { BrowserEngine, VisualPageProfile } from '../browser/engine';
import { getLanguageExperts, LanguageExpertProfile } from '../languages/registry';
import { getProjectAgentSwarm } from '../project-agents/registry';
import { Checkpoints, Checkpoint } from './checkpoints';
import { browserContractInstructions, BrowserVerification, verifyBrowserProduct, productContractSchema, ProductContract, captureRenderedEvidence } from './browser-verification';

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

export interface CodeExecutionBackend {
  id: 'local' | 'remote' | 'custom';
  name: string;
  kind: 'opencode-cli' | 'codex-server' | 'opencode-server' | 'custom-server';
  command?: string;
  url?: string;
  model?: string;
  status: 'configured' | 'missing-config';
  notes: string[];
}

export type BuildBrainMode = 'opencode' | 'hybrid' | 'ollama' | 'cloud';

export interface BuildBrainProfile {
  mode: BuildBrainMode;
  provider: string;
  model?: string;
  executor: 'opencode' | 'remote-codex' | 'custom-opencode' | 'nexus-fallback';
  notes: string[];
}

export interface BuildStackPlan {
  primaryLanguage: string;
  framework: string;
  runtime: string;
  packageManager: string;
  expertIds: string[];
  projectAgentIds: string[];
  setupCommands: string[];
  devCommand: string;
  buildCommands: string[];
  testCommands: string[];
  evidence: string[];
}

export interface BuildWorkspace {
  id: string;
  name: string;
  root: string;
  prompt: string;
  status: 'created' | 'opencode-running' | 'verifying' | 'completed' | 'opencode-unavailable' | 'failed';
  verification?: { phase: 'pending' | 'build' | 'browser' | 'repair' | 'passed' | 'failed'; pass: number; issues: string[]; artifacts: string[]; checkedAt?: string };
  reference?: { profilePath: string; screenshotPath: string; matchRequired: boolean };
  previewStatus: 'stopped' | 'starting' | 'running' | 'failed';
  previewUrl?: string;
  previewPort?: number;
  opencodeCommand: string;
  logPath: string;
  previewLogPath: string;
  previewCommand: string;
  brain: BuildBrainProfile;
  stackPlan?: BuildStackPlan;
  executorSessionId?: string;
  createdAt: string;
}

export interface BuildActivity {
  build: BuildWorkspace;
  update?: BuildUpdateRun;
  session?: OpenCodeSessionStub;
  kind: 'build' | 'update';
  status: BuildWorkspace['status'] | BuildUpdateRun['status'];
  terminal: boolean;
  pendingUpdates: number;
  log: string;
  progress: BuildProgress;
}

export interface BuildProgressStep {
  id: 'workspace' | 'routing' | 'implementation' | 'verification' | 'preview';
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail: string;
}

export interface BuildProgress {
  phase: string;
  summary: string;
  percent: number;
  agents: string[];
  steps: BuildProgressStep[];
  recentOutput: string[];
  failure?: {
    code: 'executor-connection' | 'executor-auth' | 'executor-missing' | 'executor-failed' | 'verification-failed';
    title: string;
    detail: string;
    recovery: string;
  };
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
  status: 'queued' | 'prepared' | 'running' | 'verifying' | 'completed' | 'failed';
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
    score: number | null;
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
  private checkpoints = new Checkpoints();
  private checkpointRuns = new Map<string, Checkpoint>();
  private snapshots: Map<string, WorkspaceSnapshot> = new Map();
  private locks: Map<string, FileLock> = new Map();
  private sessions: Map<string, OpenCodeSessionStub> = new Map();
  private builds: Map<string, BuildWorkspace> = new Map();
  private buildProcesses: Map<string, ChildProcess> = new Map();
  private buildUpdateProcesses: Map<string, ChildProcess> = new Map();
  private previewProcesses: Map<string, ChildProcess> = new Map();
  private previewReadyUrls = new Map<string, string | null>();
  private doctorReports: Map<string, BuildDoctorReport> = new Map();
  private autoHealLoops: Map<string, AutoHealLoopRun> = new Map();
  private memories: Map<string, ProjectMemory> = new Map();
  private expertRoutes: Map<string, ExpertRoutingReport> = new Map();
  private creativeDirections: Map<string, CreativeDirection> = new Map();
  private stagingReports: Map<string, StagingReport> = new Map();
  private buildUpdates: Map<string, BuildUpdateRun> = new Map();

  private persistBuild(build: BuildWorkspace): void {
    const dir = path.join(build.root, '.nexus');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'build-state.json');
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ build, updates: this.getBuildUpdates().filter((run) => run.buildId === build.id) }, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  }

  private failVerification(build: BuildWorkspace, error: Error): void {
    build.verification = { phase: 'failed', pass: build.verification?.pass || 1, issues: [error.message], artifacts: build.verification?.artifacts || [], checkedAt: new Date().toISOString() };
    build.status = 'failed';
    this.persistBuild(build);
  }

  private sealUpdate(run: BuildUpdateRun): void {
    const checkpoint = this.checkpointRuns.get(run.id);
    if (checkpoint) { this.checkpoints.seal(checkpoint); this.checkpointRuns.delete(run.id); }
  }

  private async verifyAndRepair(build: BuildWorkspace, request = build.prompt, allowRepair = true): Promise<boolean> {
    let lockedContract: ProductContract | undefined;
    const acceptedFile = path.join(build.root, '.nexus', 'accepted-contract.json');
    for (let pass = 1; pass <= 3; pass++) {
      build.verification = { phase: 'build', pass, issues: [], artifacts: [] };
      this.persistBuild(build);
      const doctor = await this.runBuildDoctor(build.id, { runBuild: true });
      const issues = doctor.issues.filter((issue) => issue.area !== 'preview' && (issue.area === 'build' || ['critical', 'high'].includes(issue.severity))).map((issue) => `${issue.issue}: ${issue.evidence}`);
      let browser: BrowserVerification | undefined;
      if (!issues.length) {
        build.verification.phase = 'browser';
        this.persistBuild(build);
        try {
          this.stopPreview(build.id);
          this.startPreview(build.id);
          await this.waitForBuildPreview(build, 30000);
          if (!lockedContract) {
            const candidate = productContractSchema.safeParse(this.safeJson(path.join(build.root, '.nexus', 'product-contract.json')));
            if (candidate.success) {
              const previous = productContractSchema.safeParse(this.safeJson(acceptedFile));
              const workflows = new Map((previous.success ? previous.data.workflows : []).map((workflow) => [workflow.name, workflow]));
              candidate.data.workflows.forEach((workflow) => workflows.set(workflow.name, workflow));
              lockedContract = { product: candidate.data.product, workflows: [...workflows.values()] };
            }
          }
          browser = await verifyBrowserProduct(build.root, build.previewUrl!, path.join(build.root, '.nexus', 'verification', `${Date.now()}-${pass}`), lockedContract);
          issues.push(...browser.issues);
          if (build.reference?.matchRequired && browser.status === 'passed') {
            const reference = { ...this.safeJson(build.reference.profilePath), screenshot: fs.readFileSync(build.reference.screenshotPath) } as VisualPageProfile;
            const comparison = await BrowserEngine.getInstance().compareCapturedReference(reference, build.previewUrl!, path.join(build.root, '.nexus', 'verification', 'visual-reference'));
            issues.push(...comparison.findings.filter((finding) => finding.severity === 'high').map((finding) => `${finding.issue} ${finding.repair}`));
            browser.artifacts.push(comparison.artifacts.targetScreenshot, comparison.artifacts.localScreenshot, comparison.artifacts.diffJson);
          }
        } catch (error: any) { issues.push(`Browser verification unavailable: ${error.message}`); }
      }
      build.verification.issues = issues;
      build.verification.artifacts = browser?.artifacts || [];
      build.verification.checkedAt = new Date().toISOString();
      if (!issues.length && browser?.status === 'passed') {
        build.verification.phase = 'passed';
        if (lockedContract) {
          fs.writeFileSync(acceptedFile, JSON.stringify(lockedContract, null, 2));
          fs.writeFileSync(path.join(build.root, '.nexus', 'product-contract.json'), JSON.stringify(lockedContract, null, 2));
        }
        this.addProjectMemory(build.id, { type: 'qa', summary: 'Independent build and desktop/mobile user workflows passed', evidence: browser.artifacts, tags: ['browser-verified'] });
        this.persistBuild(build);
        return true;
      }
      if (!allowRepair || pass === 3 || issues.some((issue) => /verification unavailable.*No usable Chromium/i.test(issue))) break;
      build.verification.phase = 'repair';
      this.persistBuild(build);
      const checkpoint = this.checkpoints.create(build.root, `Before browser repair pass ${pass}`);
      const repairDir = path.join(build.root, '.nexus', 'verification', `repair-${Date.now()}`);
      fs.mkdirSync(repairDir, { recursive: true });
      const prompt = `Repair the existing product from independently collected browser/build evidence.\nOriginal request: ${build.prompt}\nCurrent request: ${request}\nFailures:\n${issues.join('\n')}\nScreenshots and DOM/runtime evidence:\n${(browser?.artifacts || []).join('\n')}\nAcceptance outcomes locked for this repair:\n${JSON.stringify(lockedContract || 'Write the missing product contract')}\nInspect screenshots before UI repairs. Preserve existing working behavior and acceptance outcomes. Fix the cause; do not hide errors or weaken tests.\n${browserContractInstructions}`;
      const promptFile = path.join(repairDir, 'repair-prompt.md');
      fs.writeFileSync(promptFile, prompt);
      const result = await this.runCodeExecutionBlocking(build.root, prompt, 'browser-repair', path.join(repairDir, 'executor.log'), 180000, promptFile);
      this.checkpoints.seal(checkpoint);
      if (result.code !== 0 || result.timedOut) {
        build.verification.issues.push(`Repair executor failed: ${result.stderr || result.stdout || result.code}`);
        break;
      }
    }
    build.verification!.phase = 'failed';
    this.persistBuild(build);
    return false;
  }

  async verifyBuild(buildId: string, allowRepair = true): Promise<BuildWorkspace> {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    if (['opencode-running', 'verifying'].includes(build.status)) throw new Error('Project has active work');
    build.status = 'verifying';
    this.persistBuild(build);
    void this.verifyAndRepair(build, build.prompt, allowRepair).then((passed) => {
      build.status = passed ? 'completed' : 'failed'; this.persistBuild(build);
      this.startNextQueuedUpdate(build.id);
    }).catch((error) => this.failVerification(build, error));
    return build;
  }

  getBuildCheckpoints(buildId: string): Checkpoint[] {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    return this.checkpoints.list(build.root);
  }

  restoreBuildCheckpoint(buildId: string, checkpointId: string): { restored: string[]; backup: Checkpoint; build: BuildWorkspace } {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    if (['opencode-running', 'verifying'].includes(build.status) || this.hasRunningBuildUpdate(buildId)) throw new Error('Wait for active work before restoring');
    this.stopPreview(buildId);
    const result = this.checkpoints.restore(build.root, checkpointId);
    build.status = 'created';
    build.verification = { phase: 'pending', pass: 0, issues: [], artifacts: [] };
    this.persistBuild(build);
    return { ...result, build };
  }

  planBuildStack(prompt: string): BuildStackPlan {
    const text = prompt.toLowerCase();
    const commonAgents = ['framework-expert-router', 'opencode-build-agent', 'build-doctor-agent', 'qa-agent', 'memory-agent'];
    let plan: BuildStackPlan;

    if (/\blaravel\b/.test(text)) {
      plan = this.stackPlan('PHP', 'Laravel', 'PHP 8.2+', 'Composer', ['php', 'laravel', 'composer'], commonAgents, ['composer install', 'copy .env.example .env', 'php artisan key:generate'], 'php artisan serve --host=0.0.0.0 --port={port}', ['composer validate --no-check-publish', 'php artisan optimize'], ['php artisan test'], ['Prompt explicitly requests Laravel.']);
    } else if (/\bwordpress\b|\bwp[- ]?cli\b/.test(text)) {
      plan = this.stackPlan('PHP', 'WordPress', 'PHP 8.1+', 'Composer / WP-CLI', ['php', 'wordpress', 'composer', 'mysql'], commonAgents, ['composer install'], 'php -S 0.0.0.0:{port} -t .', ['composer validate --no-check-publish'], ['composer test'], ['Prompt explicitly requests WordPress or WP-CLI.']);
    } else if (/\bphp\b|\bcomposer(?:\.json)?\b/.test(text)) {
      plan = this.stackPlan('PHP', 'PHP', 'PHP 8.1+', 'Composer', ['php', 'composer'], commonAgents, ['composer install'], 'php -S 0.0.0.0:{port} -t public', ['composer validate --no-check-publish'], ['composer test'], ['Prompt explicitly requests PHP or Composer.']);
    } else if (/\breact[ -]?native\b|\bexpo\b/.test(text)) {
      plan = this.stackPlan('TypeScript', 'React Native / Expo', 'Node.js', 'npm', ['typescript', 'react-native', 'expo', 'node', 'npm'], [...commonAgents, 'react-agent'], ['npm install'], 'npx expo start --web --port {port}', ['npx expo export --platform web'], ['npm test -- --runInBand'], ['Prompt requests React Native or Expo.']);
    } else if (/\bnext(?:\.js|js)?\b/.test(text)) {
      plan = this.stackPlan('TypeScript', 'Next.js', 'Node.js', 'npm', ['typescript', 'react', 'nextjs', 'node', 'npm'], [...commonAgents, 'react-agent'], ['npm install'], 'npm run dev -- --hostname 0.0.0.0 --port {port}', ['npm run build'], ['npm test -- --runInBand'], ['Prompt requests Next.js.']);
    } else if (/\bvue(?:\.js|js)?\b/.test(text)) {
      plan = this.stackPlan('TypeScript', 'Vue', 'Node.js', 'npm', ['typescript', 'vue', 'vite', 'node', 'npm'], commonAgents, ['npm install'], 'npm run dev -- --host 0.0.0.0 --port {port}', ['npm run build'], ['npm test -- --runInBand'], ['Prompt requests Vue.']);
    } else if (/\bsvelte(?:kit)?\b/.test(text)) {
      plan = this.stackPlan('TypeScript', 'SvelteKit', 'Node.js', 'npm', ['typescript', 'svelte', 'vite', 'node', 'npm'], commonAgents, ['npm install'], 'npm run dev -- --host 0.0.0.0 --port {port}', ['npm run build'], ['npm test -- --runInBand'], ['Prompt requests Svelte or SvelteKit.']);
    } else if (/\bangular\b/.test(text)) {
      plan = this.stackPlan('TypeScript', 'Angular', 'Node.js', 'npm', ['typescript', 'angular', 'node', 'npm'], commonAgents, ['npm install'], 'npm start -- --host 0.0.0.0 --port {port}', ['npm run build'], ['npm test -- --watch=false'], ['Prompt requests Angular.']);
    } else if (/\bdjango\b/.test(text)) {
      plan = this.stackPlan('Python', 'Django', 'Python 3.11+', 'pip', ['python', 'django'], commonAgents, ['python -m pip install -r requirements.txt', 'python manage.py migrate'], 'python manage.py runserver 0.0.0.0:{port}', ['python manage.py check'], ['python manage.py test'], ['Prompt requests Django.']);
    } else if (/\bfastapi\b/.test(text)) {
      plan = this.stackPlan('Python', 'FastAPI', 'Python 3.11+', 'pip', ['python', 'fastapi'], commonAgents, ['python -m pip install -r requirements.txt'], 'python -m uvicorn app.main:app --host 0.0.0.0 --port {port}', ['python -m compileall app'], ['python -m pytest'], ['Prompt requests FastAPI.']);
    } else if (/\bpython\b|\bflask\b|\bpyproject\.toml\b/.test(text)) {
      plan = this.stackPlan('Python', /\bflask\b/.test(text) ? 'Flask' : 'Python Web', 'Python 3.11+', 'pip', ['python'], commonAgents, ['python -m pip install -r requirements.txt'], 'python -m http.server {port}', ['python -m compileall .'], ['python -m pytest'], ['Prompt explicitly requests Python.']);
    } else if (/\bruby on rails\b|\brails\b/.test(text)) {
      plan = this.stackPlan('Ruby', 'Ruby on Rails', 'Ruby', 'Bundler', ['ruby'], commonAgents, ['bundle install', 'bin/rails db:prepare'], 'bundle exec rails server -b 0.0.0.0 -p {port}', ['bundle exec rails zeitwerk:check'], ['bundle exec rails test'], ['Prompt requests Ruby on Rails.']);
    } else if (/\bgolang\b|\bgo (?:app|api|server|service)\b/.test(text)) {
      plan = this.stackPlan('Go', 'Go Web', 'Go', 'Go modules', ['go'], commonAgents, ['go mod download'], 'go run .', ['go build ./...'], ['go test ./...'], ['Prompt requests Go.']);
    } else if (/\brust\b|\bcargo\b/.test(text)) {
      plan = this.stackPlan('Rust', 'Rust Web', 'Rust', 'Cargo', ['rust', 'cargo'], commonAgents, ['cargo fetch'], 'cargo run', ['cargo build'], ['cargo test'], ['Prompt requests Rust or Cargo.']);
    } else if (/\basp\.net\b|\.net\b|c#|\bc-?sharp\b/.test(text)) {
      plan = this.stackPlan('C#', 'ASP.NET Core', '.NET', 'NuGet', ['csharp-dotnet'], commonAgents, ['dotnet restore'], 'dotnet run --urls http://0.0.0.0:{port}', ['dotnet build'], ['dotnet test'], ['Prompt requests .NET or C#.']);
    } else if (/\bspring(?: boot)?\b|\bmaven\b|\bjava\b/.test(text)) {
      plan = this.stackPlan('Java', 'Spring Boot', 'JDK', /\bgradle\b/.test(text) ? 'Gradle' : 'Maven', ['java', /\bgradle\b/.test(text) ? 'gradle' : 'maven'], commonAgents, [/\bgradle\b/.test(text) ? 'gradle dependencies' : 'mvn dependency:resolve'], /\bgradle\b/.test(text) ? 'gradle bootRun --args=--server.port={port}' : 'mvn spring-boot:run -Dspring-boot.run.arguments=--server.port={port}', [/\bgradle\b/.test(text) ? 'gradle build' : 'mvn package'], [/\bgradle\b/.test(text) ? 'gradle test' : 'mvn test'], ['Prompt requests Java or Spring.']);
    } else {
      plan = this.stackPlan('TypeScript', 'React + Vite', 'Node.js', 'npm', ['typescript', 'react', 'vite', 'node', 'npm'], [...commonAgents, 'react-agent'], ['npm install'], 'npm run dev -- --host 0.0.0.0 --port {port}', ['npm run build'], ['npm test -- --runInBand'], [/\breact\b/.test(text) ? 'Prompt explicitly requests React.' : 'No explicit backend stack was requested; React + Vite is the browser-app default.']);
    }

    const capabilities: Array<[RegExp, string[]]> = [
      [/\bpostgres(?:ql)?\b/, ['postgres']], [/\bmysql\b/, ['mysql']], [/\bsqlite\b/, ['sqlite']], [/\bmongo(?:db)?\b/, ['mongodb']],
      [/\bredis\b/, ['redis']], [/\bsupabase\b/, ['supabase']], [/\bfirebase\b/, ['firebase']], [/\bprisma\b/, ['prisma']], [/\bdrizzle\b/, ['drizzle']],
      [/\bstripe\b|\bpayments?\b/, ['stripe']], [/\bauth(?:entication)?\b|\boauth\b|\blogin\b/, ['oauth2', 'jwt']],
      [/\bgraphql\b/, ['graphql']], [/\bopenapi\b|\bswagger\b|\brest api\b/, ['openapi', 'rest']], [/\bwebsockets?\b/, ['websocket']],
      [/\bdocker\b|\bcontainer(?:ize|ized)?\b/, ['docker']], [/\baws\b/, ['aws']], [/\bazure\b/, ['azure']], [/\bgcp\b|\bgoogle cloud\b/, ['gcp']],
      [/\bthree(?:\.js|js)?\b|\b3d\b/, ['threejs']], [/\btailwind\b/, ['tailwind']], [/\bstorybook\b/, ['storybook']],
    ];
    for (const [pattern, expertIds] of capabilities) {
      if (pattern.test(text)) plan.expertIds.push(...expertIds);
    }
    if (/\b(api|database|schema|migration|backend)\b/.test(text)) plan.projectAgentIds.push('api-agent', 'database-agent');
    plan.expertIds.push('accessibility', 'playwright', 'owasp');
    plan.expertIds = Array.from(new Set(plan.expertIds)).filter((id) => getLanguageExperts().some((expert) => expert.id === id));
    plan.projectAgentIds = Array.from(new Set(plan.projectAgentIds)).filter((id) => getProjectAgentSwarm().agents.some((agent) => agent.id === id));
    return plan;
  }

  private stackPlan(primaryLanguage: string, framework: string, runtime: string, packageManager: string, expertIds: string[], projectAgentIds: string[], setupCommands: string[], devCommand: string, buildCommands: string[], testCommands: string[], evidence: string[]): BuildStackPlan {
    return { primaryLanguage, framework, runtime, packageManager, expertIds, projectAgentIds, setupCommands, devCommand, buildCommands, testCommands, evidence };
  }

  getProviders(): AiProviderProfile[] {
    return [
      { id: 'openai', name: 'OpenAI', kind: 'cloud', env: ['OPENAI_API_KEY'], capabilities: ['chat', 'vision', 'code', 'tools'], recommendedFor: ['codegen', 'ui reasoning', 'planning'] },
      { id: 'anthropic', name: 'Anthropic Claude', kind: 'cloud', env: ['ANTHROPIC_API_KEY'], capabilities: ['chat', 'vision', 'long-context', 'code'], recommendedFor: ['large code review', 'planning', 'agent reasoning'] },
      { id: 'gemini', name: 'Google Gemini', kind: 'cloud', env: ['GEMINI_API_KEY'], capabilities: ['chat', 'vision', 'large-context'], recommendedFor: ['research synthesis', 'multimodal UI analysis'] },
      { id: 'openrouter', name: 'OpenRouter', kind: 'openai-compatible', env: ['OPENROUTER_API_KEY'], capabilities: ['model-router', 'chat', 'code'], recommendedFor: ['model choice', 'fallback routing'] },
      { id: 'ollama', name: 'Ollama', kind: 'local', env: ['OLLAMA_BASE_URL'], capabilities: ['local', 'privacy', 'offline'], recommendedFor: ['private research', 'cheap iteration'] },
      { id: 'lmstudio', name: 'LM Studio', kind: 'local', env: ['LMSTUDIO_BASE_URL'], capabilities: ['local', 'openai-compatible'], recommendedFor: ['local coding models'] },
      { id: 'github-models', name: 'GitHub Models', kind: 'cloud', env: ['GITHUB_TOKEN'], capabilities: ['chat', 'code'], recommendedFor: ['GitHub-native workflows'] },
      { id: 'groq', name: 'Groq', kind: 'cloud', env: ['GROQ_API_KEY'], capabilities: ['fast-inference', 'chat', 'code'], recommendedFor: ['fast iteration', 'cheap retries'] },
      { id: 'xai', name: 'xAI', kind: 'cloud', env: ['XAI_API_KEY'], capabilities: ['chat', 'vision', 'reasoning'], recommendedFor: ['planning', 'visual reasoning'] },
      { id: 'deepseek', name: 'DeepSeek', kind: 'cloud', env: ['DEEPSEEK_API_KEY'], capabilities: ['code', 'chat', 'reasoning'], recommendedFor: ['codegen', 'repair'] },
      { id: 'mistral', name: 'Mistral', kind: 'cloud', env: ['MISTRAL_API_KEY'], capabilities: ['chat', 'code'], recommendedFor: ['European-hosted tasks', 'code review'] },
      { id: 'cohere', name: 'Cohere', kind: 'cloud', env: ['COHERE_API_KEY'], capabilities: ['chat', 'rag', 'embeddings'], recommendedFor: ['research synthesis', 'retrieval'] },
      { id: 'together', name: 'Together AI', kind: 'cloud', env: ['TOGETHER_API_KEY'], capabilities: ['open-models', 'chat', 'code'], recommendedFor: ['open-source model routing'] },
      { id: 'perplexity', name: 'Perplexity', kind: 'cloud', env: ['PERPLEXITY_API_KEY'], capabilities: ['search-grounded', 'chat'], recommendedFor: ['current web research'] },
      { id: 'huggingface', name: 'Hugging Face', kind: 'cloud', env: ['HUGGINGFACE_API_KEY'], capabilities: ['model-hub', 'open-models'], recommendedFor: ['specialized models'] },
      { id: 'moonshot', name: 'Moonshot Kimi', kind: 'cloud', env: ['MOONSHOT_API_KEY'], capabilities: ['long-context', 'chat', 'code'], recommendedFor: ['large research packets'] },
      { id: 'hyperbolic', name: 'Hyperbolic', kind: 'cloud', env: ['HYPERBOLIC_API_KEY'], capabilities: ['open-models', 'inference'], recommendedFor: ['alternate model hosting'] },
      { id: 'bedrock', name: 'Amazon Bedrock', kind: 'cloud', env: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'], capabilities: ['enterprise', 'model-router'], recommendedFor: ['AWS deployments', 'enterprise controls'] },
      { id: 'azure-openai', name: 'Azure OpenAI', kind: 'openai-compatible', env: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'], capabilities: ['enterprise', 'chat', 'code'], recommendedFor: ['enterprise OpenAI deployments'] },
      { id: 'vertex-ai', name: 'Vertex AI', kind: 'cloud', env: ['GOOGLE_APPLICATION_CREDENTIALS', 'VERTEX_AI_PROJECT'], capabilities: ['gemini', 'enterprise'], recommendedFor: ['Google Cloud deployments'] },
      { id: 'openai-compatible', name: 'OpenAI Compatible', kind: 'openai-compatible', env: ['OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_API_KEY'], capabilities: ['custom-endpoint', 'chat', 'code'], recommendedFor: ['self-hosted gateways', 'new providers'] },
    ];
  }

  getBuildBrains(): BuildBrainProfile[] {
    return [
      this.createBuildBrain('opencode', 'opencode'),
      this.createBuildBrain('hybrid', process.env.LLM_PROVIDER || 'openai'),
      this.createBuildBrain('ollama', 'ollama', process.env.OLLAMA_MODEL || 'qwen2.5-coder'),
      this.createBuildBrain('cloud', process.env.LLM_PROVIDER || 'openai'),
    ];
  }

  getCodeExecutionBackends(): CodeExecutionBackend[] {
    const cfg = config.get().codeExecution;
    return [
      {
        id: 'local',
        name: 'Local CLI',
        kind: 'opencode-cli',
        command: `${cfg.localCli} ${cfg.localArgs.join(' ')}`.trim(),
        model: cfg.ollamaModel,
        status: cfg.localCli ? 'configured' : 'missing-config',
        notes: ['Runs on this machine.', `Ollama URL: ${cfg.ollamaBaseUrl}`, 'Use for private/local builds, including Ollama-backed coding models.'],
      },
      {
        id: 'remote',
        name: cfg.remoteKind === 'codex' ? 'Remote Codex Server' : 'Remote OpenCode Server',
        kind: cfg.remoteKind === 'codex' ? 'codex-server' : 'opencode-server',
        url: cfg.remoteUrl,
        status: cfg.remoteUrl ? 'configured' : 'missing-config',
        notes: ['Runs build/update/repair prompts on a cloud or LAN agent server.', 'Expected endpoint: POST /runs with { workspace, prompt, mode, metadata }.'],
      },
      {
        id: 'custom',
        name: 'Custom Code Server',
        kind: 'custom-server',
        url: cfg.remoteUrl,
        status: cfg.remoteUrl ? 'configured' : 'missing-config',
        notes: ['Use for your own OpenCode-compatible, Codex-compatible, or custom executor service.', 'Set CODE_EXECUTION_REMOTE_KIND=custom.'],
      },
    ];
  }

  private createBuildBrain(mode: BuildBrainMode, provider: string, model?: string): BuildBrainProfile {
    const normalizedProvider = provider || (mode === 'ollama' ? 'ollama' : mode === 'opencode' ? 'opencode' : 'openai');
    const defaultModel = model || (normalizedProvider === 'ollama' ? process.env.OLLAMA_MODEL || 'qwen2.5-coder' : normalizedProvider === 'anthropic' ? process.env.ANTHROPIC_MODEL : normalizedProvider === 'gemini' ? process.env.GEMINI_MODEL : process.env.OPENAI_MODEL);
    return {
      mode,
      provider: normalizedProvider,
      model: defaultModel,
      executor: this.currentExecutorId(),
      notes: mode === 'opencode'
        ? [`${this.currentExecutorLabel()} performs planning, file edits, commands, and repair directly.`]
        : mode === 'hybrid'
          ? [`Nexus routes strategy to the selected AI provider, then ${this.currentExecutorLabel()} executes file edits and shell commands.`, 'Use this as the default for strongest app-building behavior.']
          : mode === 'ollama'
            ? [`Use local Ollama (${config.get().codeExecution.ollamaModel}) for private planning/review when available, with ${this.currentExecutorLabel()} as executor.`, 'Falls back to Nexus deterministic builder if local model is unavailable.']
            : [`Use selected cloud AI for planning/code reasoning, with ${this.currentExecutorLabel()} as executor and Nexus browser QA.`],
    };
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

  private currentExecutorId(): BuildBrainProfile['executor'] {
    const cfg = config.get().codeExecution;
    if (cfg.mode === 'remote' && cfg.remoteKind === 'codex') return 'remote-codex';
    if (cfg.mode === 'remote' || cfg.mode === 'custom') return 'custom-opencode';
    return 'opencode';
  }

  private currentExecutorLabel(): string {
    const cfg = config.get().codeExecution;
    if (cfg.mode === 'local') return `${cfg.localCli} local CLI`;
    if (cfg.remoteKind === 'codex') return 'remote Codex server';
    if (cfg.remoteKind === 'custom') return 'custom code server';
    return 'remote OpenCode server';
  }

  private isOpenCodeLocalCli(): boolean {
    const cli = path.basename(config.get().codeExecution.localCli).toLowerCase().replace(/\.(cmd|exe|ps1)$/, '');
    return cli === 'opencode';
  }

  private localCodeExecutionArgs(prompt: string, mode: string, promptFile?: string): string[] {
    const cfg = config.get().codeExecution;
    if (promptFile && this.isOpenCodeLocalCli()) {
      const instruction = `Read the attached Nexus ${mode} brief, complete the requested work in the current workspace, run appropriate checks, and summarize the result.`;
      return [...cfg.localArgs, instruction, '--file', promptFile];
    }
    return [...cfg.localArgs, prompt];
  }

  private codeExecutionCommand(prompt: string, mode: string, promptFile?: string): string {
    const cfg = config.get().codeExecution;
    if (cfg.mode === 'local') {
      return [cfg.localCli, ...this.localCodeExecutionArgs(prompt, mode, promptFile)]
        .map((part) => /\s/.test(part) ? JSON.stringify(part) : part)
        .join(' ');
    }
    return `${cfg.remoteKind} server ${cfg.remoteUrl || '(CODE_EXECUTION_REMOTE_URL not set)'}`;
  }

  private localExecutorCommand(args: string[]): { command: string; args: string[] } {
    const cli = config.get().codeExecution.localCli;
    if (process.platform !== 'win32') return { command: cli, args };
    if (/\.exe$/i.test(cli)) return { command: cli, args };
    if (this.isOpenCodeLocalCli()) {
      const locations = path.isAbsolute(cli) ? [path.dirname(cli)] : (process.env.PATH || '').split(path.delimiter);
      for (const location of locations) {
        const binary = path.join(location, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
        if (fs.existsSync(binary)) return { command: binary, args };
      }
    }
    return { command: 'cmd.exe', args: ['/c', cli, ...args] };
  }

  private launchCodeExecution(workspace: string, prompt: string, mode: string, logPath: string, onExit?: (code: number | null) => void, onError?: (error: Error) => void, promptFile?: string): ChildProcess | undefined {
    const cfg = config.get().codeExecution;
    fs.writeFileSync(logPath, `Nexus code execution backend: ${cfg.mode} (${cfg.remoteKind})\nWorkspace: ${workspace}\nMode: ${mode}\nPrompt file: ${promptFile || 'inline'}\n\n`, { flag: 'a' });

    if (cfg.mode === 'remote' || cfg.mode === 'custom') {
      void this.callRemoteCodeExecution(workspace, prompt, mode, logPath)
        .then(() => onExit?.(0))
        .catch((error) => onError?.(error));
      return undefined;
    }

    const localArgs = this.localCodeExecutionArgs(prompt, mode, promptFile);
    const commandParts = this.localExecutorCommand(localArgs);
    const runtime = this.prepareCodeExecutionEnvironment(workspace);
    const child = spawn(commandParts.command, commandParts.args, {
      cwd: workspace,
      env: runtime.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    const log = fs.createWriteStream(logPath, { flags: 'a' });
    let reported = false;
    const reportExit = (code: number | null) => {
      if (reported) return;
      reported = true;
      onExit?.(code);
    };
    const safeLogWrite = (message: string) => {
      if (!log.destroyed && log.writable) log.write(message);
    };
    const idleTimeoutMs = Math.max(60000, Number(process.env.CODE_EXECUTION_IDLE_TIMEOUT_MS || 300000));
    let idleTimer: NodeJS.Timeout;
    const stopIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
    };
    const resetIdleTimer = () => {
      stopIdleTimer();
      idleTimer = setTimeout(() => {
        safeLogWrite(`\nNexus stopped the executor after ${Math.round(idleTimeoutMs / 1000)} seconds without output. Verified files and logs are preserved.\n`);
        if (process.platform === 'win32' && child.pid) {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
          killer.once('error', () => child.kill());
          killer.once('close', (code) => { if (code !== 0) child.kill(); });
        } else child.kill('SIGTERM');
        // Descendants may hold stdout open after termination. Do not leave the job permanently running.
        reportExit(1);
        child.stdout.destroy(); child.stderr.destroy();
      }, idleTimeoutMs);
    };
    log.on('error', () => undefined);
    child.stdout.on('data', (chunk) => {
      safeLogWrite(chunk.toString());
      resetIdleTimer();
    });
    child.stderr.on('data', (chunk) => {
      safeLogWrite(chunk.toString());
      resetIdleTimer();
    });
    resetIdleTimer();
    child.on('close', (code) => {
      stopIdleTimer();
      safeLogWrite(`\nCode executor exited with code ${code}\n`);
      if (!log.destroyed) log.end();
      reportExit(code);
      runtime.cleanup();
    });
    child.on('error', (error) => {
      stopIdleTimer();
      safeLogWrite(`\nCode executor failed to start: ${error.message}\n`);
      if (!reported) { reported = true; onError?.(error); }
      runtime.cleanup();
    });
    return child;
  }

  private prepareCodeExecutionEnvironment(workspace: string): { env: NodeJS.ProcessEnv; cleanup: () => void } {
    const cfg = config.get().codeExecution;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OLLAMA_BASE_URL: cfg.ollamaBaseUrl,
      OLLAMA_MODEL: cfg.ollamaModel,
      npm_config_cache: path.join(workspace, '.nexus', 'npm-cache'),
    };
    if (!this.isOpenCodeLocalCli()) return { env, cleanup: () => undefined };
    let overrides: any = {};
    try { overrides = JSON.parse(env.OPENCODE_CONFIG_CONTENT || '{}'); } catch {}
    const buildAgent = overrides.agent?.build || {};
    const permissions = typeof buildAgent.permission === 'object' ? buildAgent.permission : typeof buildAgent.permission === 'string' ? { '*': buildAgent.permission } : {};
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...overrides, agent: { ...overrides.agent, build: { ...buildAgent,
      permission: { ...permissions, bash: { ...(typeof permissions.bash === 'object' ? permissions.bash : typeof permissions.bash === 'string' ? { '*': permissions.bash } : {}),
        'npm run dev*': 'deny', 'npm start*': 'deny', 'pnpm dev*': 'deny', 'pnpm run dev*': 'deny', 'yarn dev*': 'deny', 'yarn run dev*': 'deny' } },
    } } });

    const authSource = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
    const runtimeRoot = path.join(os.tmpdir(), 'nexus-browser-opencode', uuid());
    const dataHome = path.join(runtimeRoot, 'data');
    const isolatedOpenCode = path.join(dataHome, 'opencode');
    try {
      fs.mkdirSync(isolatedOpenCode, { recursive: true });
      if (fs.existsSync(authSource)) {
        const isolatedAuth = path.join(isolatedOpenCode, 'auth.json');
        // Keep token refreshes isolated too: a hard link would modify the user's login.
        fs.copyFileSync(authSource, isolatedAuth);
        fs.chmodSync(isolatedAuth, 0o600);
      }
      env.XDG_DATA_HOME = dataHome;
    } catch {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
      return { env, cleanup: () => undefined };
    }
    return {
      env,
      cleanup: () => {
        try {
          fs.rmSync(runtimeRoot, { recursive: true, force: true });
        } catch {
          // The OS can briefly retain OpenCode handles after exit; temp cleanup will catch them later.
        }
      },
    };
  }

  async reasonAboutChat(prompt: string): Promise<string> {
    if (!this.isOpenCodeLocalCli() || config.get().codeExecution.mode !== 'local') throw new Error('No chat provider or local OpenCode reasoning configured');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-chat-reasoning-'));
    const runtime = this.prepareCodeExecutionEnvironment(root);
    try {
      const brief = path.join(root, 'request.txt');
      fs.writeFileSync(brief, prompt);
      let overrides: any = {};
      try { overrides = JSON.parse(runtime.env.OPENCODE_CONFIG_CONTENT || '{}'); } catch {}
      runtime.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...overrides, agent: { ...overrides.agent, 'nexus-router': { description: 'Nexus intent router; returns JSON without tools', mode: 'primary', permission: { '*': 'deny' } } } });
      const args = [...config.get().codeExecution.localArgs, 'Return only the requested JSON from the attached brief. Do not use tools.', '--file', brief, '--format', 'json', '--agent', 'nexus-router'];
      const commandParts = this.localExecutorCommand(args);
      const result = await this.runCommand(root, commandParts.command, commandParts.args, 75000, runtime.env);
      if (result.code !== 0 || result.timedOut) throw new Error('OpenCode chat reasoning failed: ' + this.cleanExecutorLog(result.stderr).slice(-400));
      const text = result.stdout.split(/\r?\n/).flatMap((line) => {
        try { const event = JSON.parse(line); return event.type === 'text' && event.part?.text ? [event.part.text] : []; } catch { return []; }
      }).join('\n');
      if (!text) throw new Error('OpenCode returned no chat reasoning');
      return text;
    } finally {
      runtime.cleanup();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  private async callRemoteCodeExecution(workspace: string, prompt: string, mode: string, logPath: string, timeoutMs = 600000): Promise<void> {
    const cfg = config.get().codeExecution;
    if (!cfg.remoteUrl) throw new Error('CODE_EXECUTION_REMOTE_URL is required for remote/custom code execution');

    const response = await fetch(`${cfg.remoteUrl.replace(/\/$/, '')}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.remoteApiKey ? { Authorization: `Bearer ${cfg.remoteApiKey}` } : {}),
      },
      body: JSON.stringify({
        workspace,
        prompt,
        mode,
        kind: cfg.remoteKind,
        metadata: {
          source: 'nexus-browser',
          ollamaBaseUrl: cfg.ollamaBaseUrl,
          ollamaModel: cfg.ollamaModel,
        },
      }),
      signal: AbortSignal.timeout(Math.min(timeoutMs, 30000)),
    });
    const text = await response.text();
    fs.writeFileSync(logPath, `${text}\n`, { flag: 'a' });
    if (!response.ok) throw new Error(`Remote code executor failed: ${response.status} ${text}`);
    let state: any;
    try { state = JSON.parse(text); } catch { throw new Error('Remote executor must return structured run status, not an acknowledgement'); }
    const started = Date.now();
    while (['queued', 'running'].includes(state.status)) {
      if (!state.id || Date.now() - started >= timeoutMs) throw new Error('Remote executor did not complete within the job timeout');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const poll = await fetch(`${cfg.remoteUrl.replace(/\/$/, '')}/runs/${encodeURIComponent(state.id)}`, {
        headers: cfg.remoteApiKey ? { Authorization: `Bearer ${cfg.remoteApiKey}` } : {},
        signal: AbortSignal.timeout(Math.min(30000, Math.max(1, timeoutMs - (Date.now() - started)))),
      });
      if (!poll.ok) throw new Error(`Remote run status failed: ${poll.status}`);
      state = await poll.json();
      fs.writeFileSync(logPath, `${JSON.stringify(state)}\n`, { flag: 'a' });
    }
    if (state.status !== 'completed' || state.workspaceSynced !== true) throw new Error('Remote run must complete and synchronize workspace files before local browser verification');
  }

  private async runCodeExecutionBlocking(workspace: string, prompt: string, mode: string, logPath: string, timeoutMs: number, promptFile?: string): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
    const cfg = config.get().codeExecution;
    if (cfg.mode === 'remote' || cfg.mode === 'custom') {
      try {
        await this.callRemoteCodeExecution(workspace, prompt, mode, logPath, timeoutMs);
        return { stdout: 'Remote code executor completed.', stderr: '', code: 0, timedOut: false };
      } catch (error: any) {
        return { stdout: '', stderr: error.message, code: 1, timedOut: false };
      }
    }

    const localArgs = this.localCodeExecutionArgs(prompt, mode, promptFile);
    const commandParts = this.localExecutorCommand(localArgs);
    const runtime = this.prepareCodeExecutionEnvironment(workspace);
    try {
      return await this.runCommand(workspace, commandParts.command, commandParts.args, timeoutMs, runtime.env);
    } finally {
      runtime.cleanup();
    }
  }

  getOpenCodeSessions(): OpenCodeSessionStub[] {
    return Array.from(this.sessions.values());
  }

  startBuildFromPrompt(prompt: string, options: { workspaceRoot?: string; uiLook?: string; mode?: string; browserContext?: string; brainMode?: BuildBrainMode; aiProvider?: string; aiModel?: string; reference?: BuildWorkspace['reference'] } = {}): BuildWorkspace {
    const id = uuid().slice(0, 8);
    const name = this.safeProjectName(prompt) || `nexus-app-${id}`;
    const root = path.join(path.resolve(options.workspaceRoot || path.join(process.cwd(), 'generated-apps')), `${name}-${id}`);
    const logPath = path.join(root, 'opencode-build.log');
    const previewLogPath = path.join(root, 'preview.log');
    const brain = this.createBuildBrain(options.brainMode || 'hybrid', options.aiProvider || 'openai', options.aiModel);
    const stackPlan = this.planBuildStack(prompt);
    const opencodePrompt = this.buildOpenCodeAppPrompt(prompt, options.uiLook || 'modern-saas', brain, stackPlan, options.browserContext);

    fs.mkdirSync(root, { recursive: true });
    this.writeStarterApp(root, name, prompt, stackPlan);
    this.writeStackAgentManifest(root, stackPlan);
    const promptFile = path.join(root, 'OPENCODE_BUILD_PROMPT.md');
    fs.writeFileSync(promptFile, opencodePrompt);

    const command = this.codeExecutionCommand(opencodePrompt, options.mode || 'build', promptFile);
    const session = this.createOpenCodeSession(root, opencodePrompt, options.mode || 'build');
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
      previewCommand: stackPlan.devCommand,
      brain,
      reference: options.reference,
      stackPlan,
      executorSessionId: session.id,
      createdAt: new Date().toISOString(),
    };
    this.builds.set(id, build);
    this.routeExperts(id);

    try {
      session.status = 'running';
      let settled = false;
      const finish = (status: BuildWorkspace['status'], sessionStatus: OpenCodeSessionStub['status']) => {
        if (settled) return;
        settled = true;
        this.buildProcesses.delete(id);
        build.status = status;
        session.status = sessionStatus;
        this.persistBuild(build);
        this.startNextQueuedUpdate(id);
      };
      const child = this.launchCodeExecution(root, opencodePrompt, options.mode || 'build', logPath, (code) => {
        if (code !== 0) {
          finish('failed', 'failed');
          return;
        }
        build.status = 'verifying';
        this.persistBuild(build);
        void this.verifyAndRepair(build).then((passed) => {
          finish(passed ? 'completed' : 'failed', passed ? 'completed' : 'failed');
          this.persistBuild(build);
        }).catch((error) => {
          this.failVerification(build, error);
          finish('failed', 'failed');
          this.persistBuild(build);
        });
      }, () => {
        finish('opencode-unavailable', 'failed');
      }, promptFile);
      if (child) this.buildProcesses.set(id, child);
      build.status = 'opencode-running';
      this.persistBuild(build);
    } catch (error: any) {
      fs.writeFileSync(logPath, `Code executor could not be launched automatically. Run this manually from ${root}:\n${command}\n\n${error.message}\n`);
      build.status = 'opencode-unavailable';
      session.status = 'failed';
    }

    return build;
  }

  getBuilds(): BuildWorkspace[] {
    this.hydrateGeneratedBuilds();
    return Array.from(this.builds.values());
  }

  getBuild(buildId: string): BuildWorkspace | undefined {
    return this.builds.get(buildId) || this.hydrateGeneratedBuild(buildId);
  }

  getBuildActivity(buildId: string, updateId?: string): BuildActivity {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    const update = updateId
      ? this.getBuildUpdates().find((item) => item.buildId === buildId && item.id === updateId) || this.hydrateBuildUpdate(build, updateId)
      : undefined;
    if (updateId && !update) throw new Error('Build update not found');
    const session = update?.session || (build.executorSessionId ? this.sessions.get(build.executorSessionId) : undefined);
    const logPath = update?.logPath || build.logPath;
    const log = this.cleanExecutorLog(fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').slice(-20000) : '');
    const status = update?.status || build.status;
    const pendingUpdates = this.getBuildUpdates().filter((item) => item.buildId === buildId && item.id !== updateId && ['queued', 'running', 'verifying'].includes(item.status)).length;
    return {
      build,
      update,
      session,
      kind: update ? 'update' : 'build',
      status,
      terminal: ['created', 'prepared', 'completed', 'failed', 'opencode-unavailable'].includes(status) && pendingUpdates === 0,
      pendingUpdates,
      log,
      progress: this.buildProgress(build, status, log, update ? 'update' : 'build', pendingUpdates),
    };
  }

  private cleanExecutorLog(value: string): string {
    const withoutAnsi = value
      .split(String.fromCharCode(27))
      .map((part, index) => index ? part.replace(/^\[[0-9;?]*[ -/]*[@-~]/, '') : part)
      .join('');
    return withoutAnsi
      .replace(/\r/g, '')
      .trim();
  }

  private buildProgress(build: BuildWorkspace, status: BuildActivity['status'], log: string, kind: BuildActivity['kind'], pendingUpdates: number): BuildProgress {
    const completed = status === 'completed';
    const failed = ['failed', 'opencode-unavailable'].includes(status);
    const running = ['opencode-running', 'running', 'verifying'].includes(status);
    const queued = status === 'queued';
    const verificationObserved = /(?:^|\n)\$\s+(?:npm run build|npm test|pnpm |yarn |composer |php artisan test|python -m pytest|cargo (?:build|test)|go (?:build|test))/i.test(log);
    const filesChanged = /% Patch|← (?:Write|Edit)|created?\s+\d+\s+files?|implemented with/i.test(log);
    const verified = completed && build.verification?.phase === 'passed';
    const implementationStatus: BuildProgressStep['status'] = failed ? 'failed' : completed || status === 'verifying' ? 'completed' : running ? 'running' : 'pending';
    const verificationStatus: BuildProgressStep['status'] = verified ? 'completed' : failed && build.verification?.phase === 'failed' ? 'failed' : status === 'verifying' ? 'running' : 'pending';
    const previewStatus: BuildProgressStep['status'] = verified
      ? 'completed'
      : build.previewStatus === 'starting'
        ? 'running'
        : build.previewStatus === 'failed'
          ? 'failed'
          : 'pending';
    const steps: BuildProgressStep[] = [
      { id: 'workspace', label: 'Workspace', status: 'completed', detail: 'Starter files and project brief created' },
      { id: 'routing', label: 'Agent routing', status: 'completed', detail: `${build.stackPlan?.framework || 'Stack'} team and specialists selected` },
      { id: 'implementation', label: kind === 'update' ? 'Apply update' : 'Implementation', status: implementationStatus, detail: queued ? 'Waiting behind the active executor' : failed ? 'Executor stopped before completing the requested work' : completed || verificationObserved ? 'Requested files were implemented' : filesChanged ? 'Build agent is applying the requested product changes' : 'Build agent is inspecting files and implementing the product' },
      { id: 'verification', label: 'Independent checks', status: verificationStatus, detail: build.verification?.phase === 'passed' ? 'Build and product workflows verified independently' : build.verification?.issues.join('; ') || 'Nexus will compile and exercise the requested product' },
      { id: 'preview', label: 'Browser QA', status: previewStatus, detail: previewStatus === 'completed' ? 'Product outcomes passed on desktop and mobile' : 'Browser workflows, screenshots, console, network, and overflow checks' },
    ];
    const recentOutput = log
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^(Nexus code execution backend|Workspace:|Mode:|Prompt file:)/i.test(line))
      .slice(-6);
    const failure: BuildProgress['failure'] = failed && build.verification?.phase === 'failed'
      ? { code: 'verification-failed', title: 'Product verification failed', detail: build.verification.issues.join('\n'), recovery: 'Continue from the browser evidence or restore a saved version. The workspace and screenshots are preserved.' }
      : failed ? this.classifyExecutorFailure(log) : undefined;
    const phase = status === 'verifying' ? `Nexus ${build.verification?.phase || 'verification'} (pass ${build.verification?.pass || 1})` : failed
      ? failure?.title || 'Build stopped'
      : previewStatus === 'completed'
        ? 'Browser preview ready'
        : previewStatus === 'running'
          ? 'Starting browser preview'
          : completed
            ? 'Implementation complete'
            : verificationObserved
              ? 'Running build checks'
            : queued
              ? 'Queued'
              : running
                ? 'Agents implementing'
                : 'Preparing build';
    const summary = status === 'verifying' ? 'Nexus is verifying the rendered product and repairing failures from browser evidence.' : failed
      ? failure?.detail || 'The executor stopped before the build completed.'
      : completed
        ? pendingUpdates
          ? `Implementation completed; ${pendingUpdates} follow-up ${pendingUpdates === 1 ? 'request is' : 'requests are'} still queued.`
          : 'Implementation and executor checks completed. Preparing preview and browser QA.'
        : queued
          ? 'This request is queued behind the active build.'
          : 'Nexus agents are applying the selected skills and stack expertise to the workspace.';
    const percent = verified ? 100 : failed ? 45 : queued ? 20 : status === 'verifying' ? build.verification?.phase === 'browser' ? 90 : build.verification?.phase === 'repair' ? 70 : 80 : filesChanged ? 58 : running ? 45 : 12;
    const agents = Array.from(new Set([
      ...(build.stackPlan?.projectAgentIds || []),
      ...(build.stackPlan?.expertIds || []),
    ])).slice(0, 14);
    return { phase, summary, percent, agents, steps, recentOutput, failure };
  }

  private classifyExecutorFailure(log: string): BuildProgress['failure'] {
    if (/cannot connect to api|unable to connect|econnrefused|enotfound|network.*(?:failed|error)/i.test(log)) {
      return {
        code: 'executor-connection',
        title: 'Executor connection failed',
        detail: 'The code executor could not reach its configured model API, so implementation stopped before the app was completed.',
        recovery: 'Check the OpenCode provider connection and network access, then retry. The generated workspace and build brief are preserved.',
      };
    }
    if (/unauthorized|forbidden|invalid api key|authentication|missing.*(?:key|token)|401|403/i.test(log)) {
      return {
        code: 'executor-auth',
        title: 'Executor authentication failed',
        detail: 'The configured code model rejected the executor credentials.',
        recovery: 'Reconnect or update the OpenCode provider credentials, then retry this build.',
      };
    }
    if (/not recognized as an internal|command not found|enoent|failed to start/i.test(log)) {
      return {
        code: 'executor-missing',
        title: 'Code executor unavailable',
        detail: 'Nexus could not start the configured code executor on this machine.',
        recovery: 'Install or configure the local executor, or select a remote executor, then retry.',
      };
    }
    const lastError = log.split(/\n/).map((line) => line.trim()).filter((line) => /error|failed|exited with code/i.test(line)).slice(-1)[0];
    return {
      code: 'executor-failed',
      title: 'Implementation failed',
      detail: lastError || 'The code executor exited before completing the build.',
      recovery: 'Run Build Doctor to classify the failure, then retry from the preserved workspace.',
    };
  }

  private executorLogShowsVerifiedBuild(_logPath: string): boolean {
    // An executor's prose is never independent verification.
    return false;
  }

  private hydrateBuildUpdate(build: BuildWorkspace, updateId: string): BuildUpdateRun | undefined {
    const outputDir = path.join(build.root, '.nexus', 'chat-updates', updateId);
    const promptFile = path.join(outputDir, 'opencode-update-prompt.md');
    const logPath = path.join(outputDir, 'opencode-update.log');
    if (!fs.existsSync(promptFile) && !fs.existsSync(logPath)) return undefined;
    const prompt = fs.existsSync(promptFile) ? fs.readFileSync(promptFile, 'utf8') : '';
    const log = this.cleanExecutorLog(fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').slice(-30000) : '');
    const verified = this.executorLogShowsVerifiedBuild(logPath);
    const failed = /cannot connect to api|unable to connect|code executor exited with code (?!0\b)\d+|Nexus stopped the executor/i.test(log);
    const status: BuildUpdateRun['status'] = verified ? 'completed' : failed || log ? 'failed' : 'queued';
    const userMessage = prompt.match(/User follow-up request:\s*([^\n]+)/i)?.[1]?.trim() || 'Continue the preserved build';
    const createdAt = new Date((fs.existsSync(promptFile) ? fs.statSync(promptFile) : fs.statSync(logPath)).birthtimeMs || Date.now()).toISOString();
    const session: OpenCodeSessionStub = {
      id: `restored-${updateId}`,
      workspace: build.root,
      mode: 'build',
      status: status === 'completed' ? 'completed' : status === 'queued' ? 'created' : 'failed',
      prompt,
      createdAt,
    };
    const update: BuildUpdateRun = { id: updateId, buildId: build.id, createdAt, workspace: build.root, userMessage, status, prompt, logPath, session };
    this.buildUpdates.set(update.id, update);
    return update;
  }

  updateBuildFromChat(buildId: string, message: string, options: { uiLook?: string; mode?: string; launch?: boolean; browserContext?: string; brainMode?: BuildBrainMode; aiProvider?: string; aiModel?: string } = {}): BuildUpdateRun {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    const id = uuid().slice(0, 8);
    const outputDir = path.join(build.root, '.nexus', 'chat-updates', id);
    fs.mkdirSync(outputDir, { recursive: true });
    const brain = this.createBuildBrain(options.brainMode || build.brain?.mode || 'hybrid', options.aiProvider || build.brain?.provider || 'openai', options.aiModel || build.brain?.model);
    build.brain = brain;
    const prompt = this.buildChatUpdatePrompt(build, message, options.uiLook || 'modern-saas', brain, options.browserContext) + '\n\n' + browserContractInstructions;
    const logPath = path.join(outputDir, 'opencode-update.log');
    const promptFile = path.join(outputDir, 'opencode-update-prompt.md');
    fs.writeFileSync(promptFile, prompt);
    const session = this.createOpenCodeSession(build.root, prompt, options.mode || 'update');
    const run: BuildUpdateRun = { id, buildId, createdAt: new Date().toISOString(), workspace: build.root, userMessage: message, status: 'queued', prompt, logPath, session };
    this.buildUpdates.set(id, run);
    if (options.launch === false) {
      this.prepareBuildUpdate(build, run);
      run.status = 'prepared';
      session.status = 'waiting-review';
      fs.writeFileSync(logPath, 'Chat update launch skipped.\n');
      this.addProjectMemory(buildId, { type: 'decision', summary: `Chat update requested: ${message}`, evidence: [outputDir], tags: ['chat-update', options.uiLook || 'modern-saas'] });
      this.persistBuild(build);
      return run;
    }
    if (['opencode-running', 'verifying'].includes(build.status) || this.hasRunningBuildUpdate(buildId)) {
      fs.writeFileSync(logPath, `Queued behind the active Nexus executor for build ${buildId}.\n`);
    } else {
      this.launchBuildUpdate(build, run, promptFile);
    }
    this.addProjectMemory(buildId, { type: 'decision', summary: `Chat update requested: ${message}`, evidence: [outputDir], tags: ['chat-update', options.uiLook || 'modern-saas'] });
    this.persistBuild(build);
    return run;
  }

  private prepareBuildUpdate(build: BuildWorkspace, run: BuildUpdateRun): void {
    this.checkpointRuns.set(run.id, this.checkpoints.create(build.root, `Before update: ${run.userMessage.slice(0, 120)}`));
  }

  private hasRunningBuildUpdate(buildId: string): boolean {
    return this.getBuildUpdates().some((item) => item.buildId === buildId && ['running', 'verifying'].includes(item.status));
  }

  private startNextQueuedUpdate(buildId: string): boolean {
    if (this.hasRunningBuildUpdate(buildId)) return false;
    const build = this.getBuild(buildId);
    const next = this.getBuildUpdates().find((item) => item.buildId === buildId && item.status === 'queued');
    if (!build || !next) return false;
    this.launchBuildUpdate(build, next, path.join(path.dirname(next.logPath), 'opencode-update-prompt.md'));
    return true;
  }

  private async launchBuildUpdate(build: BuildWorkspace, run: BuildUpdateRun, promptFile: string): Promise<void> {
    let finished = false;
    const finish = (status: 'completed' | 'failed') => {
      if (finished) return;
      finished = true;
      this.buildUpdateProcesses.delete(build.id);
      run.status = status;
      run.session.status = status;
      build.status = status;
      this.sealUpdate(run);
      this.persistBuild(build);
      this.startNextQueuedUpdate(build.id);
    };
    try {
      this.prepareBuildUpdate(build, run);
      run.status = 'running';
      run.session.status = 'running';
      build.status = 'opencode-running';
      build.verification = { phase: 'pending', pass: 0, issues: [], artifacts: [] };
      this.persistBuild(build);
      if (build.previewUrl && build.previewStatus === 'running') {
        const evidence = await captureRenderedEvidence(build.previewUrl, path.join(path.dirname(run.logPath), 'before-edit'))
          .catch((error: Error) => `Current preview inspection failed: ${error.message}. Diagnose this while implementing the requested change.`);
        run.prompt += `\n\n${evidence}`;
        fs.writeFileSync(promptFile, run.prompt);
      }
      const child = this.launchCodeExecution(build.root, run.prompt, run.session.mode, run.logPath, (code) => {
        this.buildUpdateProcesses.delete(build.id);
        if (code !== 0) {
          this.sealUpdate(run);
          finish('failed');
          this.persistBuild(build);
          return;
        }
        run.status = 'verifying';
        build.status = 'verifying';
        this.persistBuild(build);
        void this.verifyAndRepair(build, run.userMessage).then((passed) => {
          this.sealUpdate(run);
          finish(passed ? 'completed' : 'failed');
          this.persistBuild(build);
        }).catch((error) => {
          this.failVerification(build, error);
          this.sealUpdate(run);
          finish('failed');
          this.persistBuild(build);
        });
      }, () => finish('failed'), promptFile);
      if (child) this.buildUpdateProcesses.set(build.id, child);
    } catch (error: any) {
      fs.writeFileSync(run.logPath, `Chat update could not launch: ${error.message}\n`, { flag: 'a' });
      finish('failed');
    }
  }

  getBuildUpdates(): BuildUpdateRun[] {
    return Array.from(this.buildUpdates.values());
  }

  startPreview(buildId: string): BuildWorkspace {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    const existing = this.previewProcesses.get(buildId);
    if (existing && !existing.killed && build.previewUrl) return build;

    const port = build.previewPort || this.allocatePreviewPort();
    build.previewPort = port;
    build.previewUrl = `http://127.0.0.1:${port}`;
    build.previewStatus = 'starting';
    build.previewCommand = this.previewCommandForBuild(build, port);
    const pkg = this.safeJson(path.join(build.root, 'package.json'));
    if (/\bvite\b/.test(String(pkg.scripts?.dev || ''))) this.previewReadyUrls.set(buildId, null);
    else this.previewReadyUrls.delete(buildId);

    fs.writeFileSync(build.previewLogPath, `Starting preview for ${build.name}\n${build.previewCommand}\n\n`, { flag: 'a' });
    const commandParts = process.platform === 'win32'
      ? { command: 'cmd.exe', args: ['/c', build.previewCommand] }
      : { command: 'sh', args: ['-lc', build.previewCommand] };

    const child = spawn(commandParts.command, commandParts.args, {
      cwd: build.root,
      env: { ...process.env, PORT: String(port), npm_config_cache: path.join(build.root, '.nexus', 'npm-cache') },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    const log = fs.createWriteStream(build.previewLogPath, { flags: 'a' });
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      log.write(text);
      const localUrl = text.replace(/\u001b\[[0-9;]*m/g, '').match(/local:\s+(https?:\/\/[^\s]+)/i)?.[1];
      if (localUrl) {
        const resolvedUrl = localUrl.replace('localhost', '127.0.0.1');
        build.previewUrl = resolvedUrl;
        const actualPort = Number(new URL(resolvedUrl).port);
        if (actualPort) build.previewPort = actualPort;
        this.previewReadyUrls.set(buildId, resolvedUrl);
        this.persistBuild(build);
      }
    });
    child.stderr.on('data', (chunk) => log.write(chunk));
    child.on('exit', (code) => {
      log.write(`\nPreview exited with code ${code}\n`);
      log.end();
      if (this.previewProcesses.get(buildId) === child) {
        this.previewProcesses.delete(buildId);
        if (build.previewStatus !== 'stopped') build.previewStatus = code === 0 ? 'stopped' : 'failed';
      }
    });
    child.on('error', (error) => {
      log.write(`\nPreview failed to start: ${error.message}\n`);
      if (this.previewProcesses.get(buildId) === child) build.previewStatus = 'failed';
    });

    this.previewProcesses.set(buildId, child);
    void this.waitForBuildPreview(build, 30000).then(() => {
      if (this.previewProcesses.get(buildId) === child && build.previewStatus === 'starting') build.previewStatus = 'running';
    }).catch((error) => {
      if (this.previewProcesses.get(buildId) === child) {
        build.previewStatus = 'failed';
        log.write(`\nPreview health check failed: ${error.message}\n`);
      }
    });
    return build;
  }

  stopPreview(buildId: string): BuildWorkspace {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    const child = this.previewProcesses.get(buildId);
    if (child && !child.killed) {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill('SIGTERM');
    }
    this.previewProcesses.delete(buildId);
    this.previewReadyUrls.delete(buildId);
    build.previewStatus = 'stopped';
    return build;
  }

  getPreviewLog(buildId: string): { buildId: string; log: string } {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    return { buildId, log: this.readCurrentPreviewLog(build, 20000) };
  }

  private readCurrentPreviewLog(build: BuildWorkspace, maxLength: number): string {
    if (!fs.existsSync(build.previewLogPath)) return '';
    const log = fs.readFileSync(build.previewLogPath, 'utf8');
    const currentRun = log.lastIndexOf('Starting preview for ');
    return (currentRun >= 0 ? log.slice(currentRun) : log).slice(-maxLength);
  }

  private previewCommandForBuild(build: BuildWorkspace, port: number): string {
    const root = build.root;
    const packagePath = path.join(root, 'package.json');
    if (fs.existsSync(path.join(root, 'artisan'))) return `php artisan serve --host=0.0.0.0 --port=${port}`;
    if (fs.existsSync(packagePath)) {
      const pkg = this.safeJson(packagePath);
      const manager = fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(root, 'yarn.lock')) ? 'yarn' : fs.existsSync(path.join(root, 'bun.lockb')) ? 'bun' : 'npm';
      const install = manager === 'yarn' ? 'yarn install' : `${manager} install`;
      const run = manager === 'npm' ? 'npm run dev' : `${manager} run dev`;
      if (pkg.scripts?.dev) {
        const next = Boolean(pkg.dependencies?.next || pkg.devDependencies?.next || /\bnext\b/.test(String(pkg.scripts.dev)));
        const flags = next ? `-- --hostname 0.0.0.0 --port ${port}` : `-- --host 0.0.0.0 --port ${port}`;
        return `${install} && ${run} ${flags}`;
      }
      if (pkg.scripts?.start) return `${install} && ${manager === 'npm' ? 'npm start' : `${manager} start`}`;
    }
    if (fs.existsSync(path.join(root, 'public', 'index.php'))) return `php -S 0.0.0.0:${port} -t public`;
    if (fs.existsSync(path.join(root, 'index.php'))) return `php -S 0.0.0.0:${port} -t .`;
    if (fs.existsSync(path.join(root, 'manage.py'))) return `python manage.py runserver 0.0.0.0:${port}`;
    if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'cargo run';
    if (fs.existsSync(path.join(root, 'go.mod'))) return 'go run .';
    if (fs.existsSync(path.join(root, 'Gemfile'))) return `bundle exec rails server -b 0.0.0.0 -p ${port}`;
    const projectFile = fs.readdirSync(root).find((file) => file.endsWith('.csproj'));
    if (projectFile) return `dotnet run --urls http://0.0.0.0:${port}`;
    return this.resolveStackPlan(build).devCommand.replace('{port}', String(port));
  }

  private resolveStackPlan(build: BuildWorkspace): BuildStackPlan {
    if (build.stackPlan) return build.stackPlan;
    const planPath = path.join(build.root, '.nexus', 'stack-plan.json');
    if (fs.existsSync(planPath)) {
      const saved = this.safeJson(planPath) as Partial<BuildStackPlan>;
      if (saved.primaryLanguage && saved.framework && Array.isArray(saved.expertIds)) {
        build.stackPlan = saved as BuildStackPlan;
        return build.stackPlan;
      }
    }
    const fileSignals = [
      fs.existsSync(path.join(build.root, 'artisan')) ? 'laravel php composer' : '',
      fs.existsSync(path.join(build.root, 'composer.json')) ? 'php composer' : '',
      fs.existsSync(path.join(build.root, 'manage.py')) ? 'django python' : '',
      fs.existsSync(path.join(build.root, 'Cargo.toml')) ? 'rust cargo' : '',
      fs.existsSync(path.join(build.root, 'go.mod')) ? 'golang app' : '',
      fs.existsSync(path.join(build.root, 'Gemfile')) ? 'ruby on rails' : '',
    ].filter(Boolean).join(' ');
    build.stackPlan = this.planBuildStack(`${build.prompt}\n${fileSignals}`);
    return build.stackPlan;
  }

  async runBuildDoctor(buildId: string, options: { runBuild?: boolean; autoHeal?: boolean } = {}): Promise<BuildDoctorReport> {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    const issues: BuildDoctorIssue[] = [];
    const checks: Record<string, any> = { files: {}, scripts: {}, commands: {}, logs: {} };
    const stackPlan = this.resolveStackPlan(build);
    checks.stackPlan = stackPlan;
    const packagePath = path.join(build.root, 'package.json');
    const composerPath = path.join(build.root, 'composer.json');
    const srcDir = path.join(build.root, 'src');
    const indexHtml = path.join(build.root, 'index.html');

    if (stackPlan.runtime === 'Node.js') {
      checks.files.packageJson = fs.existsSync(packagePath);
      checks.files.src = fs.existsSync(srcDir) || fs.existsSync(path.join(build.root, 'app')) || fs.existsSync(path.join(build.root, 'pages'));
      checks.files.indexHtml = fs.existsSync(indexHtml);
      if (!checks.files.packageJson) issues.push(this.issue('critical', 'package', 'Missing package.json', packagePath, `Create package.json for the planned ${stackPlan.framework} application.`));
      if (!checks.files.src) issues.push(this.issue('critical', 'workspace', 'Missing application source directory', srcDir, `Create the ${stackPlan.framework} application source files.`));
      if (stackPlan.framework === 'React + Vite' && !checks.files.indexHtml) issues.push(this.issue('high', 'workspace', 'Missing Vite index.html', indexHtml, 'Create index.html with a root element and module script entry.'));
    }

    let pkg: any = undefined;
    if (fs.existsSync(packagePath)) {
      try {
        pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        checks.scripts = pkg.scripts || {};
        for (const script of ['dev', 'build']) {
          if (!pkg.scripts?.[script]) issues.push(this.issue('critical', 'package', `Missing npm script: ${script}`, JSON.stringify(pkg.scripts || {}), `Add a working \"${script}\" script.`));
        }
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        checks.dependencies = Object.keys(deps);
        const expectedDependencies = stackPlan.framework === 'React + Vite' ? ['react', 'react-dom', 'vite'] : stackPlan.framework === 'Next.js' ? ['react', 'react-dom', 'next'] : [];
        for (const dep of expectedDependencies) {
          if (!deps[dep]) issues.push(this.issue('high', 'dependencies', `Missing dependency: ${dep}`, packagePath, `Install and declare ${dep}.`));
        }
      } catch (error: any) {
        issues.push(this.issue('critical', 'package', 'Invalid package.json', error.message, 'Fix package.json so it is valid JSON.'));
      }
    }

    if (stackPlan.primaryLanguage === 'PHP') {
      const phpEntry = fs.existsSync(path.join(build.root, 'public', 'index.php')) ? path.join(build.root, 'public', 'index.php') : path.join(build.root, 'index.php');
      checks.files.composerJson = fs.existsSync(composerPath);
      checks.files.phpEntry = fs.existsSync(phpEntry);
      if (!checks.files.composerJson) issues.push(this.issue('critical', 'package', 'Missing composer.json', composerPath, 'Create a valid Composer project with the required PHP version, autoloading, dependencies, and scripts.'));
      if (!checks.files.phpEntry) issues.push(this.issue('critical', 'workspace', 'Missing PHP web entry point', phpEntry, 'Create public/index.php or the framework entry point.'));
      if (checks.files.composerJson) {
        try {
          const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
          checks.dependencies = Object.keys({ ...(composer.require || {}), ...(composer['require-dev'] || {}) });
          if (!composer.require?.php) issues.push(this.issue('medium', 'package', 'Composer PHP platform version is not declared', composerPath, 'Declare the supported PHP version in composer.json.'));
        } catch (error: any) {
          issues.push(this.issue('critical', 'package', 'Invalid composer.json', error.message, 'Fix composer.json so Composer can parse it.'));
        }
      }
    }

    if (!['Node.js', 'PHP 8.1+', 'PHP 8.2+'].includes(stackPlan.runtime)) {
      const projectFiles = this.listWorkspaceFiles(build.root).filter((file) => !file.path.startsWith('.nexus'));
      checks.files.projectFiles = projectFiles.length;
      if (projectFiles.length < 2) issues.push(this.issue('critical', 'workspace', `Incomplete ${stackPlan.framework} workspace`, build.root, `Create the manifests and source files required by the ${stackPlan.framework} expert plan.`));
    }

    const envExample = path.join(build.root, '.env.example');
    checks.files.envExample = fs.existsSync(envExample);
    if (!checks.files.envExample && this.promptLikelyNeedsEnv(build.prompt)) issues.push(this.issue('medium', 'env', 'No .env.example for integration-heavy app', build.prompt, 'Create .env.example documenting required API, auth, database, and deployment variables.'));

    if (fs.existsSync(build.previewLogPath)) {
      const previewLog = this.readCurrentPreviewLog(build, 12000);
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

    if (options.runBuild) {
      const phpEntry = fs.existsSync(path.join(build.root, 'public', 'index.php')) ? 'public/index.php' : 'index.php';
      const nodeManager = fs.existsSync(path.join(build.root, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(build.root, 'yarn.lock')) ? 'yarn' : fs.existsSync(path.join(build.root, 'bun.lockb')) ? 'bun' : 'npm';
      const commands = stackPlan.primaryLanguage === 'PHP' && checks.files.phpEntry
        ? [`php -l ${phpEntry}`, ...stackPlan.buildCommands]
        : pkg?.scripts?.build ? [`${nodeManager === 'npm' ? 'npm' : nodeManager} run build`] : stackPlan.buildCommands.slice(0, 1);
      for (const command of commands) {
        const result = await this.runShellCommand(build.root, command, 90000);
        checks.commands[command] = result;
        if (result.code !== 0) issues.push(this.issue('critical', 'build', `${stackPlan.framework} verification failed`, `${result.stdout}\n${result.stderr}`.slice(-8000), `Use the selected ${stackPlan.expertIds.join(', ')} experts to fix the failure, then rerun: ${command}`));
      }
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
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    return this.loadProjectMemory(build);
  }

  addProjectMemory(buildId: string, entry: Omit<ProjectMemoryEntry, 'id' | 'createdAt'>): ProjectMemory {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    const memory = this.loadProjectMemory(build);
    memory.entries.push({ ...entry, id: uuid().slice(0, 8), createdAt: new Date().toISOString() });
    memory.updatedAt = new Date().toISOString();
    this.saveProjectMemory(memory);
    return memory;
  }

  routeExperts(buildId: string): ExpertRoutingReport {
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    const packagePath = path.join(build.root, 'package.json');
    const pkg = fs.existsSync(packagePath) ? this.safeJson(packagePath) : {};
    const composerPath = path.join(build.root, 'composer.json');
    const composer = fs.existsSync(composerPath) ? this.safeJson(composerPath) : {};
    const stackPlan = this.resolveStackPlan(build);
    const plannedExperts = new Set(stackPlan.expertIds);
    const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(composer.require || {}), ...(composer['require-dev'] || {}) });
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
      stackPlan,
    };
    const selectedExperts = getLanguageExperts()
      .map((expert) => {
        const decision = this.scoreExpert(expert, files, deps, logs, build.prompt);
        if (plannedExperts.has(expert.id)) {
          decision.score = Math.max(decision.score, 70);
          decision.reasons = Array.from(new Set([`Selected during ${stackPlan.framework} preflight`, ...decision.reasons]));
        }
        return decision;
      })
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
    const build = this.getBuild(buildId);
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
    const build = this.getBuild(buildId);
    if (!build) throw new Error('Build not found');
    if (!build.previewUrl || build.previewStatus === 'stopped' || build.previewStatus === 'failed') this.startPreview(buildId);
    const devices = this.stagingDevicePresets().filter((device) => !options.devices?.length || options.devices.includes(device.id));
    const id = uuid().slice(0, 8);
    const outputDir = path.join(build.root, '.nexus', 'staging', id);
    fs.mkdirSync(outputDir, { recursive: true });
    const previewLog = this.readCurrentPreviewLog(build, 20000);
    const errors = this.extractPreviewErrors(previewLog);
    await this.waitForBuildPreview(build, 12000);
    const deviceChecks = await this.captureStagingDevices(build.previewUrl!, devices, outputDir);
    const creativeUniqueness = this.scoreCreativeUniqueness(build);
    const failedDevices = deviceChecks.filter((check) => check.status === 'failed').length;
    const runtimeErrors = deviceChecks.flatMap((check) => [...check.consoleErrors, ...check.networkErrors]);
    const healthScore = Math.max(0, 100 - failedDevices * 25 - errors.length * 10 - runtimeErrors.length * 8 - (build.previewStatus === 'running' ? 0 : 10));
    const status = failedDevices || errors.length || runtimeErrors.length ? (healthScore < 60 ? 'failed' : 'degraded') : 'ready';
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
      summary: `Staging Studio ${status}: preview ${build.previewStatus}, ${deviceChecks.length} devices, health ${healthScore}/100, visual originality awaiting rendered review.`,
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
    const build = this.getBuild(buildId);
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
      const result = await this.runCodeExecutionBlocking(
        build.root,
        report.repairPrompt,
        'auto-heal-loop',
        healLogPath,
        timeoutMs,
        path.join(report.outputDir, 'opencode-auto-heal-prompt.md'),
      );
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
      preview: this.getBuild(buildId),
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

  private buildChatUpdatePrompt(build: BuildWorkspace, message: string, uiLook: string, brain: BuildBrainProfile, browserContext = ''): string {
    const memory = this.loadProjectMemory(build);
    const stackPlan = this.resolveStackPlan(build);
    const latestCreative = Array.from(this.creativeDirections.values()).filter((item) => item.buildId === build.id).slice(-1)[0];
    const latestRoute = Array.from(this.expertRoutes.values()).filter((item) => item.buildId === build.id).slice(-1)[0];
    const previewLog = this.readCurrentPreviewLog(build, 5000);
    const swarm = getProjectAgentSwarm();
    return `You are OpenCode updating an existing NexusBrowser generated app from a conversational user request.\n\nWorkspace: ${build.root}\nOriginal app goal: ${build.prompt}\nUser follow-up request: ${message}\nCurrent preview URL: ${build.previewUrl || 'not running'}\nRequested look/mode: ${uiLook}\n\nBuild brain:\n- Mode: ${brain.mode}\n- Provider: ${brain.provider}\n- Model: ${brain.model || 'default'}\n- Executor: ${brain.executor}\n${brain.notes.map((note) => `- ${note}`).join('\n')}\n\nStack plan and active expert team:\n${this.buildStackAgentBrief(stackPlan)}\n\nLive browser intelligence packet:\n${browserContext || 'No live browser packet was available. Use files, logs, and preview evidence.'}\n\nShared Nexus agent knowledge to apply:\n${swarm.sharedKnowledge.map((item) => `- ${item}`).join('\n')}\n\nProject memory:\n${memory.entries.slice(-20).map((entry) => `- [${entry.type}] ${entry.summary}`).join('\n') || '- No memory yet.'}\n\n${latestCreative ? `Creative direction to preserve and improve:\n${latestCreative.prompt.slice(0, 6000)}` : 'No creative direction exists yet. Create a distinct, anti-template design direction before changing UI.'}\n\n${latestRoute ? `Relevant expert routing context:\n${latestRoute.selectedExperts.map((expert) => `- ${expert.name}: ${expert.reasons.join('; ')}`).join('\n')}` : 'Use the preflight stack experts in .nexus/agents/selected-experts.md and add specialists only when new evidence requires them.'}\n\nRecent preview log:\n${previewLog || 'No preview log yet.'}\n\nNexusBrowser advantage to preserve:\n- Use the browser and DevTools-style evidence as the main development loop, not an afterthought.\n- Connect visible UI, DOM structure, computed styles, console errors, network calls, storage state, screenshots, and visual QA to concrete code edits.\n- If the request is vague, improve the app in the direction that makes the browser-powered coding loop clearer, smarter, and more useful.\n\nUpdate rules:\n- Treat the user message as a modification to the existing app, not a request to start over.\n- Inspect files and .nexus/stack-plan.json before editing.\n- Keep the planned ${stackPlan.framework} stack unless the user explicitly requests a migration. Do not introduce React/npm assumptions into a non-React project.\n- Make the smallest complete code changes that satisfy the request.\n- If UI changes are requested, make them visually distinctive and avoid generic templates.\n- Preserve existing working functionality unless the user explicitly asks to replace it.\n- Update related loading, empty, error, hover, focus, mobile, and reduced-motion states when relevant.\n- Install dependencies only with ${stackPlan.packageManager} and only when they change.\n- Run the relevant checks: ${[...stackPlan.buildCommands, ...stackPlan.testCommands].join('; ')}. Fix failures before finishing.\n- Leave a concise summary in .nexus/memory/project-memory.md if you learn a durable decision.\n`;
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
      return { ok: response.ok, code: response.status, latencyMs: Date.now() - started };
    } catch (error: any) {
      return { ok: false, latencyMs: Date.now() - started, error: error.message };
    } finally {
      clearTimeout(timer);
    }
  }

  private async waitForBuildPreview(build: BuildWorkspace, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.previewReadyUrls.has(build.id) && !this.previewReadyUrls.get(build.id)) {
      if (build.previewStatus === 'failed' || build.previewStatus === 'stopped') throw new Error('Preview exited before announcing its URL');
      if (Date.now() >= deadline) throw new Error('Preview did not announce its ready URL');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const url = this.previewReadyUrls.get(build.id) || build.previewUrl;
    if (!url) throw new Error('Preview URL unavailable');
    await this.waitForPreview(url, Math.max(1, deadline - Date.now()));
  }

  private async waitForPreview(url: string, timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const health = await this.checkPreviewHealth(url);
      if (health.ok) return;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error(`Preview did not return a successful HTTP response within ${timeoutMs}ms: ${url}`);
  }

  private async captureStagingDevices(url: string, devices: StagingDevicePreset[], outputDir: string): Promise<StagingDeviceCheck[]> {
    const browser = await launchChromium({ headless: true });
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
        page.on('pageerror', (error) => consoleErrors.push(error.message));
        page.on('response', (response) => { if (response.status() >= 400) networkErrors.push(`HTTP ${response.status()} ${response.url()}`); });
        page.on('requestfailed', (request) => networkErrors.push(`${request.method()} ${request.url()} failed: ${request.failure()?.errorText || 'unknown'}`.slice(0, 1000)));
        try {
          const started = Date.now();
          const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
          await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
          checks.push({
            device,
            url,
            status: response?.ok() && !consoleErrors.length && !networkErrors.length ? 'ready' : 'failed',
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
    const findings = ['Visual originality requires review of the rendered product; no keyword-based score is assigned.'];
    return { score: null, findings, antiTemplatePrompt: this.buildAntiTemplateStagingPrompt(build, 0, findings) };
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
    const healLogPath = path.join(report.outputDir, 'auto-heal.log');
    try {
      this.launchCodeExecution(build.root, report.repairPrompt, 'auto-heal', healLogPath, (code) => {
        session.status = code === 0 ? 'completed' : 'failed';
      }, () => {
        session.status = 'failed';
      }, path.join(report.outputDir, 'opencode-auto-heal-prompt.md'));
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
    const stackPlan = this.resolveStackPlan(build);
    return `You are the NexusBrowser Build Doctor Auto-Heal Agent for a ${stackPlan.framework} application. You diagnose the full lifecycle: workspace shape, ${stackPlan.packageManager} setup, ${stackPlan.runtime} runtime, framework conventions, APIs, env vars, database wiring, tests, browser QA, deployment readiness, and safe repair.\n\nWorkspace: ${build.root}\nOriginal user request: ${build.prompt}\nPreview URL: ${build.previewUrl || 'not running'}\n\nAssigned stack experts:\n${this.buildStackAgentBrief(stackPlan)}\n\nDiagnosed issues:\n${issues.map((item) => `- [${item.severity}] ${item.area}: ${item.issue}\n  Evidence: ${item.evidence.slice(0, 1000)}\n  Fix: ${item.fix}`).join('\n') || '- No hard failures found; improve production readiness.'}\n\nChecks JSON:\n${JSON.stringify(checks, null, 2).slice(0, 12000)}\n\nAuto-heal rules:\n- Inspect files, .nexus/stack-plan.json, and the selected expert manifest before editing.\n- Keep the ${stackPlan.framework} architecture unless the user explicitly requested a migration.\n- Route each failure to the relevant selected specialist and apply that specialist's checks and repair skills.\n- Fix manifests, dependencies, imports, missing files, compiler/runtime errors, API/env setup, and preview wiring using ${stackPlan.packageManager}.\n- Create .env.example when APIs, auth, payments, database, email, storage, AI, or deployment are implied.\n- Add safe mocks or local fallbacks when live APIs require secrets.\n- Never hardcode secrets or captured cookies.\n- Run setup only if dependencies changed: ${stackPlan.setupCommands.join('; ')}.\n- Run and fix the stack checks: ${[...stackPlan.buildCommands, ...stackPlan.testCommands].join('; ')}.\n- If preview failed, ensure this works: ${stackPlan.devCommand}.\n- Update README with setup, env vars, scripts, and known limitations.\n- Keep changes minimal but complete enough for a working app.\n`;
  }

  private runShellCommand(cwd: string, command: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    return process.platform === 'win32'
      ? this.runCommand(cwd, 'cmd.exe', ['/c', command], timeoutMs)
      : this.runCommand(cwd, 'sh', ['-lc', command], timeoutMs);
  }

  private async runCommand(cwd: string, command: string, args: string[], timeoutMs: number, env?: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, env: env || { ...process.env, npm_config_cache: path.join(cwd, '.nexus', 'npm-cache') }, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true });
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
    const snapshot = this.checkpoints.create(root || process.cwd(), reason);
    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  getSnapshots(): WorkspaceSnapshot[] {
    const persisted = this.getBuilds().flatMap((build) => this.checkpoints.list(build.root));
    return [...new Map([...this.snapshots.values(), ...persisted].map((item) => [item.id, item])).values()];
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

  private hydrateGeneratedBuilds(): void {
    const generatedRoot = path.join(process.cwd(), 'generated-apps');
    if (!fs.existsSync(generatedRoot)) return;
    for (const entry of fs.readdirSync(generatedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const id = entry.name.match(/-([a-f0-9]{8})$/i)?.[1];
      if (id && !this.builds.has(id)) this.hydrateBuildFromRoot(id, path.join(generatedRoot, entry.name));
    }
  }

  private hydrateGeneratedBuild(buildId: string): BuildWorkspace | undefined {
    this.hydrateGeneratedBuilds();
    if (this.builds.has(buildId)) return this.builds.get(buildId);
    const generatedRoot = path.join(process.cwd(), 'generated-apps');
    if (!fs.existsSync(generatedRoot)) return undefined;
    const match = fs.readdirSync(generatedRoot, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.endsWith(`-${buildId}`));
    return match ? this.hydrateBuildFromRoot(buildId, path.join(generatedRoot, match.name)) : undefined;
  }

  private hydrateBuildFromRoot(id: string, root: string): BuildWorkspace | undefined {
    const packagePath = path.join(root, 'package.json');
    const composerPath = path.join(root, 'composer.json');
    const stackPlanPath = path.join(root, '.nexus', 'stack-plan.json');
    const hasProjectManifest = [packagePath, composerPath, stackPlanPath, path.join(root, 'pyproject.toml'), path.join(root, 'requirements.txt'), path.join(root, 'go.mod'), path.join(root, 'Cargo.toml'), path.join(root, 'Gemfile')].some((file) => fs.existsSync(file));
    if (!hasProjectManifest) return undefined;
    const name = path.basename(root).replace(new RegExp(`-${id}$`, 'i'), '');
    const readmePath = path.join(root, 'README.md');
    const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
    const prompt = readme.match(/Prompt:\s*\n([\s\S]*?)(?:\n\nPlanned stack:|\n\nRun locally:|$)/)?.[1]?.trim() || name.replace(/-/g, ' ');
    const savedPlan = fs.existsSync(stackPlanPath) ? this.safeJson(stackPlanPath) as Partial<BuildStackPlan> : undefined;
    const fileSignals = fs.existsSync(path.join(root, 'artisan')) ? 'laravel php' : fs.existsSync(composerPath) ? 'php composer' : fs.existsSync(path.join(root, 'manage.py')) ? 'django python' : '';
    const stackPlan = savedPlan?.primaryLanguage && savedPlan.framework ? savedPlan as BuildStackPlan : this.planBuildStack(`${prompt}\n${fileSignals}`);
    const logPath = path.join(root, 'opencode-build.log');
    const persistedLog = this.cleanExecutorLog(fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').slice(-20000) : '');
    const savedState = this.safeJson(path.join(root, '.nexus', 'build-state.json'));
    const persistedStatus: BuildWorkspace['status'] = /Code executor exited with code 0\b/i.test(persistedLog)
      ? 'created'
      : /Code executor exited with code (?!0\b)\d+|cannot connect to api|unable to connect|code executor failed|could not be launched/i.test(persistedLog)
        ? 'failed'
        : 'created';
    const build: BuildWorkspace = {
      id,
      name,
      root,
      prompt,
      status: persistedStatus,
      previewStatus: 'stopped',
      opencodeCommand: 'opencode run OPENCODE_BUILD_PROMPT.md',
      logPath,
      previewLogPath: path.join(root, 'preview.log'),
      previewCommand: stackPlan.devCommand,
      brain: this.createBuildBrain('hybrid', process.env.LLM_PROVIDER || 'openai'),
      stackPlan,
      createdAt: new Date(fs.statSync(root).birthtimeMs || Date.now()).toISOString(),
    };
    if (savedState?.build?.id === id) {
      build.verification = savedState.build.verification;
      build.reference = savedState.build.reference;
      build.status = savedState.build.status === 'completed' && build.verification?.phase === 'passed' ? 'completed'
        : ['opencode-running', 'verifying'].includes(savedState.build.status) ? 'failed' : savedState.build.status === 'failed' ? 'failed' : 'created';
      if (['opencode-running', 'verifying'].includes(savedState.build.status)) {
        build.verification = { phase: 'failed', pass: build.verification?.pass || 0, issues: ['Job interrupted by restart. Retry verification or continue the project.'], artifacts: build.verification?.artifacts || [] };
      }
      for (const run of savedState.updates || []) {
        if (run.buildId !== id || !/^[a-f0-9]{8}$/.test(run.id)) continue;
        run.workspace = root;
        run.logPath = path.join(root, '.nexus', 'chat-updates', run.id, 'opencode-update.log');
        run.status = ['queued', 'running', 'verifying'].includes(run.status) ? 'failed' : run.status;
        this.buildUpdates.set(run.id, run);
      }
    }
    this.builds.set(id, build);
    const updatesRoot = path.join(root, '.nexus', 'chat-updates');
    if (!savedState?.build && fs.existsSync(updatesRoot)) {
      const latestUpdate = fs.readdirSync(updatesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.hydrateBuildUpdate(build, entry.name))
        .filter((item): item is BuildUpdateRun => Boolean(item))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
      if (latestUpdate?.status === 'completed') build.status = 'completed';
      else if (latestUpdate?.status === 'failed') build.status = 'failed';
    }
    return build;
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

  private writeStarterApp(root: string, name: string, prompt: string, stackPlan: BuildStackPlan): void {
    if (stackPlan.primaryLanguage === 'PHP') {
      const publicDir = path.join(root, 'public');
      fs.mkdirSync(publicDir, { recursive: true });
      fs.writeFileSync(path.join(root, 'composer.json'), JSON.stringify({
        name: `nexus/${name}`,
        description: prompt,
        type: 'project',
        require: { php: '>=8.1' },
        scripts: { test: 'php -l public/index.php' },
      }, null, 2));
      fs.writeFileSync(path.join(publicDir, 'index.php'), `<?php\ndeclare(strict_types=1);\n$title = ${JSON.stringify(prompt.slice(0, 120) || name)};\n?>\n<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title><link rel="stylesheet" href="/styles.css"></head>\n<body><main><p class="eyebrow">Nexus PHP workspace</p><h1><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></h1><p>The PHP and Composer experts are preparing this application from the saved Nexus stack plan.</p></main></body>\n</html>\n`);
      fs.writeFileSync(path.join(publicDir, 'styles.css'), `*{box-sizing:border-box}body{margin:0;background:#f5f7f4;color:#17201b;font-family:Inter,system-ui,sans-serif}main{width:min(920px,calc(100% - 36px));margin:0 auto;padding:clamp(72px,12vw,160px) 0}.eyebrow{color:#087f5b;font-weight:800;text-transform:uppercase}h1{max-width:850px;font-size:clamp(42px,8vw,92px);line-height:.95;margin:18px 0}p{font-size:20px;line-height:1.55}`);
    } else if (stackPlan.framework === 'React + Vite') {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview' },
        dependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^6.1.0', typescript: '^5.7.3', react: '^19.0.0', 'react-dom': '^19.0.0' },
      }, null, 2));
      fs.writeFileSync(path.join(root, 'index.html'), '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>');
      fs.writeFileSync(path.join(root, 'src', 'main.jsx'), "import React from 'react';\nimport {createRoot} from 'react-dom/client';\ncreateRoot(document.getElementById('root')).render(<main><h1>Nexus implementation pending</h1><p>Your requested product is being implemented and will be verified in the browser.</p></main>);\n");
    } else {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', '.gitkeep'), '');
    }
    fs.writeFileSync(path.join(root, 'README.md'), `# ${name}\n\nGenerated by NexusBrowser Builder.\n\nPrompt:\n${prompt}\n\nPlanned stack: ${stackPlan.framework} (${stackPlan.primaryLanguage})\n\nSetup:\n\n\`\`\`bash\n${stackPlan.setupCommands.join('\n')}\n\`\`\`\n\nRun locally:\n\n\`\`\`bash\n${stackPlan.devCommand.replace('{port}', '5173')}\n\`\`\`\n`);
  }

  private writeStackAgentManifest(root: string, stackPlan: BuildStackPlan): void {
    const nexusDir = path.join(root, '.nexus');
    const agentsDir = path.join(nexusDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(nexusDir, 'stack-plan.json'), JSON.stringify(stackPlan, null, 2));
    const languageExperts = getLanguageExperts().filter((expert) => stackPlan.expertIds.includes(expert.id));
    const projectAgents = getProjectAgentSwarm().agents.filter((agent) => stackPlan.projectAgentIds.includes(agent.id));
    const manifest = `# Nexus Build Agent Team\n\n## Stack\n- Language: ${stackPlan.primaryLanguage}\n- Framework: ${stackPlan.framework}\n- Runtime: ${stackPlan.runtime}\n- Package manager: ${stackPlan.packageManager}\n\n## Setup And Verification\n${[...stackPlan.setupCommands, ...stackPlan.buildCommands, ...stackPlan.testCommands].map((command) => `- \`${command}\``).join('\n')}\n\n## Orchestrating Agents\n${projectAgents.map((agent) => `### ${agent.name} (${agent.id})\n${agent.role}\n\nExpected outputs: ${agent.outputs.join(', ')}.`).join('\n\n')}\n\n## Stack Experts\n${languageExperts.map((expert) => `### ${expert.name} (${expert.id})\nOfficial source: https://github.com/${expert.officialGithub}\n\nChecks:\n${expert.checks.map((check) => `- ${check}`).join('\n')}\n\nSkills:\n${expert.repairSkills.map((skill) => `- ${skill}`).join('\n')}`).join('\n\n')}\n`;
    fs.writeFileSync(path.join(agentsDir, 'selected-experts.md'), manifest);
  }

  private buildStackAgentBrief(stackPlan: BuildStackPlan): string {
    const experts = getLanguageExperts().filter((expert) => stackPlan.expertIds.includes(expert.id));
    const projectAgents = getProjectAgentSwarm().agents.filter((agent) => stackPlan.projectAgentIds.includes(agent.id));
    return `- Language: ${stackPlan.primaryLanguage}\n- Framework: ${stackPlan.framework}\n- Runtime: ${stackPlan.runtime}\n- Package manager: ${stackPlan.packageManager}\n- Setup: ${stackPlan.setupCommands.join('; ')}\n- Development: ${stackPlan.devCommand}\n- Build checks: ${stackPlan.buildCommands.join('; ')}\n- Tests: ${stackPlan.testCommands.join('; ')}\n\nOrchestrating agents:\n${projectAgents.map((agent) => `- ${agent.name} (${agent.id}): ${agent.role}`).join('\n')}\n\nStack specialists:\n${experts.map((expert) => `- ${expert.name} (${expert.id}), official source https://github.com/${expert.officialGithub}\n  Check: ${expert.checks.join('; ')}\n  Apply: ${expert.repairSkills.join('; ')}`).join('\n')}`;
  }

  private buildOpenCodeAppPrompt(prompt: string, uiLook: string, brain: BuildBrainProfile, stackPlan: BuildStackPlan, browserContext = ''): string {
    const swarm = getProjectAgentSwarm();
    return `You are the implementation executor for a NexusBrowser multi-agent build.\n\nUser request: ${prompt}\n\n${browserContractInstructions}\n\nUI look: ${uiLook}\n\nBuild brain:\n- Mode: ${brain.mode}\n- Provider: ${brain.provider}\n- Model: ${brain.model || 'default'}\n- Executor: ${brain.executor}\n${brain.notes.map((note) => `- ${note}`).join('\n')}\n\nPreflight stack plan and assigned agents:\n${this.buildStackAgentBrief(stackPlan)}\n\nThe complete persisted plan is in .nexus/stack-plan.json and the specialist manifest is in .nexus/agents/selected-experts.md. Read both before editing.\n\nAgent orchestration contract:\n1. Framework Expert Router validates the planned stack against the request and current files. Do not silently replace it with a familiar default.\n2. Each selected stack specialist owns framework conventions, dependencies, configuration, and its listed checks. Apply its advice during setup, not only after errors.\n3. OpenCode Build Agent implements the application and runs commands.\n4. Build Doctor classifies failures and sends them back to the relevant specialist.\n5. QA Agent verifies real browser behavior, accessibility, responsive layouts, data flows, console output, and production readiness.\n6. Memory Agent records durable architecture and repair decisions under .nexus/memory.\n\nLive browser intelligence packet:\n${browserContext || 'No live browser packet was available. Build from the request, then verify in the real browser preview.'}\n\nShared Nexus agent knowledge to apply:\n${swarm.sharedKnowledge.map((item) => `- ${item}`).join('\n')}\n\nBuild a real working ${stackPlan.framework} application, not notes or a mock plan. Use the generated files as a starting point, but replace placeholders and incomplete scaffolding. Use production-quality styling, responsive layout, accessible components, and a maintainable project structure appropriate to ${stackPlan.primaryLanguage}.\n\nNexusBrowser advantage to design around:\n- Use the browser as evidence: reference page, live preview, DOM, styles, screenshots, console, network, storage, and API discovery inform code changes.\n- Use DevTools evidence internally to improve the requested product. Do not put Nexus development controls or AI marketing into the user product.\n- Implement the end user workflows requested by the user, independently of Nexus development tools.\n\nRequired work:\n- Inspect the current files, stack plan, and expert manifest first.\n- Set up ${stackPlan.framework} using its normal directory layout, dependency manager, configuration, environment conventions, and security practices.\n- Do not introduce React, Vite, npm, PHP, Composer, or any other stack unless it is in the plan or genuinely required by the request.\n- Implement the complete user-facing and backend behavior implied by the request.\n- Run setup only as needed: ${stackPlan.setupCommands.join('; ')}.\n- Verify with: ${[...stackPlan.buildCommands, ...stackPlan.testCommands].join('; ')}. Fix failures before finishing.\n- Confirm the development command works: ${stackPlan.devCommand}.\n- Add clear README usage instructions for the actual stack.\n- Do not hardcode secrets; create .env.example when configuration is required.\n- Include realistic data/state, responsive mobile behavior, empty/loading/error states, accessible focus paths, and one distinctive interaction or visual system that fits the product.\n- Add a short QA checklist covering desktop, mobile, console/runtime errors, API/data flows, and the stack-specific production check.\n- Avoid generic centered hero plus three cards unless the product specifically calls for it; make layout, typography, color, and component rhythm product-specific.\n`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
  }
}
