import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
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
  private builderChats: Map<string, BuilderMessage[]> = new Map();
  private gathererObservations: Map<string, GathererObservation[]> = new Map();
  private backendObservations: Map<string, BackendObservation[]> = new Map();
  private builderPlatform: BuilderPlatform;
  private pingInterval?: NodeJS.Timeout;

  constructor() {
    this.engine = BrowserEngine.getInstance();
    this.agent = new AIAgent();
    this.automation = new AutomationEngine();
    this.builderPlatform = new BuilderPlatform();

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

    router.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        version: '1.0.0',
        name: 'NexusBrowser',
        sessions: this.engine.getAllSessions().length,
        uptime: process.uptime(),
      });
    });

    router.get('/api/integrations', this.authenticate, (_req, res) => {
      res.json(getAllIntegrationProfiles());
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
      const response = this.buildBuilderResponse(message, mode, uiLook, browserContext);
      messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
      this.builderChats.set(sessionId, messages.slice(-100));
      let build = undefined;
      let update = undefined;
      if (activeBuildId && this.shouldUpdateBuild(message, mode)) {
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
      res.json({ response, messages: this.builderChats.get(sessionId), build, update });
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
