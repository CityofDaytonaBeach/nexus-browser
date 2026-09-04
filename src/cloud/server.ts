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

export class CloudServer {
  private app: express.Application;
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private clients: Map<string, CloudClient> = new Map();
  private engine: BrowserEngine;
  private agent: AIAgent;
  private automation: AutomationEngine;
  private builderChats: Map<string, BuilderMessage[]> = new Map();
  private pingInterval?: NodeJS.Timeout;

  constructor() {
    this.engine = BrowserEngine.getInstance();
    this.agent = new AIAgent();
    this.automation = new AutomationEngine();

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
        modes: ['research', 'ui-builder', 'api-mcp', 'database', 'integrations', 'visual-qa', 'ship'],
        uiLooks: ['faithful-clone', 'modern-saas', 'government-clean', 'dashboard-pro', 'mobile-first', 'luxury-editorial', 'dark-neon', 'minimal'],
        engines: {
          browser: true,
          opencode: true,
          webgpu: 'client-detected',
          livePreview: true,
          visualBuilder: true,
        },
        outputs: ['research-project', 'project-brain', 'build-plan', 'tailwind-components', 'sdk-agents', 'mcp-server', 'database-schema', 'integration-factory'],
      });
    });

    router.post('/api/builder/chat', this.authenticate, (req, res) => {
      const sessionId = req.body?.sessionId || 'default';
      const message = String(req.body?.message || '').trim();
      const mode = req.body?.mode || 'ui-builder';
      const uiLook = req.body?.uiLook || 'faithful-clone';
      const messages = this.builderChats.get(sessionId) || [];
      if (message) messages.push({ role: 'user', content: message, timestamp: Date.now() });
      const response = this.buildBuilderResponse(message, mode, uiLook);
      messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
      this.builderChats.set(sessionId, messages.slice(-100));
      res.json({ response, messages: this.builderChats.get(sessionId) });
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

  private buildBuilderResponse(message: string, mode: string, uiLook: string): string {
    const intent = message.toLowerCase();
    const actions = [
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

    return `Builder mode: ${mode}\n\nRecommended actions:\n${actions.map((action) => `- ${action}`).join('\n')}\n\nNext: run Research Project, then Build With OpenCode, then Visual QA.`;
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
