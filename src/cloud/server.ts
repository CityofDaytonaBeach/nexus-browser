import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import AdmZip from 'adm-zip';
import { config } from '../core/config';
import { createLogger } from '../core/logger';
import { BrowserEngine } from '../browser/engine';
import { AIAgent } from '../agent/index';
import { AutomationEngine } from '../automation/engine';
import { getAllIntegrationProfiles } from '../integrations/registry';
import { getCompetitiveBlueprint } from '../competitive/blueprint';
import { BuilderPlatform } from '../builder/platform';
import { getProjectAgentSwarm } from '../project-agents/registry';
import { fetchLanguageUpdate, getLanguageExperts } from '../languages/registry';
import { LLMClient, LLMMessage } from '../ai/llm';

const log = createLogger('Cloud');

interface CloudClient {
  id: string;
  ws: WebSocket;
  sessionId?: string;
  authenticated: boolean;
  lastPing: number;
}

interface BuilderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface BuilderChatAction {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

interface BuilderChatResult {
  response: string;
  actions: BuilderChatAction[];
  source: 'ai' | 'fallback';
}

interface GitHubProjectConnection {
  owner: string;
  repo: string;
  projectId?: string;
  projectNumber?: number;
  projectUrl?: string;
  connectedAt: string;
}

interface ConnectorConnection {
  id: string;
  provider: string;
  account: string;
  accessToken: string;
  scopes: string[];
  connectedAt: string;
}

interface OAuthState {
  provider: string;
  createdAt: number;
  returnTo: string;
}

interface ProviderSetting {
  id: string;
  enabled: boolean;
  model?: string;
  baseUrl?: string;
  updatedAt: string;
}

interface GathererObservation {
  id: string;
  sessionId: string;
  pageId: string;
  url: string;
  title: string;
  collectedAt: string;
  context: string;
  signals: {
    hasConsoleErrors: boolean;
    networkSignalCount: number;
    interactiveElementCount: number;
    detectedLibraries: string[];
  };
}

interface BackendObservation {
  id: string;
  buildId: string;
  workspace: string;
  collectedAt: string;
  context: string;
  signals: {
    scripts: string[];
    dependencies: string[];
    apiRoutes: string[];
    dataModels: string[];
    envKeys: string[];
    serverFiles: string[];
    logErrors: string[];
  };
}

export class CloudServer {
  private app: express.Application;
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private clients: Map<string, CloudClient> = new Map();
  private engine: BrowserEngine;
  private agent: AIAgent;
  private automation: AutomationEngine;
  private llm: LLMClient;
  private builderChats: Map<string, BuilderMessage[]> = new Map();
  private gathererObservations: Map<string, GathererObservation[]> = new Map();
  private backendObservations: Map<string, BackendObservation[]> = new Map();
  private builderPlatform: BuilderPlatform;
  private githubProjectConnection?: GitHubProjectConnection;
  private connectorConnections: Map<string, ConnectorConnection> = new Map();
  private oauthStates: Map<string, OAuthState> = new Map();
  private providerSettings: Map<string, ProviderSetting> = new Map();
  private chatTitles: Map<string, string> = new Map();
  private pingInterval?: NodeJS.Timeout;

  constructor() {
    this.engine = BrowserEngine.getInstance();
    this.agent = new AIAgent();
    this.automation = new AutomationEngine();
    this.llm = new LLMClient();
    this.builderPlatform = new BuilderPlatform();
    this.loadSecureState();

    this.app = express();
    this.app.use(cors({ origin: config.get().server.corsOrigin }));
    this.app.use(helmet({ contentSecurityPolicy: false }));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.static(path.join(process.cwd(), 'public')));

    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes(): void {
    const router = express.Router();
    router.use(this.verifyUnsafeRequest);

    router.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        version: '1.0.0',
        name: 'NexusBrowser',
        sessions: this.engine.getAllSessions().length,
        uptime: process.uptime(),
      });
    });

    router.get('/api/security/csrf', this.authenticate, (_req, res) => {
      res.json({ token: this.csrfToken() });
    });

    router.get('/api/integrations', this.authenticate, (_req, res) => {
      res.json(getAllIntegrationProfiles());
    });

    router.get('/api/connectors', this.authenticate, (_req, res) => {
      res.json(this.getConnectors());
    });

    router.get('/api/connectors/github/login', this.authenticate, (req, res) => {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) return res.status(400).json({ error: 'GITHUB_CLIENT_ID not configured' });
      const state = uuid();
      const returnTo = String(req.query.returnTo || '/');
      this.oauthStates.set(state, { provider: 'github', createdAt: Date.now(), returnTo });
      const callback = this.githubOAuthCallbackUrl(req);
      const scope = encodeURIComponent('repo read:org project workflow');
      res.json({ url: `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callback)}&scope=${scope}&state=${encodeURIComponent(state)}` });
    });

    router.get('/api/connectors/github/callback', async (req, res) => {
      try {
        const code = String(req.query.code || '');
        const state = String(req.query.state || '');
        const saved = this.oauthStates.get(state);
        this.oauthStates.delete(state);
        if (!code || !saved || saved.provider !== 'github' || Date.now() - saved.createdAt > 10 * 60 * 1000) throw new Error('Invalid or expired GitHub login state');
        const connection = await this.exchangeGitHubOAuthCode(code, req);
        this.connectorConnections.set('github', connection);
        this.saveSecureState();
        res.type('html').send(`<script>window.opener?.postMessage({type:'nexus:connector',provider:'github',status:'connected'}, '*'); window.location.href='${this.escapeHtml(saved.returnTo || '/')}';</script><p>GitHub connected. You can close this window.</p>`);
      } catch (error: any) {
        res.status(400).type('html').send(`<p>GitHub connection failed: ${this.escapeHtml(error.message)}</p>`);
      }
    });

    router.delete('/api/connectors/github', this.authenticate, (_req, res) => {
      this.connectorConnections.delete('github');
      this.saveSecureState();
      res.json({ success: true });
    });

    router.get('/api/builder/seo-security-audit', this.authenticate, async (req, res) => {
      try {
        const sessionId = String(req.query.sessionId || 'default');
        const pageId = String(req.query.pageId || '');
        const buildId = String(req.query.buildId || '');
        const browserContext = this.buildGathererContext(sessionId, pageId);
        const backendContext = buildId ? this.buildBackendObserverContext(buildId) : '';
        res.json(this.createSeoSecurityAudit(browserContext, backendContext));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/stream', (req, res) => {
      if (req.query.apiKey !== config.get().auth.apiKey) return res.status(401).json({ error: 'Unauthorized' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const send = (type: string, data: any) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      const buildId = String(req.query.buildId || '');
      const steps = [
        { label: 'Browser evidence', detail: 'Collect DOM, console, network, screenshots, and backend observations before edits.' },
        { label: 'OpenCode build', detail: 'Route implementation through OpenCode and stream logs from generated workspace.' },
        { label: 'QA loop', detail: 'Run Build Doctor, visual QA, staging devices, SEO, and security checks.' },
      ];
      steps.forEach((step) => send('step', step));
      let ticks = 0;
      const timer = setInterval(() => {
        ticks++;
        const build = buildId ? this.builderPlatform.getBuild(buildId) : undefined;
        const logTail = build?.logPath && fs.existsSync(build.logPath) ? fs.readFileSync(build.logPath, 'utf8').slice(-3000) : '';
        send('tick', { ticks, buildId, status: build?.status || 'no-active-build', previewStatus: build?.previewStatus, logTail });
        if (ticks >= 12) {
          clearInterval(timer);
          send('done', { ok: true, message: 'Streaming timeline finished.' });
          res.end();
        }
      }, 1500);
      req.on('close', () => clearInterval(timer));
    });

    router.get('/api/builder/diff', this.authenticate, async (req, res) => {
      try {
        const root = this.resolveWorkspaceRoot(String(req.query.buildId || ''), String(req.query.root || ''));
        const diff = await this.runSystemCommand(root, process.platform === 'win32' ? 'cmd.exe' : 'git', process.platform === 'win32' ? ['/c', 'git', 'diff', '--', '.'] : ['diff', '--', '.'], 30000);
        const visual = String(req.query.visual || '') === 'true' ? await this.createBrowserNativeDiffPackage(root, String(req.query.sessionId || ''), String(req.query.pageId || '')) : undefined;
        res.json({ root, diff: diff.stdout || diff.stderr || 'No git diff available. Initialize git or make changes first.', files: this.parseDiffFiles(diff.stdout || ''), visual, code: diff.code });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/image-prompt', this.authenticate, (req, res) => {
      try {
        const image = String(req.body?.image || '');
        if (!image.startsWith('data:image/')) return res.status(400).json({ error: 'image data URL required' });
        const root = this.resolveWorkspaceRoot(String(req.body?.buildId || ''), String(req.body?.root || ''));
        const outputDir = path.join(root, '.nexus', 'image-prompts');
        fs.mkdirSync(outputDir, { recursive: true });
        const id = uuid().slice(0, 8);
        const ext = image.includes('image/jpeg') ? 'jpg' : 'png';
        const base64 = image.split(',')[1] || '';
        const filePath = path.join(outputDir, `${id}.${ext}`);
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        const prompt = `Use this browser-captured image as visual context for the next build/edit.\n\nImage artifact: ${filePath}\nUser intent: ${String(req.body?.message || 'Improve the UI based on this screenshot.')}\n\nBrowser-first rules:\n- Compare visible layout, hierarchy, color, typography, spacing, and component states.\n- Map visual observations to concrete source edits.\n- Re-run browser screenshot and visual QA after editing.`;
        res.json({ id, filePath, prompt });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/diff/approve', this.authenticate, async (req, res) => {
      try {
        const root = this.resolveWorkspaceRoot(String(req.body?.buildId || ''), String(req.body?.root || ''));
        const diff = await this.runSystemCommand(root, process.platform === 'win32' ? 'cmd.exe' : 'git', process.platform === 'win32' ? ['/c', 'git', 'diff', '--', '.'] : ['diff', '--', '.'], 30000);
        const approvalDir = path.join(root, '.nexus', 'approvals');
        fs.mkdirSync(approvalDir, { recursive: true });
        const id = uuid().slice(0, 8);
        const approval = { id, root, approvedAt: new Date().toISOString(), reason: req.body?.reason || 'manual approval', diff: diff.stdout || '' };
        fs.writeFileSync(path.join(approvalDir, `${id}.json`), JSON.stringify(approval, null, 2));
        res.json({ id, root, approvedAt: approval.approvedAt, path: path.join(approvalDir, `${id}.json`) });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/diff/rollback-plan', this.authenticate, async (req, res) => {
      try {
        const root = this.resolveWorkspaceRoot(String(req.body?.buildId || ''), String(req.body?.root || ''));
        const diff = await this.runSystemCommand(root, process.platform === 'win32' ? 'cmd.exe' : 'git', process.platform === 'win32' ? ['/c', 'git', 'diff', '--', '.'] : ['diff', '--', '.'], 30000);
        const prompt = `Create a safe rollback plan for this workspace without deleting unrelated user work.\n\nWorkspace: ${root}\n\nDiff to review:\n${(diff.stdout || diff.stderr).slice(0, 20000)}\n\nRules:\n- Identify files changed.\n- Explain what would be reverted.\n- Prefer targeted edits over destructive git reset/checkout.\n- Preserve unrelated user changes.\n- Run build/tests after rollback.`;
        res.json({ root, prompt, command: 'Review this prompt with OpenCode before applying any rollback.', diff: diff.stdout || diff.stderr });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/export-zip', this.authenticate, (req, res) => {
      try {
        const root = this.resolveWorkspaceRoot(String(req.body?.buildId || ''), String(req.body?.root || ''));
        const zipPath = this.createWorkspaceZip(root);
        res.download(zipPath);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/provider-settings', this.authenticate, (_req, res) => {
      const providers = this.builderPlatform.getProviders().map((provider) => ({ ...provider, setting: this.providerSettings.get(provider.id), configured: provider.env.some((key) => Boolean(process.env[key])) }));
      res.json(providers);
    });

    router.post('/api/builder/provider-settings', this.authenticate, (req, res) => {
      const id = String(req.body?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'provider id required' });
      const setting: ProviderSetting = { id, enabled: req.body?.enabled !== false, model: req.body?.model, baseUrl: req.body?.baseUrl, updatedAt: new Date().toISOString() };
      this.providerSettings.set(id, setting);
      this.saveSecureState();
      res.json(setting);
    });

    router.post('/api/builder/provider-settings/:id/validate', this.authenticate, async (req, res) => {
      try {
        const id = req.params.id;
        const provider = this.builderPlatform.getProviders().find((item) => item.id === id);
        if (!provider) return res.status(404).json({ error: 'provider not found' });
        const missing = provider.env.filter((key) => !process.env[key]);
        const configured = missing.length < provider.env.length;
        const live = configured ? await this.validateProviderLive(id).catch((error: any) => ({ ok: false, error: error.message })) : { ok: false, error: 'No configured credential or endpoint found.' };
        res.json({ id, configured, missing, live, checkedAt: new Date().toISOString(), browserUse: `Use ${provider.name} for browser-grounded ${provider.recommendedFor.join(', ')} when configured.` });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/deploy/status', this.authenticate, async (_req, res) => {
      res.json({
        vercel: { connected: Boolean(process.env.VERCEL_TOKEN), env: ['VERCEL_TOKEN'], command: this.deployCommand('vercel').display, cli: await this.checkCommandAvailable('npx') },
        netlify: { connected: Boolean(process.env.NETLIFY_AUTH_TOKEN), env: ['NETLIFY_AUTH_TOKEN', 'NETLIFY_SITE_ID'], command: this.deployCommand('netlify').display, cli: await this.checkCommandAvailable('npx') },
        githubPages: { connected: Boolean(this.githubAccessToken()), env: ['GitHub connector or GITHUB_TOKEN'], command: this.deployCommand('github-pages').display, cli: await this.checkCommandAvailable('npm') },
        browserQa: ['Open deployed URL in Nexus', 'Run Staging Studio', 'Run SEO/Security', 'Sync launch issues to GitHub Project'],
      });
    });

    router.post('/api/builder/deploy', this.authenticate, async (req, res) => {
      try {
        const target = String(req.body?.target || 'vercel');
        const root = this.resolveWorkspaceRoot(String(req.body?.buildId || ''), String(req.body?.root || ''));
        const launch = Boolean(req.body?.launch);
        const plan = this.deployCommand(target);
        const result = launch ? await this.runSystemCommand(root, plan.command, plan.args, 180000) : undefined;
        const deployedUrls = result ? this.extractDeployUrls(`${result.stdout}\n${result.stderr}`) : [];
        res.json({ target, root, command: plan.display, launched: launch, result, deployedUrls, postDeployQa: this.postDeployQaPlan(deployedUrls[0]) });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/git-import', this.authenticate, async (req, res) => {
      try {
        const repoUrl = String(req.body?.repoUrl || '').trim();
        if (!repoUrl) return res.status(400).json({ error: 'repoUrl required' });
        const root = path.resolve(req.body?.root || path.join(process.cwd(), 'imported-projects', this.safeName(path.basename(repoUrl, '.git'))));
        fs.mkdirSync(path.dirname(root), { recursive: true });
        const result = await this.runSystemCommand(path.dirname(root), process.platform === 'win32' ? 'cmd.exe' : 'git', process.platform === 'win32' ? ['/c', 'git', 'clone', repoUrl, root] : ['clone', repoUrl, root], 180000);
        res.json({ repoUrl, root, result, next: 'Open this workspace in the IDE, start preview, then let Nexus inspect it in the browser.' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/expo-create', this.authenticate, async (req, res) => {
      try {
        const name = this.safeName(String(req.body?.name || 'nexus-mobile-app'));
        const root = path.resolve(req.body?.root || path.join(process.cwd(), 'generated-apps'));
        fs.mkdirSync(root, { recursive: true });
        const args = ['create-expo-app@latest', name, '--yes'];
        const result = req.body?.launch === false ? undefined : await this.runSystemCommand(root, process.platform === 'win32' ? 'cmd.exe' : 'npx', process.platform === 'win32' ? ['/c', 'npx', ...args] : args, 240000);
        res.json({ name, root: path.join(root, name), command: `npx ${args.join(' ')}`, launched: req.body?.launch !== false, result, browserConcept: 'Use Staging Studio mobile/app-store presets and browser screenshots as the mobile QA wall.' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/connectors/supabase/status', this.authenticate, (_req, res) => {
      res.json({ connected: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ACCESS_TOKEN)), url: process.env.SUPABASE_URL || '', features: ['schema planning', 'env sync', 'migration prompts', 'browser/API evidence mapping'] });
    });

    router.get('/api/connectors/supabase/schema-plan', this.authenticate, (req, res) => {
      const browserContext = this.buildGathererContext(String(req.query.sessionId || 'default'), String(req.query.pageId || ''));
      res.json(this.createSupabaseSchemaPlan(browserContext));
    });

    router.post('/api/connectors/supabase/query', this.authenticate, async (req, res) => {
      try {
        const table = String(req.body?.table || '').replace(/[^a-zA-Z0-9_]/g, '');
        if (!table) return res.status(400).json({ error: 'table required' });
        const select = String(req.body?.select || '*');
        const limit = Math.max(1, Math.min(Number(req.body?.limit || 25), 100));
        const rows = await this.supabaseRestFetch(`/${table}?select=${encodeURIComponent(select)}&limit=${limit}`);
        res.json({ table, rows, browserUse: 'Map returned rows to visible UI states, empty states, loading states, and API-driven QA checks.' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/chats', this.authenticate, (_req, res) => {
      res.json(Array.from(this.builderChats.entries()).map(([id, messages]) => ({ id, title: this.chatTitles.get(id) || id, messages: messages.length, updatedAt: messages[messages.length - 1]?.timestamp || 0 })));
    });

    router.put('/api/chats/:id', this.authenticate, (req, res) => {
      this.chatTitles.set(req.params.id, String(req.body?.title || req.params.id));
      res.json({ id: req.params.id, title: this.chatTitles.get(req.params.id) });
    });

    router.delete('/api/chats/:id', this.authenticate, (req, res) => {
      this.builderChats.delete(req.params.id);
      this.chatTitles.delete(req.params.id);
      res.json({ success: true });
    });

    router.delete('/api/chats', this.authenticate, (_req, res) => {
      const count = this.builderChats.size;
      this.builderChats.clear();
      this.chatTitles.clear();
      res.json({ success: true, deleted: count });
    });

    router.get('/api/github/status', this.authenticate, (_req, res) => {
      res.json({
        configured: Boolean(this.githubAccessToken()),
        connected: this.connectorConnections.has('github'),
        account: this.connectorConnections.get('github')?.account || '',
        owner: this.githubProjectConnection?.owner || process.env.GITHUB_OWNER || '',
        repo: this.githubProjectConnection?.repo || process.env.GITHUB_REPO || '',
        projectId: this.githubProjectConnection?.projectId || process.env.GITHUB_PROJECT_ID || '',
        projectNumber: this.githubProjectConnection?.projectNumber || Number(process.env.GITHUB_PROJECT_NUMBER || 0) || undefined,
        projectUrl: this.githubProjectConnection?.projectUrl || process.env.GITHUB_PROJECT_URL || '',
      });
    });

    router.get('/api/github/project-connection', this.authenticate, (_req, res) => {
      res.json(this.resolveGitHubConnection());
    });

    router.post('/api/github/project-connection', this.authenticate, (req, res) => {
      const owner = String(req.body?.owner || '').trim();
      const repo = String(req.body?.repo || '').trim();
      if (!owner || !repo) return res.status(400).json({ error: 'owner and repo are required' });
      this.githubProjectConnection = {
        owner,
        repo,
        projectId: String(req.body?.projectId || '').trim() || undefined,
        projectNumber: req.body?.projectNumber ? Number(req.body.projectNumber) : undefined,
        projectUrl: String(req.body?.projectUrl || '').trim() || undefined,
        connectedAt: new Date().toISOString(),
      };
      this.saveSecureState();
      res.json(this.githubProjectConnection);
    });

    router.get('/api/github/repos', this.authenticate, async (req, res) => {
      try {
        const owner = String(req.query.owner || '').trim();
        const path = owner ? `/orgs/${encodeURIComponent(owner)}/repos?per_page=100` : '/user/repos?per_page=100&sort=updated';
        const repos = await this.githubFetch(path);
        res.json(repos.map((repo: any) => ({ name: repo.name, fullName: repo.full_name, private: repo.private, url: repo.html_url, defaultBranch: repo.default_branch })));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/github/issues', this.authenticate, async (req, res) => {
      try {
        const connection = this.resolveGitHubConnection(req.query.owner as string, req.query.repo as string);
        const issues = await this.githubFetch(`/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repo)}/issues?state=all&per_page=50`);
        res.json(issues.filter((issue: any) => !issue.pull_request).map((issue: any) => this.githubIssueSummary(issue)));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/github/issues', this.authenticate, async (req, res) => {
      try {
        const connection = this.resolveGitHubConnection(req.body?.owner, req.body?.repo);
        const issue = await this.createGitHubIssue(connection, String(req.body?.title || ''), String(req.body?.body || ''), Array.isArray(req.body?.labels) ? req.body.labels : ['nexus']);
        res.json(issue);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/github/sync-build-tasks', this.authenticate, async (req, res) => {
      try {
        const connection = this.resolveGitHubConnection(req.body?.owner, req.body?.repo);
        const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
        if (!tasks.length) return res.status(400).json({ error: 'tasks array is required' });
        const created = [];
        for (const task of tasks.slice(0, 25)) {
          const title = String(task.title || task.goal || task.description || task).trim().slice(0, 240);
          const body = [`Created by NexusBrowser from project/build management.`, '', String(task.goal || task.description || task.body || '').trim()].join('\n');
          created.push(await this.createGitHubIssue(connection, title, body, ['nexus', 'build-task']));
        }
        res.json({ connection, created });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/capabilities', this.authenticate, (_req, res) => {
      res.json({
        modes: ['research', 'plan', 'build', 'ui-builder', 'api-mcp', 'database', 'integrations', 'visual-qa', 'ship'],
        uiLooks: ['faithful-clone', 'modern-saas', 'government-clean', 'dashboard-pro', 'mobile-first', 'luxury-editorial', 'dark-neon', 'minimal'],
        buildBrains: this.builderPlatform.getBuildBrains(),
        engines: {
          browser: true,
          browserTabs: true,
          searchResults: true,
          embeddedIde: true,
          opencode: true,
          webgpu: 'client-detected',
          livePreview: true,
          visualBuilder: true,
        },
        outputs: ['research-project', 'project-brain', 'build-plan', 'tailwind-components', 'sdk-agents', 'mcp-server', 'database-schema', 'integration-factory'],
        languageExperts: getLanguageExperts().map((expert) => ({ id: expert.id, category: expert.category, officialGithub: expert.officialGithub })),
        competitiveBlueprint: true,
      });
    });

    router.get('/api/builder/bolt-parity', this.authenticate, (_req, res) => {
      res.json(this.getBoltParityMatrix());
    });

    router.post('/api/builder/browser-intelligence', this.authenticate, async (req, res) => {
      try {
        const sessionId = req.body?.sessionId || 'default';
        const pageId = req.body?.pageId || '';
        const observation = await this.collectGathererObservation(sessionId, pageId);
        res.json({ context: this.buildGathererContext(sessionId, observation.pageId), observation, timeline: this.getGathererTimeline(sessionId, observation.pageId), collectedAt: observation.collectedAt });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/browser-intelligence', this.authenticate, (req, res) => {
      const sessionId = String(req.query.sessionId || 'default');
      const pageId = String(req.query.pageId || '');
      res.json({ timeline: this.getGathererTimeline(sessionId, pageId), context: this.buildGathererContext(sessionId, pageId) });
    });

    router.post('/api/builder/backend-observer', this.authenticate, (req, res) => {
      try {
        const buildId = String(req.body?.buildId || '');
        const observation = this.collectBackendObservation(buildId);
        res.json({ context: this.buildBackendObserverContext(buildId), observation, timeline: this.getBackendObserverTimeline(buildId), collectedAt: observation.collectedAt });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/backend-observer', this.authenticate, (req, res) => {
      const buildId = String(req.query.buildId || '');
      res.json({ timeline: this.getBackendObserverTimeline(buildId), context: this.buildBackendObserverContext(buildId) });
    });

    router.get('/api/browser/search', this.authenticate, async (req, res) => {
      const query = String(req.query.q || '').trim();
      if (!query) return res.json({ query, results: [] });
      try {
        res.json(await this.searchWeb(query));
      } catch (error: any) {
        res.json({ query, results: this.fallbackSearchResults(query), warning: error.message });
      }
    });

    router.get('/api/builder/language-experts', this.authenticate, (_req, res) => {
      res.json(getLanguageExperts());
    });

    router.get('/api/builder/language-experts/:id/update', this.authenticate, async (req, res) => {
      try {
        res.json(await fetchLanguageUpdate(req.params.id));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/competitive-blueprint', this.authenticate, (_req, res) => {
      res.json(getCompetitiveBlueprint());
    });

    router.get('/api/builder/providers', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getProviders());
    });

    router.get('/api/builder/build-brains', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getBuildBrains());
    });

    router.get('/api/builder/deploy-targets', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getDeployTargets());
    });

    router.get('/api/builder/agents', this.authenticate, (_req, res) => {
      res.json(getProjectAgentSwarm());
    });

    router.post('/api/builder/opencode-sessions', this.authenticate, (req, res) => {
      res.json(this.builderPlatform.createOpenCodeSession(req.body?.workspace || process.cwd(), req.body?.prompt || '', req.body?.mode || 'build'));
    });

    router.get('/api/builder/opencode-sessions', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getOpenCodeSessions());
    });

    router.post('/api/builder/snapshots', this.authenticate, (req, res) => {
      res.json(this.builderPlatform.createSnapshot(req.body?.root || process.cwd(), req.body?.reason || 'manual snapshot'));
    });

    router.get('/api/builder/snapshots', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getSnapshots());
    });

    router.post('/api/builder/file-locks', this.authenticate, (req, res) => {
      res.json(this.builderPlatform.lockFile(req.body?.path, req.body?.owner || 'opencode', req.body?.reason || 'agent editing'));
    });

    router.delete('/api/builder/file-locks', this.authenticate, (req, res) => {
      res.json({ success: this.builderPlatform.unlockFile(req.body?.path) });
    });

    router.get('/api/builder/file-locks', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getLocks());
    });

    router.post('/api/builder/visual-qa-plan', this.authenticate, (req, res) => {
      res.json(this.builderPlatform.createVisualQaPlan(req.body?.targetUrl || '', req.body?.localUrl || 'http://localhost:5173'));
    });

    router.post('/api/builder/start-build', this.authenticate, (req, res) => {
      try {
        const build = this.builderPlatform.startBuildFromPrompt(String(req.body?.prompt || 'Build a landing page'), {
          workspaceRoot: req.body?.workspaceRoot,
          uiLook: req.body?.uiLook,
          mode: req.body?.mode || 'build',
          brainMode: req.body?.brainMode,
          aiProvider: req.body?.aiProvider,
          aiModel: req.body?.aiModel,
        });
        res.json(build);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/builds', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getBuilds());
    });

    router.get('/api/builder/doctor-reports', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getDoctorReports());
    });

    router.post('/api/builder/builds/:id/doctor', this.authenticate, async (req, res) => {
      try {
        const report = await this.builderPlatform.runBuildDoctor(req.params.id, { runBuild: req.body?.runBuild !== false, autoHeal: Boolean(req.body?.autoHeal) });
        res.json(report);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/builds/:id/auto-heal', this.authenticate, async (req, res) => {
      try {
        const report = await this.builderPlatform.runBuildDoctor(req.params.id, { runBuild: req.body?.runBuild !== false, autoHeal: true });
        res.json(report);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/builds/:id/auto-heal-loop', this.authenticate, async (req, res) => {
      try {
        const loop = await this.builderPlatform.runAutoHealLoop(req.params.id, {
          threshold: req.body?.threshold,
          maxPasses: req.body?.maxPasses,
          timeoutMs: req.body?.timeoutMs,
        });
        let visualQa = undefined;
        if (req.body?.sessionId && req.body?.pageId && loop.preview?.previewUrl) {
          visualQa = await this.engine.runVisualQaRepair(req.body.sessionId, req.body.pageId, loop.preview.previewUrl, req.body?.outputDir).catch((error) => ({ error: error.message }));
        }
        res.json({ loop, visualQa });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/auto-heal-loops', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getAutoHealLoops());
    });

    router.get('/api/builder/expert-routes', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getExpertRoutes());
    });

    router.post('/api/builder/builds/:id/expert-route', this.authenticate, (req, res) => {
      try {
        res.json(this.builderPlatform.routeExperts(req.params.id));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/builds/:id/memory', this.authenticate, (req, res) => {
      try {
        res.json(this.builderPlatform.getProjectMemory(req.params.id));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/builds/:id/memory', this.authenticate, (req, res) => {
      try {
        res.json(this.builderPlatform.addProjectMemory(req.params.id, {
          type: req.body?.type || 'decision',
          summary: String(req.body?.summary || ''),
          evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : [],
          tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
        }));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/creative-directions', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getCreativeDirections());
    });

    router.post('/api/builder/builds/:id/creative-direction', this.authenticate, (req, res) => {
      try {
        res.json(this.builderPlatform.createCreativeDirection(req.params.id, String(req.body?.styleSeed || '')));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/staging-reports', this.authenticate, (_req, res) => {
      res.json(this.builderPlatform.getStagingReports());
    });

    router.get('/api/builder/staging-reports/:reportId/devices/:deviceId/screenshot', this.authenticate, (req, res) => {
      try {
        res.sendFile(this.builderPlatform.getStagingScreenshot(req.params.reportId, req.params.deviceId));
      } catch (error: any) {
        res.status(404).json({ error: error.message });
      }
    });

    router.post('/api/builder/builds/:id/staging', this.authenticate, async (req, res) => {
      try {
        res.json(await this.builderPlatform.runStagingStudio(req.params.id, {
          devices: Array.isArray(req.body?.devices) ? req.body.devices : undefined,
          runDoctor: Boolean(req.body?.runDoctor),
        }));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/builds/:id/preview', this.authenticate, (req, res) => {
      try {
        res.json(this.builderPlatform.startPreview(req.params.id));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.delete('/api/builder/builds/:id/preview', this.authenticate, (req, res) => {
      try {
        res.json(this.builderPlatform.stopPreview(req.params.id));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/builds/:id/preview-log', this.authenticate, (req, res) => {
      try {
        res.json(this.builderPlatform.getPreviewLog(req.params.id));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/builder/chat', this.authenticate, async (req, res) => {
      const sessionId = req.body?.sessionId || 'default';
      const pageId = req.body?.pageId || '';
      const message = String(req.body?.message || '').trim();
      const mode = this.detectBuilderMode(message, req.body?.mode || 'ui-builder');
      const uiLook = req.body?.uiLook || 'faithful-clone';
      const brainOptions = { brainMode: req.body?.brainMode, aiProvider: req.body?.aiProvider, aiModel: req.body?.aiModel };
      const activeBuildId = String(req.body?.activeBuildId || '');
      const messages = this.builderChats.get(sessionId) || [];
      if (message) messages.push({ role: 'user', content: message, timestamp: Date.now() });
      if (req.body?.browserContext) this.storeExternalGathererObservation(sessionId, pageId, String(req.body.browserContext));
      const gathererContext = await this.collectGathererObservation(sessionId, pageId)
        .then((observation) => this.buildGathererContext(sessionId, observation.pageId))
        .catch((error) => this.buildGathererContext(sessionId, pageId) || `Browser intelligence unavailable: ${error.message}`);
      const backendContext = activeBuildId
        ? (() => {
          try {
            this.collectBackendObservation(activeBuildId);
            return this.buildBackendObserverContext(activeBuildId);
          } catch (error: any) {
            return `Backend Observer unavailable: ${error.message}`;
          }
        })()
        : 'Backend Observer has no active generated workspace yet. Start or select a build to inspect server/API/data functionality.';
      const browserContext = `${gathererContext}\n\n${backendContext}`;
      const chat = await this.runBuilderConductor(message, mode, uiLook, browserContext, messages, activeBuildId);
      let response = chat.response;
      messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
      let build = undefined;
      let update = undefined;
      const needsBrowserGrounding = this.shouldRequireBrowserGrounding(message, mode, gathererContext);
      if (needsBrowserGrounding) {
        chat.actions = this.browserGroundingActions(message, chat.actions);
        response = `${response}\n\nBrowser grounding required before build. Open a target page, run Research Project, then build from the captured DOM, styles, network, console, screenshots, and API evidence.`;
        messages.push({
          role: 'assistant',
          content: 'Browser grounding required before build. Open a target page, run Research Project, then build from the captured DOM, styles, network, console, screenshots, and API evidence.',
          timestamp: Date.now(),
        });
      } else if (activeBuildId && this.shouldUpdateBuild(message, mode)) {
        const targetBuildId = this.builderPlatform.getBuild(activeBuildId)?.id || this.builderPlatform.getBuilds().slice(-1)[0]?.id;
        if (!targetBuildId) throw new Error('No generated build workspace yet. Ask Build Mode to create one first.');
        update = this.builderPlatform.updateBuildFromChat(targetBuildId, message, { uiLook, mode, browserContext, ...brainOptions });
        messages.push({
          role: 'assistant',
          content: `App update started.\n\nWorkspace: ${update.workspace}\nSession: ${update.session.id}\nLog: ${update.logPath}\nI will restart the preview when the update command finishes.`,
          timestamp: Date.now(),
        });
      } else if (this.shouldStartBuild(message, mode)) {
        build = this.builderPlatform.startBuildFromPrompt(message, { uiLook, mode, browserContext, ...brainOptions });
        messages.push({
          role: 'assistant',
          content: `Build started.\n\nWorkspace: ${build.root}\nStatus: ${build.status}\nPreview command: ${build.previewCommand}\nOpenCode log: ${build.logPath}`,
          timestamp: Date.now(),
        });
      }
      this.builderChats.set(sessionId, messages.slice(-100));
      res.json({ response, messages: this.builderChats.get(sessionId), build, update, actions: chat.actions, source: chat.source });
    });

    router.get('/api/sessions', this.authenticate, (_req, res) => {
      res.json(this.engine.getAllSessions());
    });

    router.post('/api/sessions', this.authenticate, async (_req, res) => {
      try {
        const session = await this.engine.createSession();
        res.json(session);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.delete('/api/sessions/:id', this.authenticate, async (req, res) => {
      await this.engine.destroySession(req.params.id);
      res.json({ success: true });
    });

    router.get('/api/sessions/:id/pages', this.authenticate, (req, res) => {
      const session = this.engine.getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(this.engine.getSessionInfo(session).pages);
    });

    router.post('/api/sessions/:id/pages', this.authenticate, async (req, res) => {
      try {
        const page = await this.engine.createNewPage(req.params.id);
        res.json(page);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/sessions/:sid/pages/:pid/action', this.authenticate, async (req, res) => {
      const result = await this.engine.executeAction(req.params.sid, req.params.pid, req.body);
      res.json(result);
    });

    router.get('/api/sessions/:sid/pages/:pid/content', this.authenticate, async (req, res) => {
      const content = await this.engine.getPageContent(req.params.sid, req.params.pid);
      res.json({ content });
    });

    router.get('/api/sessions/:sid/pages/:pid/screenshot', this.authenticate, async (req, res) => {
      const buf = await this.engine.getPageScreenshot(req.params.sid, req.params.pid);
      if (buf) {
        res.setHeader('Content-Type', 'image/png');
        res.send(buf);
      } else {
        res.status(404).json({ error: 'Screenshot failed' });
      }
    });

    router.get('/api/sessions/:sid/pages/:pid/elements', this.authenticate, async (req, res) => {
      const elements = await this.engine.getInteractiveElements(req.params.sid, req.params.pid);
      res.json(elements);
    });

    router.post('/api/sessions/:sid/pages/:pid/clone-snapshot', this.authenticate, async (req, res) => {
      try {
        const snapshot = await this.engine.captureCloneSnapshot(req.params.sid, req.params.pid);
        if (req.body?.save) {
          const outputDir = this.saveCloneSnapshot(snapshot, req.body.outputDir);
          return res.json({ snapshot, outputDir });
        }
        res.json(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/sessions/:sid/pages/:pid/api-discovery', this.authenticate, async (req, res) => {
      try {
        const catalog = await this.engine.discoverApiEndpoints(req.params.sid, req.params.pid);
        if (req.body?.save !== false) {
          const outputDir = this.engine.saveApiDiscoveryCatalog(catalog, req.body?.outputDir);
          return res.json({ catalog, outputDir });
        }
        res.json(catalog);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/sessions/:sid/pages/:pid/api-crawl', this.authenticate, async (req, res) => {
      try {
        const catalog = await this.engine.crawlApiDiscovery(req.params.sid, req.params.pid, req.body || {});
        const outputDir = this.engine.saveApiDiscoveryCatalog(catalog, req.body?.outputDir);
        res.json({ catalog, outputDir });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/sessions/:sid/pages/:pid/ui-intelligence', this.authenticate, async (req, res) => {
      try {
        const report = await this.engine.captureUiIntelligence(req.params.sid, req.params.pid);
        if (req.body?.save !== false) {
          const outputDir = this.engine.saveUiIntelligenceReport(report, req.body?.outputDir);
          return res.json({ report, outputDir });
        }
        res.json(report);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/sessions/:sid/pages/:pid/build-overlay', this.authenticate, async (req, res) => {
      try {
        const plan = await this.engine.createBuildOverlayPlan(req.params.sid, req.params.pid);
        res.json(plan);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/sessions/:sid/pages/:pid/visual-qa-repair', this.authenticate, async (req, res) => {
      try {
        const run = await this.engine.runVisualQaRepair(req.params.sid, req.params.pid, req.body?.localUrl || 'http://localhost:5173', req.body?.outputDir);
        res.json(run);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/sessions/:sid/pages/:pid/browser-shakedown', this.authenticate, async (req, res) => {
      try {
        const report = await this.createBrowserShakedown(req.params.sid, req.params.pid, String(req.body?.buildId || ''));
        res.json(report);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/sessions/:sid/pages/:pid/side-by-side-visual-diff', this.authenticate, async (req, res) => {
      try {
        const build = req.body?.buildId ? this.builderPlatform.getBuild(String(req.body.buildId)) : undefined;
        const localUrl = req.body?.localUrl || build?.previewUrl;
        if (!localUrl) return res.status(400).json({ error: 'localUrl or buildId with running preview required' });
        const run = await this.engine.runVisualQaRepair(req.params.sid, req.params.pid, localUrl, req.body?.outputDir || build?.root);
        res.json({ ...run, sideBySide: this.createSideBySideVisualDiff(run) });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/builder/vision-routes', this.authenticate, (_req, res) => {
      res.json(this.getVisionRoutes());
    });

    router.post('/api/sessions/:sid/pages/:pid/research-project', this.authenticate, async (req, res) => {
      try {
        const result = await this.engine.createResearchProject(req.params.sid, req.params.pid, req.body || {});
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/agent/task', this.authenticate, async (req, res) => {
      const { goal, sessionId, pageId } = req.body;
      const task = await this.agent.startTask(goal, sessionId, pageId);
      res.json(task);
    });

    router.get('/api/agent/tasks', this.authenticate, (_req, res) => {
      res.json(this.agent.getAllTasks());
    });

    router.get('/api/agent/tasks/:id', this.authenticate, (req, res) => {
      const task = this.agent.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    });

    router.post('/api/automation/scripts', this.authenticate, (req, res) => {
      const script = this.automation.createScript(req.body);
      res.json(script);
    });

    router.get('/api/automation/scripts', this.authenticate, (_req, res) => {
      res.json(this.automation.getAllScripts());
    });

    router.get('/api/automation/scripts/:id', this.authenticate, (req, res) => {
      const script = this.automation.getScript(req.params.id);
      if (!script) return res.status(404).json({ error: 'Script not found' });
      res.json(script);
    });

    router.put('/api/automation/scripts/:id', this.authenticate, (req, res) => {
      const script = this.automation.updateScript(req.params.id, req.body);
      if (!script) return res.status(404).json({ error: 'Script not found' });
      res.json(script);
    });

    router.delete('/api/automation/scripts/:id', this.authenticate, (req, res) => {
      this.automation.deleteScript(req.params.id);
      res.json({ success: true });
    });

    router.post('/api/automation/scripts/:id/run', this.authenticate, async (req, res) => {
      try {
        const exec = await this.automation.runScript(req.params.id, req.body.sessionId);
        res.json(exec);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/auth/token', (req, res) => {
      const { apiKey } = req.body;
      if (apiKey !== config.get().auth.apiKey) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      const token = jwt.sign({ role: 'admin' }, config.get().auth.jwtSecret, { expiresIn: '24h' });
      res.json({ token });
    });

    this.app.use(router);
  }

  private saveCloneSnapshot(snapshot: Awaited<ReturnType<BrowserEngine['captureCloneSnapshot']>>, outputRoot?: string): string {
    const safeTitle = (snapshot.title || 'site')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'site';
    const timestamp = snapshot.capturedAt.replace(/[:.]/g, '-');
    const root = outputRoot ? path.resolve(outputRoot) : path.join(process.cwd(), 'clones');
    const outputDir = path.join(root, `${safeTitle}-${timestamp}`);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
    fs.writeFileSync(path.join(outputDir, 'source.html'), snapshot.html);
    fs.writeFileSync(path.join(outputDir, 'opencode-prompt.md'), snapshot.opencodePrompt);
    fs.writeFileSync(path.join(outputDir, 'tailwind-ui.md'), snapshot.tailwindInventory);
    fs.writeFileSync(path.join(outputDir, 'TailwindPage.tsx'), snapshot.tailwindComponent);
    fs.writeFileSync(path.join(outputDir, 'screenshot.png'), Buffer.from(snapshot.screenshot, 'base64'));

    return outputDir;
  }

  private async searchWeb(query: string): Promise<{ query: string; results: Array<{ title: string; url: string; snippet: string; source: string }> }> {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'NexusBrowser/1.0 research browser' } });
    if (!response.ok) throw new Error(`Search failed with HTTP ${response.status}`);
    const html = await response.text();
    const results = Array.from(html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/g))
      .slice(0, 10)
      .map((match) => {
        const rawUrl = this.decodeHtml(match[1]);
        const parsedUrl = rawUrl.match(/[?&]uddg=([^&]+)/)?.[1];
        const finalUrl = parsedUrl ? decodeURIComponent(parsedUrl) : rawUrl;
        return {
          title: this.stripHtml(match[2]),
          url: finalUrl,
          snippet: this.stripHtml(match[3]),
          source: 'DuckDuckGo',
        };
      })
      .filter((item) => item.title && item.url);
    return { query, results: results.length ? results : this.fallbackSearchResults(query) };
  }

  private fallbackSearchResults(query: string): Array<{ title: string; url: string; snippet: string; source: string }> {
    const encoded = encodeURIComponent(query);
    return [
      { title: `Search the web for ${query}`, url: `https://www.google.com/search?q=${encoded}`, snippet: 'Open Google results in a browser tab for research and app-building context.', source: 'Google' },
      { title: `Developer docs for ${query}`, url: `https://github.com/search?q=${encoded}&type=repositories`, snippet: 'Search GitHub repositories to understand APIs, SDKs, frameworks, and examples.', source: 'GitHub' },
      { title: `Technical references for ${query}`, url: `https://developer.mozilla.org/search?q=${encoded}`, snippet: 'Search MDN and web platform references for browser behavior and APIs.', source: 'MDN' },
    ];
  }

  private stripHtml(value: string): string {
    return this.decodeHtml(value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  }

  private decodeHtml(value: string): string {
    return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
  }

  private getConnectors(): any[] {
    const github = this.connectorConnections.get('github');
    return [
      {
        id: 'github',
        name: 'GitHub',
        category: 'code-project-management',
        connected: Boolean(github || process.env.GITHUB_TOKEN),
        oauthReady: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
        account: github?.account || (process.env.GITHUB_TOKEN ? 'token-env' : ''),
        features: ['login', 'repos', 'issues', 'projects-v2', 'task-sync', 'actions'],
        security: ['OAuth state protection', 'server-side token storage', 'no token returned to browser'],
      },
      { id: 'seo', name: 'SEO Auditor', category: 'launch-quality', connected: true, oauthReady: false, features: ['metadata', 'social cards', 'headings', 'robots', 'sitemap', 'performance checklist'], security: [] },
      { id: 'security', name: 'Security Auditor', category: 'launch-quality', connected: true, oauthReady: false, features: ['headers', 'secret checks', 'auth risks', 'dependency risk prompts', 'form/API review'], security: [] },
      { id: 'vercel', name: 'Vercel', category: 'deploy', connected: Boolean(process.env.VERCEL_TOKEN), oauthReady: false, features: ['deployments', 'env-vars', 'preview-links'], security: ['server-side token only'] },
      { id: 'supabase', name: 'Supabase', category: 'database-auth', connected: Boolean(process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY), oauthReady: false, features: ['database', 'auth', 'storage', 'edge-functions'], security: ['server-side service key only'] },
      { id: 'stripe', name: 'Stripe', category: 'payments', connected: Boolean(process.env.STRIPE_SECRET_KEY), oauthReady: false, features: ['checkout', 'subscriptions', 'webhooks', 'customer portal'], security: ['server-side secret key only'] },
    ];
  }

  private getBoltParityMatrix(): any {
    const providerCount = this.builderPlatform.getProviders().length;
    const feature = (area: string, boltFeature: string, nexusStatus: 'live' | 'partial' | 'planned', browserAdvantage: string, actions: string[]) => ({ area, boltFeature, nexusStatus, browserAdvantage, actions });
    const features = [
      feature('Models', '19+ provider integrations and OpenAI-like endpoints', providerCount >= 19 ? 'live' : 'partial', 'Route models by browser task: research, vision/UI, code repair, QA, SEO, security, and deployment.', ['Open Providers', 'Choose Build Brain']),
      feature('Browser Build', 'Prompt, run, edit full-stack apps in browser', 'live', 'Nexus starts from real target pages, DOM, network, console, screenshots, and generated previews instead of prompt-only context.', ['Open target URL', 'Research Project', 'Build From Browser']),
      feature('Images', 'Attach images to prompts', 'partial', 'Nexus captures screenshots from the browser and can use page evidence as the image/context source.', ['Take Screenshot', 'Visual QA Repair']),
      feature('Terminal', 'Integrated terminal for commands', 'partial', 'Nexus has an IDE terminal surface plus browser preview/log observers; terminal wiring should be hardened next.', ['Open IDE', 'Build Doctor']),
      feature('Snapshots/Revert', 'Restore previous project versions', 'live', 'Snapshots are tied to browser evidence, build logs, QA reports, and project memory.', ['Snapshot', 'Project Memory']),
      feature('Export/Sync', 'Download projects as ZIP and sync folder', 'planned', 'Browser-first export should include source, screenshots, API discoveries, QA reports, and launch checklist.', ['Create Snapshot', 'Open IDE']),
      feature('Docker', 'Docker support', 'partial', 'Nexus can generate Docker/deploy tasks and should verify containers through browser health checks.', ['Platform', 'SEO/Security']),
      feature('Deploy', 'Deploy to Netlify, Vercel, GitHub Pages', 'partial', 'Deploy readiness is browser-verified with preview health, SEO/security, and staging device reports.', ['Connectors', 'Staging Studio']),
      feature('Desktop', 'Electron app', 'live', 'Nexus desktop is a browser cockpit with popout chat, IDE, previews, and external target pages.', ['Desktop', 'Popout Chat']),
      feature('Data Viz', 'Charts, graphs, analysis tools', 'partial', 'Nexus can derive charts from crawled APIs/network data and backend observations.', ['API/MCP', 'Research Project']),
      feature('Git', 'Clone, import, deployment capabilities', 'partial', 'GitHub connector adds login, repo/project connection, issues, Projects v2 linking, and build task sync.', ['Connect GitHub', 'Sync Build Tasks']),
      feature('MCP', 'Model Context Protocol support', 'live', 'Nexus discovers APIs from websites and turns them into MCP/server SDK tasks.', ['API/MCP', 'Research Project']),
      feature('Search', 'Codebase search/navigation', 'live', 'Nexus combines code search with web search and live browser research.', ['Browser Search', 'Open IDE']),
      feature('File Locks', 'Prevent AI edit conflicts', 'live', 'Locks can be paired with browser/visual diff approvals before risky edits.', ['Platform', 'Snapshot']),
      feature('Diff View', 'Visual representation of AI changes', 'partial', 'Nexus advantage is source diff plus browser visual QA/diff; source diff panel remains next.', ['Visual QA Repair', 'Build Doctor']),
      feature('Supabase', 'Database management and queries', 'partial', 'Supabase is a connector/integration target with browser-backed API and schema discovery.', ['Connectors', 'Database Architect']),
      feature('Expo', 'React Native app creation', 'planned', 'Mobile output should use browser/device wall checks and app-store screenshot presets.', ['Staging Studio', 'Mobile First']),
      feature('Voice', 'Voice prompting', 'partial', 'Browser-native speech input can feed the same grounded chat/build flow.', ['Voice Prompt', 'Chat']),
      feature('Bulk Chat', 'Delete/manage chats in bulk', 'planned', 'Nexus should manage chats as research/build sessions with browser evidence and project memory.', ['Project Memory']),
      feature('Docs/Planning', 'Generated project plans in markdown', 'live', 'Research Project creates project brain, build plan, OpenCode prompts, API outputs, and QA repair tasks.', ['Research Project', 'Plan Mode']),
      feature('SEO/Security', 'Quality and security workflows', 'live', 'Nexus audits rendered pages/backend context for metadata, headers, secrets, console errors, and launch risks.', ['SEO/Security Audit']),
    ];
    return {
      source: 'bolt.diy README public feature list',
      providerCount,
      summary: 'Nexus now tracks bolt.diy parity while translating each feature into a browser-first workflow: inspect live evidence, build with OpenCode, verify in preview, then manage/deploy through connectors.',
      features,
      gaps: features.filter((item) => item.nexusStatus !== 'live'),
    };
  }

  private resolveWorkspaceRoot(buildId: string, requestedRoot: string): string {
    const build = buildId ? this.builderPlatform.getBuild(buildId) : undefined;
    const root = path.resolve(build?.root || requestedRoot || process.cwd());
    if (!fs.existsSync(root)) throw new Error(`Workspace not found: ${root}`);
    return root;
  }

  private verifyUnsafeRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (req.path === '/api/auth/token') return next();
    const apiKey = req.headers['x-api-key'];
    const csrf = req.headers['x-csrf-token'];
    if (apiKey === config.get().auth.apiKey && csrf === this.csrfToken()) return next();
    res.status(403).json({ error: 'Unsafe request missing valid CSRF token' });
  };

  private csrfToken(): string {
    return crypto.createHmac('sha256', config.get().auth.jwtSecret).update(config.get().auth.apiKey).digest('hex');
  }

  private parseDiffFiles(diff: string): Array<{ path: string; additions: number; deletions: number }> {
    const files: Array<{ path: string; additions: number; deletions: number }> = [];
    let current: { path: string; additions: number; deletions: number } | undefined;
    for (const line of diff.split('\n')) {
      const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (header) {
        current = { path: header[2], additions: 0, deletions: 0 };
        files.push(current);
      } else if (current && line.startsWith('+') && !line.startsWith('+++')) current.additions++;
      else if (current && line.startsWith('-') && !line.startsWith('---')) current.deletions++;
    }
    return files;
  }

  private async createBrowserNativeDiffPackage(root: string, sessionId: string, pageId: string): Promise<any> {
    const id = uuid().slice(0, 8);
    const outputDir = path.join(root, '.nexus', 'diff-review', id);
    fs.mkdirSync(outputDir, { recursive: true });
    let screenshotPath = '';
    if (sessionId && pageId) {
      try {
        const screenshot = await this.engine.getPageScreenshot(sessionId, pageId);
        screenshotPath = path.join(outputDir, 'browser-after.png');
        fs.writeFileSync(screenshotPath, Buffer.from(String(screenshot).replace(/^data:image\/\w+;base64,/, ''), 'base64'));
      } catch {}
    }
    const pkg = {
      id,
      root,
      outputDir,
      screenshotPath,
      reviewChecklist: [
        'Read source diff file-by-file',
        'Compare rendered browser screenshot against target/product intent',
        'Run Build Doctor for code/runtime health',
        'Run Visual QA or Staging Studio before approval',
        'Approve only if source diff and browser behavior both match the request',
      ],
    };
    fs.writeFileSync(path.join(outputDir, 'browser-native-diff.json'), JSON.stringify(pkg, null, 2));
    return pkg;
  }

  private createWorkspaceZip(root: string): string {
    const zip = new AdmZip();
    const outputDir = path.join(root, '.nexus', 'exports');
    fs.mkdirSync(outputDir, { recursive: true });
    const zipPath = path.join(outputDir, `${path.basename(root)}-${Date.now()}.zip`);
    for (const file of this.listExportFiles(root)) {
      zip.addLocalFile(file.fullPath, path.dirname(file.relativePath));
    }
    zip.addFile('.nexus/export-manifest.json', Buffer.from(JSON.stringify({ root, exportedAt: new Date().toISOString(), browserFirst: true }, null, 2)));
    zip.writeZip(zipPath);
    return zipPath;
  }

  private listExportFiles(root: string): Array<{ fullPath: string; relativePath: string }> {
    const files: Array<{ fullPath: string; relativePath: string }> = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'dist', 'release'].includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(root, fullPath);
        if (entry.isDirectory()) walk(fullPath);
        else if (fs.statSync(fullPath).size < 10 * 1024 * 1024) files.push({ fullPath, relativePath });
      }
    };
    walk(root);
    return files.slice(0, 5000);
  }

  private secureStatePath(): string {
    return path.join(process.cwd(), '.nexus', 'secure-state.enc');
  }

  private secureStateKey(): Buffer {
    return crypto.createHash('sha256').update(process.env.NEXUS_SECRET_KEY || config.get().auth.jwtSecret || 'nexus-dev-secret').digest();
  }

  private loadSecureState(): void {
    const filePath = this.secureStatePath();
    if (!fs.existsSync(filePath)) return;
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.secureStateKey(), Buffer.from(payload.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
      const text = `${decipher.update(payload.data, 'base64', 'utf8')}${decipher.final('utf8')}`;
      const state = JSON.parse(text);
      this.connectorConnections = new Map(Object.entries(state.connectorConnections || {}) as Array<[string, ConnectorConnection]>);
      this.providerSettings = new Map(Object.entries(state.providerSettings || {}) as Array<[string, ProviderSetting]>);
      this.githubProjectConnection = state.githubProjectConnection;
    } catch (error: any) {
      log.warn(`Secure state could not be loaded: ${error.message}`);
    }
  }

  private saveSecureState(): void {
    try {
      const filePath = this.secureStatePath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.secureStateKey(), iv);
      const state = {
        savedAt: new Date().toISOString(),
        connectorConnections: Object.fromEntries(this.connectorConnections),
        providerSettings: Object.fromEntries(this.providerSettings),
        githubProjectConnection: this.githubProjectConnection,
      };
      const data = `${cipher.update(JSON.stringify(state), 'utf8', 'base64')}${cipher.final('base64')}`;
      fs.writeFileSync(filePath, JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data }, null, 2));
    } catch (error: any) {
      log.warn(`Secure state could not be saved: ${error.message}`);
    }
  }

  private extractDeployUrls(output: string): string[] {
    const urls = new Set<string>();
    for (const match of output.matchAll(/https:\/\/[^\s)>'"]+/g)) {
      const url = match[0].replace(/[.,;]+$/, '');
      if (/vercel\.app|netlify\.app|github\.io|pages\.dev|onrender\.com|railway\.app/i.test(url)) urls.add(url);
    }
    return Array.from(urls);
  }

  private postDeployQaPlan(url?: string): any {
    return {
      url: url || '',
      steps: [
        url ? `Open ${url} in Nexus browser` : 'Paste deployed URL into Nexus browser',
        'Run browser intelligence to capture DOM, network, console, storage, and screenshot evidence',
        'Run Staging Studio across desktop, tablet, mobile, game, and app-store mobile presets',
        'Run SEO/Security audit for metadata, social cards, headers, secret exposure, and launch risks',
        'Sync failures to GitHub Project as launch-blocking issues',
      ],
    };
  }

  private async createBrowserShakedown(sessionId: string, pageId: string, buildId: string): Promise<any> {
    const startedAt = new Date().toISOString();
    const [gatherer, screenshot, content] = await Promise.all([
      this.collectGathererObservation(sessionId, pageId).catch((error: any) => ({ error: error.message })),
      this.engine.getPageScreenshot(sessionId, pageId).catch(() => null),
      this.engine.getPageContent(sessionId, pageId).catch(() => ''),
    ]);
    const build = buildId ? this.builderPlatform.getBuild(buildId) : undefined;
    const backend = build ? this.collectBackendObservation(build.id) : undefined;
    const seoSecurity = this.createSeoSecurityAudit(this.buildGathererContext(sessionId, pageId), build ? this.buildBackendObserverContext(build.id) : '');
    const outputDir = path.join(build?.root || process.cwd(), '.nexus', 'browser-shakedown', startedAt.replace(/[:.]/g, '-'));
    fs.mkdirSync(outputDir, { recursive: true });
    const screenshotPath = screenshot ? path.join(outputDir, 'active-browser.png') : '';
    if (screenshotPath && screenshot) fs.writeFileSync(screenshotPath, screenshot);
    const report = {
      startedAt,
      sessionId,
      pageId,
      buildId: build?.id || '',
      outputDir,
      screenshotPath,
      browser: gatherer,
      backend,
      seoSecurity,
      checks: {
        contentLength: content.length,
        hasRenderedContent: content.length > 200,
        hasScreenshot: Boolean(screenshotPath),
        hasConsoleErrors: Boolean((gatherer as any).signals?.hasConsoleErrors),
        hasPreview: Boolean(build?.previewUrl),
      },
      next: ['Run side-by-side visual diff if a preview exists', 'Run Build Doctor', 'Approve diff only after browser checks pass', 'Sync failures to GitHub Project'],
    };
    fs.writeFileSync(path.join(outputDir, 'browser-shakedown.json'), JSON.stringify(report, null, 2));
    return report;
  }

  private createSideBySideVisualDiff(run: any): any {
    return {
      targetScreenshot: run.artifacts?.targetScreenshot,
      localScreenshot: run.artifacts?.localScreenshot,
      diffJson: run.artifacts?.diffJson,
      scores: run.scores,
      reviewOrder: ['targetScreenshot', 'localScreenshot', 'scores', 'findings', 'repairPrompt'],
      browserFirstApprovalRule: 'Approve source changes only when generated preview matches the target browser evidence and Build Doctor is healthy.',
    };
  }

  private getVisionRoutes(): any[] {
    return this.builderPlatform.getProviders()
      .filter((provider) => provider.capabilities.includes('vision'))
      .map((provider) => ({
        id: provider.id,
        name: provider.name,
        configured: provider.env.some((key) => Boolean(process.env[key])) || Boolean(this.providerSettings.get(provider.id)),
        browserUse: 'Use active browser screenshots, target/preview visual diff images, and image prompt artifacts for UI repair and clone quality.',
      }));
  }

  private async validateProviderLive(id: string): Promise<{ ok: boolean; detail: string }> {
    const setting = this.providerSettings.get(id);
    if (id === 'openai' && process.env.OPENAI_API_KEY) return this.validateJsonEndpoint('https://api.openai.com/v1/models', { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` });
    if (id === 'anthropic' && process.env.ANTHROPIC_API_KEY) return this.validateJsonEndpoint('https://api.anthropic.com/v1/models?limit=1', { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' });
    if (id === 'github-models' && this.githubAccessToken()) return this.validateJsonEndpoint('https://models.inference.ai.azure.com/models', { Authorization: `Bearer ${this.githubAccessToken()}` });
    if (id === 'ollama') return this.validateJsonEndpoint(`${process.env.OLLAMA_BASE_URL || setting?.baseUrl || 'http://127.0.0.1:11434'}/api/tags`, {});
    if (id === 'lmstudio') return this.validateJsonEndpoint(`${process.env.LMSTUDIO_BASE_URL || setting?.baseUrl || 'http://127.0.0.1:1234'}/v1/models`, {});
    if (id === 'openrouter' && process.env.OPENROUTER_API_KEY) return this.validateJsonEndpoint('https://openrouter.ai/api/v1/models', { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` });
    if (id === 'groq' && process.env.GROQ_API_KEY) return this.validateJsonEndpoint('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${process.env.GROQ_API_KEY}` });
    if (id === 'deepseek' && process.env.DEEPSEEK_API_KEY) return this.validateJsonEndpoint('https://api.deepseek.com/models', { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` });
    if (id === 'openai-compatible' && process.env.OPENAI_COMPATIBLE_BASE_URL && process.env.OPENAI_COMPATIBLE_API_KEY) return this.validateJsonEndpoint(`${process.env.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/, '')}/models`, { Authorization: `Bearer ${process.env.OPENAI_COMPATIBLE_API_KEY}` });
    return { ok: true, detail: 'Configuration present. Live validation for this provider is not implemented yet; route through OpenAI-compatible settings if available.' };
  }

  private async validateJsonEndpoint(url: string, headers: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal });
      return { ok: response.ok, detail: response.ok ? `Validated ${url}` : `${response.status}: ${(await response.text()).slice(0, 500)}` };
    } finally {
      clearTimeout(timer);
    }
  }

  private async checkCommandAvailable(command: string): Promise<{ available: boolean; detail: string }> {
    const result = await this.runSystemCommand(process.cwd(), process.platform === 'win32' ? 'cmd.exe' : command, process.platform === 'win32' ? ['/c', command, '--version'] : ['--version'], 8000);
    return { available: result.code === 0, detail: (result.stdout || result.stderr || '').split('\n')[0] || `exit ${result.code}` };
  }

  private deployCommand(target: string): { command: string; args: string[]; display: string } {
    const normalized = target.toLowerCase();
    if (normalized === 'netlify') {
      const args = ['netlify', 'deploy', ...(process.env.NETLIFY_AUTH_TOKEN ? ['--auth', process.env.NETLIFY_AUTH_TOKEN] : []), ...(process.env.NETLIFY_SITE_ID ? ['--site', process.env.NETLIFY_SITE_ID] : [])];
      return process.platform === 'win32' ? { command: 'cmd.exe', args: ['/c', 'npx', ...args], display: `npx ${args.map((arg) => arg === process.env.NETLIFY_AUTH_TOKEN ? '$NETLIFY_AUTH_TOKEN' : arg).join(' ')}` } : { command: 'npx', args, display: `npx ${args.map((arg) => arg === process.env.NETLIFY_AUTH_TOKEN ? '$NETLIFY_AUTH_TOKEN' : arg).join(' ')}` };
    }
    if (normalized === 'github-pages') return process.platform === 'win32' ? { command: 'cmd.exe', args: ['/c', 'npm', 'run', 'deploy'], display: 'npm run deploy' } : { command: 'npm', args: ['run', 'deploy'], display: 'npm run deploy' };
    const args = ['vercel', '--yes', ...(process.env.VERCEL_TOKEN ? ['--token', process.env.VERCEL_TOKEN] : [])];
    return process.platform === 'win32' ? { command: 'cmd.exe', args: ['/c', 'npx', ...args], display: `npx ${args.map((arg) => arg === process.env.VERCEL_TOKEN ? '$VERCEL_TOKEN' : arg).join(' ')}` } : { command: 'npx', args, display: `npx ${args.map((arg) => arg === process.env.VERCEL_TOKEN ? '$VERCEL_TOKEN' : arg).join(' ')}` };
  }

  private runSystemCommand(cwd: string, command: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, env: process.env, shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      child.stdout?.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-20000); });
      child.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-20000); });
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}`, timedOut });
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut });
      });
    });
  }

  private safeName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || `nexus-${uuid().slice(0, 8)}`;
  }

  private githubAccessToken(): string {
    return this.connectorConnections.get('github')?.accessToken || process.env.GITHUB_TOKEN || '';
  }

  private githubOAuthCallbackUrl(req: express.Request): string {
    const configured = process.env.GITHUB_CALLBACK_URL;
    if (configured) return configured;
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
    return `${proto}://${req.get('host')}/api/connectors/github/callback`;
  }

  private async exchangeGitHubOAuthCode(code: string, req: express.Request): Promise<ConnectorConnection> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required for login');
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: this.githubOAuthCallbackUrl(req) }),
    });
    const tokenData: any = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || 'GitHub did not return an access token');
    const prior = this.connectorConnections.get('github');
    this.connectorConnections.set('github', { id: 'github', provider: 'github', account: 'connecting', accessToken: tokenData.access_token, scopes: String(tokenData.scope || '').split(',').filter(Boolean), connectedAt: new Date().toISOString() });
    try {
      const user = await this.githubFetch('/user');
      return { id: 'github', provider: 'github', account: user.login || 'github-user', accessToken: tokenData.access_token, scopes: String(tokenData.scope || '').split(',').filter(Boolean), connectedAt: new Date().toISOString() };
    } catch (error) {
      if (prior) this.connectorConnections.set('github', prior);
      else this.connectorConnections.delete('github');
      throw error;
    }
  }

  private createSeoSecurityAudit(browserContext: string, backendContext: string): any {
    const context = `${browserContext}\n${backendContext}`;
    const hasTitle = /Title:|<title/i.test(context);
    const hasConsoleErrors = /Console errors: [1-9]|error/i.test(context);
    const hasEnvKeys = /Env keys:|[A-Z0-9_]+_KEY|SECRET|TOKEN/i.test(context);
    const seoIssues = [
      !hasTitle ? 'Missing or unknown page title from browser evidence.' : '',
      !/description|meta/i.test(context) ? 'Verify meta description and social preview tags.' : '',
      !/h1|heading/i.test(context) ? 'Verify one clear H1 and logical heading order.' : '',
      'Generate sitemap.xml and robots.txt for deployable apps.',
      'Add Open Graph and Twitter card metadata for share previews.',
    ].filter(Boolean);
    const securityIssues = [
      hasConsoleErrors ? 'Resolve console/runtime errors before launch.' : '',
      hasEnvKeys ? 'Document env keys in .env.example and keep secrets server-side.' : 'Check for required secrets and document them in .env.example.',
      'Add security headers: CSP, X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy, and HSTS on production HTTPS.',
      'Validate all form/API inputs and avoid exposing service-role credentials to the client.',
      'Run dependency audit and fix critical/high vulnerabilities before shipping.',
    ].filter(Boolean);
    return {
      score: Math.max(0, 100 - seoIssues.length * 8 - securityIssues.length * 10),
      seo: seoIssues,
      security: securityIssues,
      opencodePrompt: `Improve SEO and security for this app using browser/backend evidence.\n\nEvidence:\n${context.slice(0, 12000)}\n\nTasks:\n- Add/verify title, meta description, canonical URL, Open Graph, Twitter cards, sitemap, robots, and semantic headings.\n- Add security headers/config appropriate to the framework.\n- Ensure secrets stay server-side and .env.example documents required variables.\n- Validate forms/API inputs and document deployment security checks.\n- Run build/tests and summarize remaining launch risks.`,
    };
  }

  private createSupabaseSchemaPlan(browserContext: string): any {
    const terms = Array.from(new Set((browserContext.match(/\b[a-z][a-z0-9_ -]{2,24}\b/gi) || [])
      .map((item) => item.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
      .filter((item) => item.length > 3))).slice(0, 24);
    const tables = ['profiles', 'projects', 'tasks', 'events', 'files'].map((name, index) => ({
      name,
      reason: index < terms.length ? `Derived from browser signal: ${terms[index]}` : 'Default app data structure',
      columns: ['id uuid primary key', 'created_at timestamptz default now()', index === 0 ? 'name text' : 'title text', 'metadata jsonb'],
    }));
    return {
      connected: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ACCESS_TOKEN)),
      tables,
      prompt: `Create Supabase schema and migrations from browser evidence.\n\nBrowser evidence:\n${browserContext.slice(0, 10000)}\n\nTables:\n${tables.map((table) => `- ${table.name}: ${table.columns.join(', ')}`).join('\n')}\n\nRules:\n- Match visible UI states and network/API evidence.\n- Add RLS policies for user-owned data.\n- Generate seed data for browser QA.\n- Keep service role keys server-side only.`,
    };
  }

  private async supabaseRestFetch(pathname: string): Promise<any> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ACCESS_TOKEN;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN are required');
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1${pathname}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${await response.text()}`);
    return response.json();
  }

  private resolveGitHubConnection(owner?: string, repo?: string): GitHubProjectConnection {
    const resolved: GitHubProjectConnection = {
      owner: String(owner || this.githubProjectConnection?.owner || process.env.GITHUB_OWNER || '').trim(),
      repo: String(repo || this.githubProjectConnection?.repo || process.env.GITHUB_REPO || '').trim(),
      projectId: this.githubProjectConnection?.projectId || process.env.GITHUB_PROJECT_ID || undefined,
      projectNumber: this.githubProjectConnection?.projectNumber || Number(process.env.GITHUB_PROJECT_NUMBER || 0) || undefined,
      projectUrl: this.githubProjectConnection?.projectUrl || process.env.GITHUB_PROJECT_URL || undefined,
      connectedAt: this.githubProjectConnection?.connectedAt || new Date().toISOString(),
    };
    if (!resolved.owner || !resolved.repo) throw new Error('GitHub project connection requires owner and repo. Save a connection or set GITHUB_OWNER and GITHUB_REPO.');
    return resolved;
  }

  private async githubFetch(pathname: string, init: RequestInit = {}): Promise<any> {
    const token = this.githubAccessToken();
    if (!token) throw new Error('GitHub is not connected. Login with the GitHub connector or set GITHUB_TOKEN.');
    const response = await fetch(`https://api.github.com${pathname}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
    return response.status === 204 ? {} : response.json();
  }

  private async githubGraphql<T = any>(query: string, variables: Record<string, any>): Promise<T> {
    const token = this.githubAccessToken();
    if (!token) throw new Error('GitHub is not connected. Login with the GitHub connector or set GITHUB_TOKEN.');
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    const data: any = await response.json();
    if (!response.ok || data.errors?.length) throw new Error(`GitHub GraphQL error: ${JSON.stringify(data.errors || data)}`);
    return data.data;
  }

  private async createGitHubIssue(connection: GitHubProjectConnection, title: string, body: string, labels: string[]): Promise<any> {
    if (!title.trim()) throw new Error('Issue title is required');
    const issue = await this.githubFetch(`/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repo)}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body, labels }),
    });
    const summary = this.githubIssueSummary(issue);
    const projectId = connection.projectId || process.env.GITHUB_PROJECT_ID;
    if (projectId && issue.node_id) {
      try {
        await this.githubGraphql(`mutation AddIssueToProject($projectId: ID!, $contentId: ID!) { addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } } }`, { projectId, contentId: issue.node_id });
        summary.projectLinked = true;
      } catch (error: any) {
        summary.projectLinked = false;
        summary.projectError = error.message;
      }
    }
    return summary;
  }

  private githubIssueSummary(issue: any): any {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
      labels: (issue.labels || []).map((label: any) => typeof label === 'string' ? label : label.name),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    };
  }

  private detectBuilderMode(message: string, fallback: string): string {
    const text = message.toLowerCase();
    if (/\bresearch\s+mode\b|\bswitch\s+to\s+research\b/.test(text)) return 'research';
    if (/\bplan\s+mode\b|\bswitch\s+to\s+plan\b/.test(text)) return 'plan';
    if (/\bbuild\s+mode\b|\bswitch\s+to\s+build\b/.test(text)) return 'build';
    return fallback;
  }

  private shouldStartBuild(message: string, mode: string): boolean {
    const text = message.toLowerCase();
    if (!message.trim()) return false;
    return mode === 'build' || /\b(build|create|make|generate|code)\b/.test(text) && /\b(app|application|landing page|website|dashboard|saas|ui|page)\b/.test(text);
  }

  private shouldUpdateBuild(message: string, mode: string): boolean {
    const text = message.toLowerCase();
    if (!message.trim()) return false;
    if (/\b(staging studio|multi-device preview|device wall|preview wall|expert router|route experts|creative mind|project memory|stack experts|build doctor|auto heal|heal loop)\b/.test(text)) return false;
    if (mode === 'build' && !this.shouldStartBuild(message, 'chat')) return true;
    return /\b(change|update|edit|modify|fix|improve|add|remove|replace|move|resize|restyle|make it|make this|turn this|connect|wire|debug|repair)\b/.test(text);
  }

  private shouldRequireBrowserGrounding(message: string, mode: string, gathererContext: string): boolean {
    if (!this.shouldStartBuild(message, mode)) return false;
    if (this.hasBrowserEvidence(gathererContext)) return false;
    const text = message.toLowerCase();
    return mode === 'ui-builder'
      || /\b(clone|recreate|copy|redesign|improve this|this site|this page|current page|current site|like\s+https?:\/\/|based on\s+https?:\/\/|website|landing page)\b/i.test(text)
      || /https?:\/\/[^\s]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i.test(message);
  }

  private hasBrowserEvidence(gathererContext: string): boolean {
    return Boolean(gathererContext.trim()) && !/Browser intelligence unavailable|No active rendered browser session|No active page is available/i.test(gathererContext);
  }

  private browserGroundingActions(message: string, existing: BuilderChatAction[]): BuilderChatAction[] {
    const url = message.match(/https?:\/\/[^\s]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i)?.[0];
    const openPrompt = url
      ? `Open ${url.startsWith('http') ? url : `https://${url}`} and run research before building.`
      : 'Search the web for the best target/reference, open it in the browser, then run research before building.';
    const required = [
      { id: 'open-browser-target', label: url ? 'Open Target' : 'Find Target', description: 'Load the source/reference in the real browser first.', prompt: openPrompt },
      { id: 'research-before-build', label: 'Research First', description: 'Capture DOM, styles, network, console, screenshots, APIs, and product signals.', prompt: 'Run research project and create a project brain from the current browser target before building.' },
      { id: 'build-from-browser', label: 'Build From Browser', description: 'Build only after Nexus has live browser evidence.', prompt: 'Build mode start implementing with OpenCode using the browser evidence, project brain, and live preview.' },
    ];
    const seen = new Set(required.map((action) => action.id));
    return [...required, ...existing.filter((action) => !seen.has(action.id))].slice(0, 5);
  }

  private async collectGathererObservation(sessionId?: string, pageId?: string): Promise<GathererObservation> {
    const session = sessionId && sessionId !== 'default' ? this.engine.getSession(sessionId) : undefined;
    if (!session) throw new Error('No active rendered browser session yet. Open a target URL or generated preview so Nexus can collect DOM, network, console, storage, and screenshot evidence.');

    const resolvedPageId = pageId || session.activePageId || Array.from(session.pages.keys())[0];
    const page = resolvedPageId ? session.pages.get(resolvedPageId) : undefined;
    const info = resolvedPageId ? session.pageInfos.get(resolvedPageId) : undefined;
    if (!page || !resolvedPageId) throw new Error('No active page is available in the current browser session.');

    const [elements, pageFacts] = await Promise.all([
      this.engine.getInteractiveElements(session.id, resolvedPageId).catch(() => []),
      page.evaluate(() => {
        const scriptSrcs = Array.from(document.scripts).map((script) => script.src || script.type || 'inline').slice(0, 40);
        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((item) => item.getAttribute('href') || item.textContent?.slice(0, 120) || 'inline-style').slice(0, 30);
        const meta = Array.from(document.querySelectorAll('meta')).map((item) => `${item.getAttribute('name') || item.getAttribute('property') || 'meta'}=${item.getAttribute('content') || ''}`).slice(0, 30);
        const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
        const storageKeys = {
          localStorage: Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean).slice(0, 40),
          sessionStorage: Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index)).filter(Boolean).slice(0, 40),
        };
        const libraries = [
          ['React', Boolean((window as any).React || document.querySelector('[data-reactroot], #root'))],
          ['Next.js', Boolean(document.querySelector('script[src*="/_next/"]') || (window as any).__NEXT_DATA__)],
          ['Vite', Boolean(document.querySelector('script[type="module"][src*="/@vite/"]') || scriptSrcs.some((src) => src.includes('/src/')))],
          ['Vue', Boolean((window as any).Vue || document.querySelector('[data-v-]'))],
          ['Svelte', Boolean(document.querySelector('[class*="svelte-"]'))],
          ['Tailwind-like utility CSS', Boolean(document.querySelector('[class*="flex"], [class*="grid"], [class*="text-"]'))],
        ].filter(([, present]) => present).map(([name]) => name);
        return {
          title: document.title,
          url: location.href,
          viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
          text,
          meta,
          scriptSrcs,
          styles,
          storageKeys,
          libraries,
        };
      }).catch((error) => ({ error: error.message })),
    ]);

    const network = session.networkRequests
      .filter((entry) => entry.pageId === resolvedPageId)
      .slice(-60)
      .map((entry) => `${entry.method} ${entry.status || 'pending'} ${entry.resourceType} ${entry.url}`)
      .slice(-25);
    const apiSignals = session.networkRequests
      .filter((entry) => entry.pageId === resolvedPageId && /json|graphql|fetch|xhr|api|v1|v2/i.test(`${entry.contentType || ''} ${entry.resourceType} ${entry.url}`))
      .slice(-25)
      .map((entry) => `${entry.method} ${entry.status || 'pending'} ${entry.url}`);
    const consoleSignals = session.consoleMessages
      .filter((entry) => entry.pageId === resolvedPageId)
      .slice(-20)
      .map((entry) => `${entry.type}: ${entry.text}`);

    const context = [
      `Rendered page: ${(pageFacts as any).title || info?.title || 'unknown'} - ${(pageFacts as any).url || info?.url || page.url()}`,
      `Viewport: ${JSON.stringify((pageFacts as any).viewport || page.viewportSize())}`,
      `Detected libraries/frameworks: ${((pageFacts as any).libraries || []).join(', ') || 'unknown from current evidence'}`,
      `Interactive elements (${elements.length}): ${JSON.stringify(elements.slice(0, 20))}`,
      `Page text sample: ${(pageFacts as any).text || ''}`,
      `Meta signals: ${JSON.stringify((pageFacts as any).meta || [])}`,
      `Scripts: ${JSON.stringify((pageFacts as any).scriptSrcs || [])}`,
      `Stylesheets/styles: ${JSON.stringify((pageFacts as any).styles || [])}`,
      `Storage keys: ${JSON.stringify((pageFacts as any).storageKeys || {})}`,
      `Console signals: ${consoleSignals.join('\n') || 'none captured'}`,
      `Network/API signals: ${apiSignals.join('\n') || network.join('\n') || 'none captured yet'}`,
      'Test surfaces Nexus should consider: desktop browser, tablet viewport, mobile touch viewport, kiosk/fullscreen viewport, API/network behavior, console/runtime errors, storage/auth state, accessibility, visual regression, and production build.',
    ].join('\n\n').slice(0, 18000);

    const observation: GathererObservation = {
      id: uuid(),
      sessionId: session.id,
      pageId: resolvedPageId,
      url: (pageFacts as any).url || info?.url || page.url(),
      title: (pageFacts as any).title || info?.title || 'unknown',
      collectedAt: new Date().toISOString(),
      context,
      signals: {
        hasConsoleErrors: consoleSignals.some((line) => /error|exception|failed|cannot/i.test(line)),
        networkSignalCount: apiSignals.length || network.length,
        interactiveElementCount: elements.length,
        detectedLibraries: (pageFacts as any).libraries || [],
      },
    };
    this.storeGathererObservation(observation);
    return observation;
  }

  private gathererKey(sessionId: string, pageId = ''): string {
    return `${sessionId}:${pageId}`;
  }

  private storeGathererObservation(observation: GathererObservation): void {
    const key = this.gathererKey(observation.sessionId, observation.pageId);
    const timeline = this.gathererObservations.get(key) || [];
    timeline.push(observation);
    this.gathererObservations.set(key, timeline.slice(-30));
  }

  private storeExternalGathererObservation(sessionId: string, pageId: string, context: string): void {
    if (!sessionId || sessionId === 'default' || !context.trim()) return;
    const observation: GathererObservation = {
      id: uuid(),
      sessionId,
      pageId,
      url: context.match(/Rendered page:.*? - (.*)/)?.[1]?.split('\n')[0] || 'unknown',
      title: context.match(/Rendered page: (.*?) - /)?.[1] || 'browser intelligence',
      collectedAt: new Date().toISOString(),
      context: context.slice(0, 18000),
      signals: {
        hasConsoleErrors: /Console signals:[\s\S]*(error|exception|failed|cannot)/i.test(context),
        networkSignalCount: (context.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/g) || []).length,
        interactiveElementCount: Number(context.match(/Interactive elements \((\d+)\)/)?.[1] || 0),
        detectedLibraries: context.match(/Detected libraries\/frameworks: ([^\n]+)/)?.[1]?.split(',').map((item) => item.trim()).filter(Boolean) || [],
      },
    };
    this.storeGathererObservation(observation);
  }

  private getGathererTimeline(sessionId: string, pageId = ''): GathererObservation[] {
    if (!sessionId || sessionId === 'default') return [];
    if (pageId) return this.gathererObservations.get(this.gathererKey(sessionId, pageId)) || [];
    return Array.from(this.gathererObservations.entries())
      .filter(([key]) => key.startsWith(`${sessionId}:`))
      .flatMap(([, timeline]) => timeline)
      .sort((a, b) => a.collectedAt.localeCompare(b.collectedAt))
      .slice(-30);
  }

  private buildGathererContext(sessionId: string, pageId = ''): string {
    const timeline = this.getGathererTimeline(sessionId, pageId);
    if (!timeline.length) return 'Gatherer Agent has no rendered browser observations yet. Navigate to a website or preview so it can collect live evidence.';
    const latest = timeline[timeline.length - 1];
    const summary = timeline.slice(-8).map((item) => [
      `${item.collectedAt} ${item.title} ${item.url}`,
      `Libraries: ${item.signals.detectedLibraries.join(', ') || 'unknown'}; interactive elements: ${item.signals.interactiveElementCount}; network/API signals: ${item.signals.networkSignalCount}; console errors: ${item.signals.hasConsoleErrors ? 'yes' : 'no'}`,
    ].join('\n')).join('\n\n');
    return [
      'Gatherer Agent live browser timeline:',
      summary,
      '',
      'Latest full observation:',
      latest.context,
    ].join('\n').slice(0, 22000);
  }

  private collectBackendObservation(buildId: string): BackendObservation {
    const build = buildId ? this.builderPlatform.getBuild(buildId) : undefined;
    if (!build) throw new Error('No active generated build workspace. Start a build before backend observation.');
    const workspace = path.resolve(build.root);
    const files = this.listObserverFiles(workspace);
    const packagePath = path.join(workspace, 'package.json');
    const pkg = fs.existsSync(packagePath) ? this.safeReadJson(packagePath) : {};
    const dependencies = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
    const scripts = Object.keys(pkg.scripts || {}).map((key) => `${key}: ${pkg.scripts[key]}`);
    const serverFiles = files.filter((file) => /(?:server|api|route|controller|service|model|schema|db|database|prisma|drizzle|supabase|firebase|auth|stripe|webhook)/i.test(file));
    const samples = serverFiles.slice(0, 80).map((relativePath) => {
      const fullPath = path.join(workspace, relativePath);
      return { path: relativePath, content: fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').slice(0, 12000) : '' };
    });
    const joined = samples.map((sample) => `FILE ${sample.path}\n${sample.content}`).join('\n\n');
    const apiRoutes = this.extractApiRoutes(joined);
    const dataModels = this.extractDataModels(joined);
    const envKeys = this.extractEnvKeys(joined + '\n' + this.readIfExists(path.join(workspace, '.env.example')));
    const logErrors = [build.logPath, build.previewLogPath]
      .filter((file) => fs.existsSync(file))
      .flatMap((file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => /error|failed|exception|cannot find|module not found|syntaxerror|typeerror|referenceerror|eaddrinuse/i.test(line)).slice(-20))
      .slice(-30);
    const context = [
      'Backend Observer Agent functionality map:',
      `Workspace: ${workspace}`,
      `Build: ${build.name} (${build.id})`,
      `Scripts: ${scripts.join('; ') || 'none detected'}`,
      `Dependencies/libraries: ${dependencies.join(', ') || 'none detected'}`,
      `Server/API/data files: ${serverFiles.slice(0, 60).join(', ') || 'none detected yet'}`,
      `API routes/actions: ${apiRoutes.join('; ') || 'none detected yet'}`,
      `Data models/schemas: ${dataModels.join('; ') || 'none detected yet'}`,
      `Env/config keys: ${envKeys.join(', ') || 'none detected yet'}`,
      `Recent backend/build errors: ${logErrors.join('\n') || 'none detected'}`,
      'Duplication guidance: recreate both visible behavior and hidden functionality. Match API routes, request/response shapes, auth/session assumptions, storage/database models, env keys, dependencies, background jobs, webhooks, and error/loading states before polishing UI.',
    ].join('\n\n').slice(0, 18000);
    const observation: BackendObservation = {
      id: uuid(),
      buildId: build.id,
      workspace,
      collectedAt: new Date().toISOString(),
      context,
      signals: { scripts, dependencies, apiRoutes, dataModels, envKeys, serverFiles, logErrors },
    };
    const timeline = this.backendObservations.get(build.id) || [];
    timeline.push(observation);
    this.backendObservations.set(build.id, timeline.slice(-30));
    return observation;
  }

  private getBackendObserverTimeline(buildId: string): BackendObservation[] {
    return buildId ? this.backendObservations.get(buildId) || [] : [];
  }

  private buildBackendObserverContext(buildId: string): string {
    const timeline = this.getBackendObserverTimeline(buildId);
    if (!timeline.length) return 'Backend Observer Agent has no workspace observations yet. Start or select a generated build so it can inspect package scripts, APIs, server code, data models, env keys, and logs.';
    const latest = timeline[timeline.length - 1];
    const summary = timeline.slice(-6).map((item) => `${item.collectedAt} scripts=${item.signals.scripts.length} deps=${item.signals.dependencies.length} routes=${item.signals.apiRoutes.length} models=${item.signals.dataModels.length} errors=${item.signals.logErrors.length}`).join('\n');
    return ['Backend Observer Agent timeline:', summary, '', 'Latest full backend observation:', latest.context].join('\n').slice(0, 22000);
  }

  private listObserverFiles(root: string): string[] {
    const results: string[] = [];
    const walk = (dir: string) => {
      if (results.length >= 1200) return;
      let entries: fs.Dirent[] = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (results.length >= 1200) return;
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
        if (['node_modules', 'dist', 'build', '.git', '.next', 'coverage'].includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(root, fullPath);
        if (entry.isDirectory()) walk(fullPath);
        else if (/\.(ts|tsx|js|jsx|json|prisma|sql|env|md|yml|yaml)$/i.test(entry.name)) results.push(relativePath);
      }
    };
    walk(root);
    return results;
  }

  private safeReadJson(filePath: string): any {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
  }

  private readIfExists(filePath: string): string {
    try { return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''; } catch { return ''; }
  }

  private extractApiRoutes(text: string): string[] {
    const patterns = [
      /(?:app|router)\.(get|post|put|patch|delete)\(['"`]([^'"`]+)['"`]/gi,
      /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g,
      /fetch\(['"`]([^'"`]*(?:api|graphql|v\d)[^'"`]*)['"`]/gi,
    ];
    const routes = new Set<string>();
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (match.length >= 3) routes.add(`${match[1].toUpperCase()} ${match[2]}`);
        else if (match[1]) routes.add(match[1]);
      }
    }
    return Array.from(routes).slice(0, 80);
  }

  private extractDataModels(text: string): string[] {
    const models = new Set<string>();
    const patterns = [/model\s+(\w+)\s*{/g, /interface\s+(\w+)\s*{/g, /type\s+(\w+)\s*=/g, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w_]+)/gi];
    for (const pattern of patterns) for (const match of text.matchAll(pattern)) models.add(match[1]);
    return Array.from(models).slice(0, 80);
  }

  private extractEnvKeys(text: string): string[] {
    const keys = new Set<string>();
    for (const match of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) keys.add(match[1]);
    for (const match of text.matchAll(/^([A-Z0-9_]+)=/gm)) keys.add(match[1]);
    return Array.from(keys).slice(0, 80);
  }

  private async runBuilderConductor(
    message: string,
    mode: string,
    uiLook: string,
    browserContext: string,
    history: BuilderMessage[],
    activeBuildId: string,
  ): Promise<BuilderChatResult> {
    const fallback = this.createFallbackBuilderChat(message, mode, uiLook, browserContext);
    if (!message.trim()) return fallback;

    const recentHistory = history.slice(-8).map((item) => `${item.role}: ${item.content}`).join('\n\n');
    const system = `You are Nexus Command Chat, an elite app-building conductor designed to beat Lovable, Bolt, and other visual builders.

You must be better in these areas:
- Understand the live browser and generated preview before proposing code.
- Convert vague ideas into shippable full-stack product decisions.
- Start or update OpenCode builds when useful, but ask for missing essentials when risk is high.
- Recommend browser-first verification: Build Doctor, visual QA, staging studio, mobile checks, backend/API mapping, and project memory.
- Avoid generic SaaS output. Push distinctive product-specific UI direction.

Return strict JSON only with this shape:
{"response":"short useful chat reply in markdown","actions":[{"id":"kebab-id","label":"1-4 words","description":"short reason","prompt":"chat prompt to run if clicked"}]}

Rules:
- Keep response under 180 words unless the user explicitly asks for a long plan.
- Mention concrete next build/QA steps, not generic encouragement.
- Actions must be executable chat prompts for Nexus, max 5 actions.
- If browser/backend context is unavailable, say what to open or run next.
- Never claim files were changed unless OpenCode/build/update was started by the API after this response.`;
    const messages: LLMMessage[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `Mode: ${mode}\nUI look: ${uiLook}\nActive build: ${activeBuildId || 'none'}\n\nRecent chat:\n${recentHistory || 'none'}\n\nLive browser/backend evidence:\n${browserContext || 'none'}\n\nUser message:\n${message}`,
      },
    ];

    try {
      const result = await this.llm.chat(messages, undefined, { temperature: 0.35, maxTokens: 1400 });
      const parsed = this.parseBuilderConductorJson(result.content || '');
      if (!parsed.response) return fallback;
      return { response: parsed.response, actions: parsed.actions, source: 'ai' };
    } catch (error: any) {
      return {
        ...fallback,
        response: `${fallback.response}\n\nAI conductor unavailable: ${error.message}`,
      };
    }
  }

  private parseBuilderConductorJson(content: string): { response: string; actions: BuilderChatAction[] } {
    const jsonText = content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const parsed = JSON.parse(jsonText);
    return {
      response: String(parsed.response || '').trim(),
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5).map((action: any, index: number) => ({
        id: String(action.id || `action-${index + 1}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''),
        label: String(action.label || `Action ${index + 1}`).slice(0, 32),
        description: String(action.description || '').slice(0, 140),
        prompt: String(action.prompt || action.description || '').slice(0, 500),
      })).filter((action: BuilderChatAction) => action.prompt) : [],
    };
  }

  private createFallbackBuilderChat(message: string, mode: string, uiLook: string, browserContext: string): BuilderChatResult {
    const response = this.buildBuilderResponse(message, mode, uiLook, browserContext);
    const actions: BuilderChatAction[] = [
      { id: 'research-project', label: 'Research Project', description: 'Capture browser evidence, APIs, UI structure, and build tasks.', prompt: 'Run research project and create a project brain from the current target.' },
      { id: 'build-opencode', label: 'Build', description: 'Start an OpenCode implementation from the current prompt and browser evidence.', prompt: 'Build mode start implementing with OpenCode using the project brain and live browser preview.' },
      { id: 'build-doctor', label: 'Build Doctor', description: 'Inspect generated app setup, logs, dependencies, and build errors.', prompt: 'Run Build Doctor and auto heal the generated app.' },
      { id: 'staging-studio', label: 'Staging', description: 'Verify desktop, tablet, mobile, and app-store/mobile surfaces.', prompt: 'Run Staging Studio multi-device preview and report issues.' },
      { id: 'creative-mind', label: 'Creative Mind', description: 'Create a non-generic visual direction before or during implementation.', prompt: 'Run Creative Mind and make this app not look like a generic template.' },
    ];
    return { response, actions, source: 'fallback' };
  }

  private buildBuilderResponse(message: string, mode: string, uiLook: string, browserContext = ''): string {
    const intent = message.toLowerCase();
    const persona = [
      'Nexus Command Chat persona: senior full-stack developer, system engineer, browser automation engineer, DevTools debugger, QA lead, and product/graphic designer in one cockpit.',
      'Operate like a developer-employee platform inspired by Twin: specialized agents can be hired for jobs, run from triggers/schedules, inspect tools and websites, report findings, and hand implementation to OpenCode.',
      'Competitive goal: beat chat-only coding tools by knowing what is rendered, what APIs are called, what libraries are present, what server functionality exists, what breaks in real devices, and what code must change.',
    ];
    const browserAdvantage = [
      'Use the browser as the source of truth: live page, generated preview, DOM, computed styles, screenshots, console logs, network requests, storage, and API discovery should drive code changes.',
      'Turn DevTools evidence into code: map visible UI to React components, network traffic to API clients/MCP tools, console errors to fixes, and screenshot differences to CSS/layout repairs.',
      'Keep the AI loop browser-first: research or open the target, inspect evidence, generate/update code with OpenCode, run preview, compare visually, diagnose logs, then repair until it works.',
    ];
    const actions = mode === 'research'
      ? [
        ...browserAdvantage,
        'Use the browser as a web researcher: search the web, open relevant sites, crawl resources, discover APIs, and capture UI intelligence.',
        'Collect sources, screenshots, links, endpoints, integrations, docs, and examples before writing code.',
        'Generate or update project-brain.json with every useful finding.',
      ]
      : mode === 'plan'
        ? [
          ...browserAdvantage,
          'Convert research into an implementation plan for OpenCode.',
          'Create architecture, database schema, UI component plan, API/MCP plan, integration plan, test plan, and ordered tasks.',
          'Do not build yet; identify missing research and risks first.',
        ]
        : mode === 'build'
          ? [
            ...browserAdvantage,
            'Hand the build plan to OpenCode and implement tasks in numeric order.',
            'Keep the browser live as the preview and use visual QA after each major UI step.',
            `Apply UI look mode: ${uiLook}.`,
          ]
          : [
            ...browserAdvantage,
            'Research the current site with the browser crawler.',
            'Generate project-brain.json, build-plan.json, SDK agents, MCP tools, database schema, and Tailwind UI artifacts.',
            `Apply UI look mode: ${uiLook}.`,
            'OpenCode should implement tasks in numeric order, then browser QA should compare the live build against the captured site.',
          ];

    if (intent.includes('stripe')) actions.push('Enable the Stripe integration factory output and wire checkout, subscriptions, webhooks, and billing UI.');
    if (intent.includes('github')) actions.push('Enable GitHub repo, issues, PR, Actions, and OAuth integration tasks.');
    if (intent.includes('database') || intent.includes('db')) actions.push('Use SQLite local-first, then generate Prisma/Drizzle/Postgres migration options from code-intelligence.json.');
    if (intent.includes('mcp')) actions.push('Expose discovered endpoints as MCP tools with env-based credentials and safe schemas.');
    if (intent.includes('ui') || intent.includes('figma') || intent.includes('tailwind')) actions.push('Use ui-intelligence output to generate design tokens, component variants, responsive Tailwind classes, and visual QA targets.');
    if (intent.includes('agent') || intent.includes('hermes') || intent.includes('skills') || intent.includes('memory')) actions.push('Use the project agent swarm: research, browser UI, API, database, MCP, OpenCode build, React, Tailwind, integration, QA, memory, and scheduler agents. Persist reusable lessons as skills.');
    if (intent.includes('browser') || intent.includes('devtools') || intent.includes('vibe') || intent.includes('coding')) actions.push('Position Nexus as browser-native vibe coding: chat is the director, the browser is the evidence engine, DevTools signals explain what to build or fix, and OpenCode turns those findings into working files.');
    if (intent.includes('twin') || intent.includes('employee') || intent.includes('autonomous')) actions.push('Use the Twin-inspired concept safely: create a library of developer employees such as Browser Gatherer, Backend Observer, Mobile QA, Build Doctor, Integration Builder, and Release Operator that can run on demand or schedule with human approval for risky actions.');

    const next = mode === 'research' ? 'search/open sites and run Research Project' : mode === 'plan' ? 'generate build-plan.json and tasks' : mode === 'build' ? 'start OpenCode implementation and live visual QA' : 'run Research Project, then Build With OpenCode, then Visual QA';
    const agentJobs = [
      'Browser Gatherer: watches rendered pages, DOM, styles, storage, console, network, and screenshots.',
      'Backend Observer: maps dependencies, scripts, API routes, schemas, env keys, server logs, and hidden functionality.',
      'Full-Stack Architect: turns browser/backend evidence into architecture, data models, integrations, and task order.',
      'OpenCode Implementer: edits files, runs commands, fixes builds, and keeps changes minimal but complete.',
      'Mobile/Kiosk QA: verifies desktop, tablet, mobile touch, fullscreen kiosk, game/canvas, accessibility, and visual regressions.',
      'Release Operator: prepares env docs, deployment checks, monitoring, and handoff notes.',
    ];
    return `Nexus Command Chat\n\nPersona:\n${persona.map((item) => `- ${item}`).join('\n')}\n\nBuilder mode: ${mode}\n\nWhat I already know from live agents:\n${browserContext}\n\nDeveloper employees ready for this job:\n${agentJobs.map((job) => `- ${job}`).join('\n')}\n\nRecommended actions:\n${actions.map((action) => `- ${action}`).join('\n')}\n\nNext: ${next}.`;
  }

  private authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    if (apiKey === config.get().auth.apiKey) return next();

    if (authHeader?.startsWith('Bearer ')) {
      try {
        jwt.verify(authHeader.slice(7), config.get().auth.jwtSecret);
        return next();
      } catch {}
    }

    res.status(401).json({ error: 'Unauthorized' });
  };

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuid();
      const client: CloudClient = {
        id: clientId,
        ws,
        authenticated: false,
        lastPing: Date.now(),
      };
      this.clients.set(clientId, client);

      log.info(`Client connected: ${clientId}`);

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          await this.handleWSMessage(client, msg);
        } catch (error: any) {
          ws.send(JSON.stringify({ type: 'error', error: error.message }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        log.info(`Client disconnected: ${clientId}`);
      });

      ws.on('pong', () => {
        client.lastPing = Date.now();
      });

      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        message: 'Welcome to NexusBrowser Cloud',
      }));
    });

    this.pingInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000);
  }

  private async handleWSMessage(client: CloudClient, msg: any): Promise<void> {
    switch (msg.type) {
      case 'auth':
        if (msg.apiKey === config.get().auth.apiKey || msg.token) {
          try {
            if (msg.token) jwt.verify(msg.token, config.get().auth.jwtSecret);
            client.authenticated = true;
            client.ws.send(JSON.stringify({ type: 'auth:success' }));
          } catch {
            client.ws.send(JSON.stringify({ type: 'auth:failed' }));
          }
        } else {
          client.ws.send(JSON.stringify({ type: 'auth:failed' }));
        }
        break;

      case 'session:create': {
        const session = await this.engine.createSession();
        client.sessionId = session.id;
        client.ws.send(JSON.stringify({ type: 'session:created', session }));
        break;
      }

      case 'session:list':
        client.ws.send(JSON.stringify({ type: 'sessions', sessions: this.engine.getAllSessions() }));
        break;

      case 'session:attach': {
        const session = this.engine.getSession(msg.sessionId);
        if (!session) {
          client.ws.send(JSON.stringify({ type: 'error', error: 'Session not found' }));
          return;
        }
        client.sessionId = msg.sessionId;
        client.ws.send(JSON.stringify({ type: 'session:attached', session: this.engine.getSessionInfo(session) }));
        break;
      }

      case 'page:action': {
        if (!client.sessionId) {
          client.ws.send(JSON.stringify({ type: 'error', error: 'No session' }));
          return;
        }
        const result = await this.engine.executeAction(client.sessionId, msg.pageId, msg.action);
        client.ws.send(JSON.stringify({ type: 'action:result', result }));
        this.broadcast({ type: 'session:update', sessions: this.engine.getAllSessions() });
        break;
      }

      case 'page:content': {
        if (!client.sessionId) return;
        const content = await this.engine.getPageContent(client.sessionId, msg.pageId);
        client.ws.send(JSON.stringify({ type: 'page:content', content }));
        break;
      }

      case 'page:screenshot': {
        if (!client.sessionId) return;
        const buf = await this.engine.getPageScreenshot(client.sessionId, msg.pageId);
        if (buf) {
          client.ws.send(JSON.stringify({ type: 'page:screenshot', data: buf.toString('base64') }));
        }
        break;
      }

      case 'page:elements': {
        if (!client.sessionId) return;
        const elements = await this.engine.getInteractiveElements(client.sessionId, msg.pageId);
        client.ws.send(JSON.stringify({ type: 'page:elements', elements }));
        break;
      }

      case 'agent:task': {
        if (!client.sessionId) {
          client.ws.send(JSON.stringify({ type: 'error', error: 'No session' }));
          return;
        }
        const task = await this.agent.startTask(msg.goal, client.sessionId, msg.pageId);

        this.agent.on('task:step', (data) => {
          client.ws.send(JSON.stringify({ type: 'agent:step', ...data }));
        });
        this.agent.on('task:completed', (data) => {
          client.ws.send(JSON.stringify({ type: 'agent:completed', ...data }));
        });

        client.ws.send(JSON.stringify({ type: 'agent:task:started', task }));
        break;
      }

      case 'automation:create':
        client.ws.send(JSON.stringify({ type: 'automation:created', script: this.automation.createScript(msg.script) }));
        break;

      case 'automation:run':
        try {
          const exec = await this.automation.runScript(msg.scriptId, client.sessionId);
          client.ws.send(JSON.stringify({ type: 'automation:result', execution: exec }));
        } catch (error: any) {
          client.ws.send(JSON.stringify({ type: 'error', error: error.message }));
        }
        break;

      default:
        client.ws.send(JSON.stringify({ type: 'error', error: `Unknown message type: ${msg.type}` }));
    }
  }

  private broadcast(msg: any): void {
    const data = JSON.stringify(msg);
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  async start(): Promise<void> {
    const cfg = config.get();
    await this.automation.initialize();

    return new Promise((resolve) => {
      this.httpServer.listen(cfg.server.port, cfg.server.host, () => {
        log.info(`Cloud server listening on ${cfg.server.host}:${cfg.server.port}`);
        log.info(`WebSocket on port ${cfg.server.wsPort}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.pingInterval) clearInterval(this.pingInterval);
    for (const [, client] of this.clients) {
      client.ws.close();
    }
    this.wss.close();
    return new Promise((resolve) => this.httpServer.close(() => resolve()));
  }

  getApp(): express.Application {
    return this.app;
  }
}
