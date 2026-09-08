import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { config } from '../core/config';
import { createLogger } from '../core/logger';
import { BrowserPage, BrowserAction, ActionResult, PageInfo, SessionInfo } from '../core/types';
import { IntegrationArtifact, buildIntegrationArtifacts, getAllIntegrationProfiles } from '../integrations/registry';
import { AgentSwarmPlan, buildAgentFiles, getProjectAgentSwarm } from '../project-agents/registry';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const log = createLogger('Browser');

type NetworkRequestRecord = {
  pageId: string;
  url: string;
  method: string;
  resourceType: string;
  requestHeaders: Record<string, string>;
  postData?: string | null;
  status?: number;
  responseHeaders?: Record<string, string>;
  contentType?: string;
  responseSample?: string;
  timestamp: number;
};

export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  pages: Map<string, Page>;
  pageInfos: Map<string, PageInfo>;
  consoleMessages: Array<{ pageId: string; type: string; text: string; timestamp: number }>;
  networkRequests: NetworkRequestRecord[];
  apiDiscoveryExports: Set<string>;
  activePageId?: string;
  cdpSession?: CDPSession;
  createdAt: number;
  lastActive: number;
}

export interface CloneSnapshot {
  capturedAt: string;
  sessionId: string;
  pageId: string;
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
  html: string;
  text: string;
  screenshot: string;
  metadata: Record<string, string>;
  stylesheets: Array<{ href: string | null; inline: string | null; media: string | null }>;
  scripts: Array<{ src: string | null; type: string | null; inline: string | null }>;
  images: Array<{ src: string; alt: string; width: number; height: number }>;
  fonts: string[];
  colors: string[];
  layout: Array<{ selector: string; tag: string; text: string; role: string | null; rect: { x: number; y: number; width: number; height: number }; styles: Record<string, string> }>;
  links: Array<{ href: string; text: string }>;
  storage: { cookies: any[]; localStorage: Record<string, string>; sessionStorage: Record<string, string> };
  console: Array<{ pageId: string; type: string; text: string; timestamp: number }>;
  network: Array<{ pageId: string; url: string; method: string; resourceType: string; status?: number; timestamp: number }>;
  tailwindInventory: string;
  tailwindComponent: string;
  opencodePrompt: string;
}

export interface ApiEndpoint {
  id: string;
  url: string;
  origin: string;
  path: string;
  method: string;
  resourceType: string;
  status?: number;
  requiresAuth: boolean;
  authSignals: string[];
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  contentType?: string;
  requestBodyExample?: string | null;
  queryParameters: Array<{ name: string; example: string }>;
  responseSample?: string;
  mcpTool: { name: string; description: string; inputSchema: Record<string, any> };
  usage: string;
}

export interface ApiDiscoveryCatalog {
  capturedAt: string;
  sessionId: string;
  pageId: string;
  pageUrl: string;
  pageTitle: string;
  crawledPages: string[];
  endpoints: ApiEndpoint[];
  openApi: Record<string, any>;
  mcpTools: Array<{ name: string; description: string; inputSchema: Record<string, any> }>;
  codeIntelligence: CodeIntelligenceReport;
  sdkAgents: Record<string, SdkAgentArtifact>;
  instructions: string;
}

export interface CodeIntelligenceReport {
  architecture: string[];
  dataModels: Array<{ name: string; source: string; fields: Array<{ name: string; type: string; required: boolean }> }>;
  databaseTables: Array<{ name: string; purpose: string; columns: Array<{ name: string; type: string }> }>;
  functions: Array<{ name: string; language: string; purpose: string; input: Record<string, any>; output: string; endpoint?: string }>;
  authStrategy: string[];
  errorHandling: string[];
  recommendedFiles: Array<{ path: string; purpose: string }>;
}

export interface SdkAgentArtifact {
  fileName: string;
  purpose: string;
  prompt: string;
  starterCode: string;
}

export interface CrawlOptions {
  maxPages?: number;
  delayMs?: number;
  sameOriginOnly?: boolean;
  outputDir?: string;
}

export interface UiComponentInsight {
  name: string;
  kind: string;
  selector: string;
  text: string;
  tailwind: string;
  confidence: number;
  dataDependencies: string[];
}

export interface UiIntelligenceReport {
  capturedAt: string;
  sessionId: string;
  pageId: string;
  url: string;
  title: string;
  designTokens: Record<string, any>;
  layoutMap: Array<{ name: string; selector: string; tag: string; rect: { x: number; y: number; width: number; height: number }; purpose: string }>;
  components: UiComponentInsight[];
  interactions: Array<{ selector: string; type: string; text: string; expectedState: string }>;
  uiApiMap: Array<{ component: string; endpoint: string; reason: string }>;
  tailwindConfig: string;
  pageComponent: string;
  componentFiles: Record<string, string>;
  prompt: string;
}

export interface ResearchProject {
  id: string;
  createdAt: string;
  targetUrl: string;
  title: string;
  summary: string;
  brain: {
    pages: string[];
    api: ApiDiscoveryCatalog;
    ui: UiIntelligenceReport;
    code: CodeIntelligenceReport;
    recommendedStack: string[];
    integrations: Array<{ name: string; category: string; features: string[]; env: string[] }>;
    agents: AgentSwarmPlan;
    risks: string[];
    nextResearchActions: string[];
  };
  scorecard: Record<string, { score: number; notes: string[] }>;
  buildPlan: Array<{ id: string; title: string; goal: string; outputs: string[] }>;
  tasks: Record<string, string>;
  database: Record<string, string>;
  mcp: Record<string, string>;
  boilerplates: Record<string, string>;
  integrations: Record<string, IntegrationArtifact>;
  agentFiles: Record<string, string>;
  masterPrompt: string;
}

export interface BuildOverlayBlock {
  id: string;
  order: number;
  name: string;
  kind: string;
  selector: string;
  text: string;
  tailwind: string;
  rect: { x: number; y: number; width: number; height: number };
  explanation: string;
}

export interface BuildOverlayPlan {
  capturedAt: string;
  sessionId: string;
  pageId: string;
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
  blocks: BuildOverlayBlock[];
  script: string[];
}

export interface VisualQaRun {
  id: string;
  capturedAt: string;
  targetUrl: string;
  localUrl: string;
  outputDir: string;
  scores: {
    overall: number;
    pixel: number;
    text: number;
    layout: number;
    color: number;
  };
  findings: Array<{ severity: 'high' | 'medium' | 'low'; area: string; issue: string; repair: string }>;
  artifacts: {
    targetScreenshot: string;
    localScreenshot: string;
    diffJson: string;
    repairTasks: string;
    opencodePrompt: string;
  };
  repairPrompt: string;
}

type VisualPageProfile = {
  url: string;
  title: string;
  screenshot: Buffer;
  text: string;
  words: string[];
  colors: string[];
  layout: Array<{ tag: string; text: string; rect: { x: number; y: number; width: number; height: number }; styles: Record<string, string> }>;
};

export class BrowserEngine extends EventEmitter {
  private sessions: Map<string, BrowserSession> = new Map();
  private static instance: BrowserEngine;

  private constructor() {
    super();
  }

  static getInstance(): BrowserEngine {
    if (!BrowserEngine.instance) {
      BrowserEngine.instance = new BrowserEngine();
    }
    return BrowserEngine.instance;
  }

  async createSession(sessionId?: string): Promise<SessionInfo> {
    const id = sessionId || uuid();
    const cfg = config.get().browser;

    log.info(`Creating session ${id}`);

    const browser = await chromium.launch({
      headless: cfg.headless,
      slowMo: cfg.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        `--window-size=${cfg.viewportWidth},${cfg.viewportHeight}`,
      ],
      ...(cfg.proxy ? { proxy: cfg.proxy } : {}),
    });

    const context = await browser.newContext({
      viewport: { width: cfg.viewportWidth, height: cfg.viewportHeight },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['clipboard-read', 'clipboard-write', 'notifications'],
    });

    const page = await context.newPage();
    const pageId = uuid();

    const pageInfo: PageInfo = {
      id: pageId,
      url: 'about:blank',
      title: 'New Tab',
      loading: false,
    };

    const session: BrowserSession = {
      id,
      browser,
      context,
      pages: new Map([[pageId, page]]),
      pageInfos: new Map([[pageId, pageInfo]]),
      consoleMessages: [],
      networkRequests: [],
      apiDiscoveryExports: new Set(),
      activePageId: pageId,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };

    this.setupPageListeners(page, pageId, session);
    this.sessions.set(id, session);

    this.emit('session:created', { sessionId: id });
    return this.getSessionInfo(session);
  }

  private setupPageListeners(page: Page, pageId: string, session: BrowserSession): void {
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        const info = session.pageInfos.get(pageId);
        if (info) {
          info.url = frame.url();
          this.emit('page:navigated', { sessionId: session.id, pageId, url: frame.url() });
        }
      }
    });

    page.on('domcontentloaded', () => {
      const info = session.pageInfos.get(pageId);
      if (info) {
        info.loading = false;
        this.emit('page:loaded', { sessionId: session.id, pageId });
      }
      setTimeout(() => {
        this.autoExportApiDiscovery(session.id, pageId).catch((error) => log.warn(`API discovery export failed: ${error.message}`));
      }, 2500);
    });

    page.on('console', (msg) => {
      const entry = { sessionId: session.id, pageId, type: msg.type(), text: msg.text(), timestamp: Date.now() };
      session.consoleMessages.push(entry);
      session.consoleMessages = session.consoleMessages.slice(-200);
      this.emit('page:console', entry);
    });

    page.on('request', (request) => {
      session.networkRequests.push({
        pageId,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        requestHeaders: request.headers(),
        postData: request.postData(),
        timestamp: Date.now(),
      });
      session.networkRequests = session.networkRequests.slice(-1000);
    });

    page.on('response', async (response) => {
      const request = response.request();
      const requestEntry = [...session.networkRequests].reverse().find((entry) => entry.pageId === pageId && entry.url === request.url() && entry.method === request.method());
      if (requestEntry) {
        const responseHeaders = response.headers();
        requestEntry.status = response.status();
        requestEntry.responseHeaders = responseHeaders;
        requestEntry.contentType = responseHeaders['content-type'];
        const contentType = (requestEntry.contentType || '').toLowerCase();
        if (contentType.includes('json') || contentType.includes('text') || contentType.includes('graphql')) {
          try {
            requestEntry.responseSample = this.redactSensitiveBody((await response.text()).slice(0, 12000)) || undefined;
          } catch {}
        }
      }
    });

    page.on('crash', () => {
      this.emit('page:crash', { sessionId: session.id, pageId });
    });
  }

  async executeAction(sessionId: string, pageId: string, action: BrowserAction): Promise<ActionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session not found', duration: 0 };

    const page = session.pages.get(pageId);
    if (!page) return { success: false, error: 'Page not found', duration: 0 };

    const start = Date.now();
    session.lastActive = Date.now();

    try {
      let result: any;

      switch (action.type) {
        case 'navigate':
          await page.goto(action.url!, { waitUntil: action.options?.waitUntil || 'domcontentloaded', timeout: action.options?.timeout || 30000 });
          result = { url: page.url() };
          break;

        case 'click':
          if (action.coordinates) {
            await page.mouse.click(action.coordinates.x, action.coordinates.y);
          } else {
            await page.click(action.selector!, { timeout: action.options?.timeout || 5000 });
          }
          result = { clicked: true };
          break;

        case 'type':
          if (action.coordinates) {
            await page.mouse.click(action.coordinates.x, action.coordinates.y);
          }
          await page.fill(action.selector || 'body', action.value || '', { timeout: action.options?.timeout || 5000 });
          result = { typed: true };
          break;

        case 'scroll':
          await page.evaluate(([x, y]) => window.scrollBy(x, y), [
            action.coordinates?.x || 0,
            action.coordinates?.y || 300,
          ]);
          result = { scrolled: true };
          break;

        case 'screenshot': {
          const buf = await page.screenshot({
            type: 'png',
            fullPage: action.options?.fullPage || false,
            clip: action.options?.clip,
          });
          result = { screenshot: buf.toString('base64') };
          break;
        }

        case 'evaluate':
          result = await page.evaluate(action.script || '');
          break;

        case 'pdf': {
          const pdf = await page.pdf({ format: 'A4', printBackground: true });
          result = { pdf: pdf.toString('base64') };
          break;
        }

        case 'wait':
          await page.waitForTimeout(action.options?.timeout || 1000);
          result = { waited: true };
          break;

        case 'back':
          await page.goBack();
          result = { url: page.url() };
          break;

        case 'forward':
          await page.goForward();
          result = { url: page.url() };
          break;

        case 'reload':
          await page.reload();
          result = { url: page.url() };
          break;

        case 'select':
          await page.selectOption(action.selector!, action.value || '');
          result = { selected: true };
          break;

        case 'hover':
          await page.hover(action.selector!);
          result = { hovered: true };
          break;

        case 'press':
          await page.keyboard.press(action.value as any);
          result = { pressed: true };
          break;

        case 'drag': {
          const [startX, startY, endX, endY] = (action.value || '0,0,100,100').split(',').map(Number);
          await page.mouse.move(startX, startY);
          await page.mouse.down();
          await page.mouse.move(endX, endY, { steps: 10 });
          await page.mouse.up();
          result = { dragged: true };
          break;
        }

        default:
          return { success: false, error: `Unknown action type: ${action.type}`, duration: Date.now() - start };
      }

      const duration = Date.now() - start;

      const pageInfo: BrowserPage = {
        id: uuid(),
        url: page.url(),
        title: await page.title(),
        content: await page.content(),
        timestamp: Date.now(),
      };

      this.emit('action:executed', { sessionId, pageId, action, duration });

      return { success: true, data: result, page: pageInfo, duration };
    } catch (error: any) {
      const duration = Date.now() - start;
      log.error(`Action failed: ${error.message}`);
      return { success: false, error: error.message, duration };
    }
  }

  async getPageContent(sessionId: string, pageId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) return '';
    const page = session.pages.get(pageId);
    if (!page) return '';
    return await page.content();
  }

  async getPageScreenshot(sessionId: string, pageId: string): Promise<Buffer | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const page = session.pages.get(pageId);
    if (!page) return null;
    return await page.screenshot({ type: 'png' });
  }

  async getPageAccessibilityTree(sessionId: string, pageId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const page = session.pages.get(pageId);
    if (!page) return null;
    return await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ALL);
      const snapshot: any = { role: 'document', name: document.title, children: [] };
      return snapshot;
    });
  }

  async getInteractiveElements(sessionId: string, pageId: string): Promise<Array<{ selector: string; type: string; text: string; role: string }>> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    const page = session.pages.get(pageId);
    if (!page) return [];

    return await page.evaluate(() => {
      const elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [onclick]');
      return Array.from(elements).map((el: Element) => {
        const rect = el.getBoundingClientRect();
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
        return {
          selector: el.tagName.toLowerCase() + id + cls,
          type: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 100),
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          visible: rect.width > 0 && rect.height > 0,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }).filter((el: any) => el.visible);
    });
  }

  async captureCloneSnapshot(sessionId: string, pageId: string): Promise<CloneSnapshot> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    const page = session.pages.get(pageId);
    if (!page) throw new Error('Page not found');

    const [pageData, cookies, screenshotBuffer] = await Promise.all([
      page.evaluate(() => {
        const absoluteUrl = (value: string | null) => {
          if (!value) return '';
          try {
            return new URL(value, window.location.href).href;
          } catch {
            return value;
          }
        };

        const selectorFor = (element: Element) => {
          const tag = element.tagName.toLowerCase();
          if (element.id) return `${tag}#${CSS.escape(element.id)}`;
          const className = typeof element.className === 'string' ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((name) => `.${CSS.escape(name)}`).join('') : '';
          return `${tag}${className}`;
        };

        const visibleElements = Array.from(document.querySelectorAll('body *'))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return {
              selector: selectorFor(element),
              tag: element.tagName.toLowerCase(),
              text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
              role: element.getAttribute('role'),
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              styles: {
                display: style.display,
                position: style.position,
                color: style.color,
                backgroundColor: style.backgroundColor,
                fontFamily: style.fontFamily,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                borderRadius: style.borderRadius,
              },
            };
          })
          .filter((entry) => entry.rect.width > 0 && entry.rect.height > 0)
          .slice(0, 250);

        const colors = new Set<string>();
        const fonts = new Set<string>();
        visibleElements.forEach((entry) => {
          if (entry.styles.color && entry.styles.color !== 'rgba(0, 0, 0, 0)') colors.add(entry.styles.color);
          if (entry.styles.backgroundColor && entry.styles.backgroundColor !== 'rgba(0, 0, 0, 0)') colors.add(entry.styles.backgroundColor);
          if (entry.styles.fontFamily) fonts.add(entry.styles.fontFamily);
        });

        const storageEntries = (storage: Storage) => Object.fromEntries(Array.from({ length: storage.length }, (_, index) => {
          const key = storage.key(index) || '';
          return [key, storage.getItem(key) || ''];
        }));

        return {
          html: document.documentElement.outerHTML,
          text: (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim(),
          metadata: Object.fromEntries(Array.from(document.querySelectorAll('meta')).map((meta) => [meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('http-equiv') || 'meta', meta.getAttribute('content') || ''])),
          stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((element) => ({
            href: absoluteUrl(element.getAttribute('href')) || null,
            inline: element.tagName.toLowerCase() === 'style' ? (element.textContent || '').slice(0, 50000) : null,
            media: element.getAttribute('media'),
          })),
          scripts: Array.from(document.querySelectorAll('script')).map((element) => ({
            src: absoluteUrl(element.getAttribute('src')) || null,
            type: element.getAttribute('type'),
            inline: element.getAttribute('src') ? null : (element.textContent || '').slice(0, 50000),
          })),
          images: Array.from(document.images).map((image) => ({
            src: absoluteUrl(image.currentSrc || image.src),
            alt: image.alt,
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
          })),
          links: Array.from(document.links).map((link) => ({
            href: absoluteUrl(link.getAttribute('href')),
            text: (link.textContent || '').replace(/\s+/g, ' ').trim(),
          })),
          fonts: Array.from(fonts).slice(0, 40),
          colors: Array.from(colors).slice(0, 80),
          layout: visibleElements,
          localStorage: storageEntries(window.localStorage),
          sessionStorage: storageEntries(window.sessionStorage),
        };
      }),
      session.context.cookies(),
      page.screenshot({ type: 'png', fullPage: true }),
    ]);

    const snapshotBase = {
      capturedAt: new Date().toISOString(),
      sessionId,
      pageId,
      url: page.url(),
      title: await page.title(),
      viewport: page.viewportSize(),
      ...pageData,
      screenshot: screenshotBuffer.toString('base64'),
      storage: {
        cookies,
        localStorage: pageData.localStorage,
        sessionStorage: pageData.sessionStorage,
      },
      console: session.consoleMessages.filter((entry) => entry.pageId === pageId),
      network: session.networkRequests.filter((entry) => entry.pageId === pageId),
    };

    return {
      ...snapshotBase,
      tailwindInventory: this.buildTailwindInventory(snapshotBase),
      tailwindComponent: this.buildTailwindComponent(snapshotBase),
      opencodePrompt: this.buildOpenCodeClonePrompt(snapshotBase),
    };
  }

  private buildOpenCodeClonePrompt(snapshot: Omit<CloneSnapshot, 'opencodePrompt' | 'tailwindInventory' | 'tailwindComponent'>): string {
    return `You are OpenCode working from a NexusBrowser developer-tools clone snapshot.

Goal: recreate the captured website as a production-quality local implementation.

Source URL: ${snapshot.url}
Title: ${snapshot.title}
Viewport: ${snapshot.viewport ? `${snapshot.viewport.width}x${snapshot.viewport.height}` : 'unknown'}

Use these files from this package:
- snapshot.json: full DOM, metadata, assets, layout, storage, console, and network data.
- source.html: raw captured HTML.
- screenshot.png: full-page visual reference.

Build requirements:
- Match the layout, typography, colors, spacing, imagery, and interaction states visible in the screenshot and DOM.
- Use the asset URLs, metadata, stylesheet/script references, and network hints from snapshot.json.
- Use tailwind-ui.md and TailwindPage.tsx as the starting point for all UI items.
- Prefer clean, maintainable source over copying brittle generated markup.
- Preserve responsive behavior for desktop and mobile.
- Do not include credentials, cookies, or private storage values in the final app; use them only to understand behavior.

Important visual data:
- Fonts: ${snapshot.fonts.slice(0, 12).join('; ') || 'none captured'}
- Colors: ${snapshot.colors.slice(0, 24).join('; ') || 'none captured'}
- Images: ${snapshot.images.slice(0, 20).map((image) => image.src).join('\n') || 'none captured'}
`;
  }

  private buildTailwindInventory(snapshot: Omit<CloneSnapshot, 'opencodePrompt' | 'tailwindInventory' | 'tailwindComponent'>): string {
    const items = snapshot.layout.slice(0, 120).map((item, index) => {
      const classes = this.stylesToTailwind(item.styles, item.rect);
      const text = item.text ? ` - ${item.text}` : '';
      return `- ${index + 1}. \`${item.tag}\` ${item.selector}${text}\n  Tailwind: \`${classes}\``;
    });

    return [
      '# Tailwind UI Inventory',
      '',
      `Source: ${snapshot.url}`,
      `Title: ${snapshot.title}`,
      '',
      'Use this as a generated first pass, then consolidate repeated items into real components.',
      '',
      '## Design Tokens',
      `Fonts: ${snapshot.fonts.join('; ') || 'none captured'}`,
      `Colors: ${snapshot.colors.join('; ') || 'none captured'}`,
      '',
      '## UI Items',
      ...items,
      '',
    ].join('\n');
  }

  private buildTailwindComponent(snapshot: Omit<CloneSnapshot, 'opencodePrompt' | 'tailwindInventory' | 'tailwindComponent'>): string {
    const sections = snapshot.layout
      .filter((item) => ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'button', 'a', 'input', 'form', 'h1', 'h2', 'h3'].includes(item.tag) || item.role)
      .slice(0, 80)
      .map((item) => {
        const classes = this.stylesToTailwind(item.styles, item.rect);
        const text = this.escapeReactText(item.text || item.role || item.tag);
        if (item.tag === 'button') return `      <button className="${classes}">${text}</button>`;
        if (item.tag === 'a') return `      <a className="${classes}" href="#">${text}</a>`;
        if (item.tag === 'input') return `      <input className="${classes}" placeholder="${text}" />`;
        const tag = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'h1', 'h2', 'h3'].includes(item.tag) ? item.tag : 'div';
        return `      <${tag} className="${classes}">${text}</${tag}>`;
      });

    return `export default function TailwindPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
${sections.join('\n') || '      <section className="mx-auto max-w-6xl p-6">No UI items captured.</section>'}
    </main>
  );
}
`;
  }

  private stylesToTailwind(styles: Record<string, string>, rect: { width: number; height: number }): string {
    const classes = ['box-border'];
    const display = styles.display;
    if (display === 'flex') classes.push('flex');
    if (display === 'grid') classes.push('grid');
    if (display === 'inline-block') classes.push('inline-block');
    if (styles.position === 'fixed') classes.push('fixed');
    if (styles.position === 'absolute') classes.push('absolute');
    if (rect.width >= 900) classes.push('w-full');
    if (rect.width > 0 && rect.width < 900) classes.push('max-w-fit');
    if (rect.height >= 80) classes.push('py-6');
    if (rect.height > 0 && rect.height < 80) classes.push('py-2');
    if (styles.fontWeight && Number(styles.fontWeight) >= 600) classes.push('font-semibold');
    if (styles.fontSize) {
      const size = parseFloat(styles.fontSize);
      if (size >= 32) classes.push('text-4xl');
      else if (size >= 24) classes.push('text-2xl');
      else if (size >= 18) classes.push('text-lg');
      else classes.push('text-sm');
    }
    if (styles.borderRadius && parseFloat(styles.borderRadius) > 0) classes.push('rounded');
    return Array.from(new Set(classes)).join(' ');
  }

  private escapeReactText(value: string): string {
    return value.replace(/[{}<>]/g, '').replace(/&/g, '&amp;').slice(0, 220);
  }

  async captureUiIntelligence(sessionId: string, pageId: string): Promise<UiIntelligenceReport> {
    const [snapshot, apiCatalog] = await Promise.all([
      this.captureCloneSnapshot(sessionId, pageId),
      this.discoverApiEndpoints(sessionId, pageId),
    ]);
    const designTokens = this.extractDesignTokens(snapshot);
    const components = this.classifyUiComponents(snapshot, apiCatalog.endpoints);
    const layoutMap = this.buildLayoutMap(snapshot);
    const interactions = this.extractInteractions(snapshot);
    const uiApiMap = this.buildUiApiMap(components, apiCatalog.endpoints);
    const componentFiles = this.buildComponentFiles(components);
    const reportBase = {
      capturedAt: new Date().toISOString(),
      sessionId,
      pageId,
      url: snapshot.url,
      title: snapshot.title,
      designTokens,
      layoutMap,
      components,
      interactions,
      uiApiMap,
      tailwindConfig: this.buildTailwindConfig(designTokens),
      pageComponent: this.buildIntelligentPageComponent(snapshot, components),
      componentFiles,
    };

    return {
      ...reportBase,
      prompt: this.buildUiIntelligencePrompt(reportBase),
    };
  }

  saveUiIntelligenceReport(report: UiIntelligenceReport, outputRoot?: string): string {
    const safeTitle = (report.title || 'ui-intelligence').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ui-intelligence';
    const timestamp = report.capturedAt.replace(/[:.]/g, '-');
    const root = outputRoot ? path.resolve(outputRoot) : path.join(process.cwd(), 'ui-intelligence');
    const outputDir = path.join(root, `${safeTitle}-${timestamp}`);
    const componentsDir = path.join(outputDir, 'components');

    fs.mkdirSync(componentsDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'ui-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outputDir, 'design-tokens.json'), JSON.stringify(report.designTokens, null, 2));
    fs.writeFileSync(path.join(outputDir, 'layout-map.json'), JSON.stringify(report.layoutMap, null, 2));
    fs.writeFileSync(path.join(outputDir, 'components.json'), JSON.stringify(report.components, null, 2));
    fs.writeFileSync(path.join(outputDir, 'interactions.json'), JSON.stringify(report.interactions, null, 2));
    fs.writeFileSync(path.join(outputDir, 'ui-api-map.json'), JSON.stringify(report.uiApiMap, null, 2));
    fs.writeFileSync(path.join(outputDir, 'tailwind.config.ts'), report.tailwindConfig);
    fs.writeFileSync(path.join(outputDir, 'Page.tsx'), report.pageComponent);
    fs.writeFileSync(path.join(outputDir, 'opencode-ui-prompt.md'), report.prompt);
    for (const [fileName, content] of Object.entries(report.componentFiles)) {
      fs.writeFileSync(path.join(componentsDir, fileName), content);
    }

    return outputDir;
  }

  async createBuildOverlayPlan(sessionId: string, pageId: string): Promise<BuildOverlayPlan> {
    const [snapshot, ui] = await Promise.all([
      this.captureCloneSnapshot(sessionId, pageId),
      this.captureUiIntelligence(sessionId, pageId),
    ]);
    const componentBySelector = new Map(ui.components.map((component) => [component.selector, component]));
    const blocks = snapshot.layout
      .filter((item) => item.rect.width >= 32 && item.rect.height >= 18 && (item.text || item.role || ['header', 'nav', 'main', 'section', 'footer', 'button', 'a', 'input', 'form'].includes(item.tag)))
      .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x || (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))
      .slice(0, 80)
      .map((item, index) => {
        const insight = componentBySelector.get(item.selector);
        const kind = insight?.kind || this.classifyComponentKind(item);
        const name = insight?.name || this.componentName(kind, item, index);
        const tailwind = insight?.tailwind || this.stylesToTailwind(item.styles, item.rect);
        return {
          id: `${index + 1}-${this.toSnakeCase(name).replace(/_/g, '-')}`,
          order: index + 1,
          name,
          kind,
          selector: item.selector,
          text: item.text,
          tailwind,
          rect: item.rect,
          explanation: `Build ${kind} ${name} with Tailwind classes: ${tailwind}`,
        };
      });

    return {
      capturedAt: new Date().toISOString(),
      sessionId,
      pageId,
      url: snapshot.url,
      title: snapshot.title,
      viewport: snapshot.viewport,
      blocks,
      script: blocks.map((block) => `${block.order}. ${block.explanation}`),
    };
  }

  async runVisualQaRepair(sessionId: string, pageId: string, localUrl: string, outputRoot?: string): Promise<VisualQaRun> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    const targetPage = session.pages.get(pageId);
    if (!targetPage) throw new Error('Page not found');
    if (!localUrl) throw new Error('localUrl required');

    const localPage = await session.context.newPage();
    try {
      await localPage.goto(localUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await localPage.waitForTimeout(1500);
      const [target, local] = await Promise.all([
        this.captureVisualPageProfile(targetPage),
        this.captureVisualPageProfile(localPage),
      ]);
      const scores = await this.scoreVisualQa(target, local);
      const findings = this.buildVisualQaFindings(target, local, scores);
      const id = uuid().slice(0, 8);
      const capturedAt = new Date().toISOString();
      const outputDir = this.saveVisualQaRun(id, capturedAt, target, local, scores, findings, outputRoot);
      const repairPrompt = this.buildVisualQaRepairPrompt(target, local, scores, findings, outputDir);
      fs.writeFileSync(path.join(outputDir, 'opencode-repair-prompt.md'), repairPrompt);

      return {
        id,
        capturedAt,
        targetUrl: target.url,
        localUrl: local.url,
        outputDir,
        scores,
        findings,
        artifacts: {
          targetScreenshot: path.join(outputDir, 'target-screenshot.png'),
          localScreenshot: path.join(outputDir, 'local-screenshot.png'),
          diffJson: path.join(outputDir, 'visual-diff.json'),
          repairTasks: path.join(outputDir, 'repair-tasks.md'),
          opencodePrompt: path.join(outputDir, 'opencode-repair-prompt.md'),
        },
        repairPrompt,
      };
    } finally {
      await localPage.close().catch(() => {});
    }
  }

  private async captureVisualPageProfile(page: Page): Promise<VisualPageProfile> {
    const data = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('body *'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const styles = window.getComputedStyle(element);
          return {
            tag: element.tagName.toLowerCase(),
            text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            styles: {
              color: styles.color,
              backgroundColor: styles.backgroundColor,
              fontFamily: styles.fontFamily,
              fontSize: styles.fontSize,
              fontWeight: styles.fontWeight,
              borderRadius: styles.borderRadius,
            },
          };
        })
        .filter((item) => item.rect.width > 0 && item.rect.height > 0)
        .slice(0, 300);
      const colors = new Set<string>();
      visible.forEach((item) => {
        if (item.styles.color && item.styles.color !== 'rgba(0, 0, 0, 0)') colors.add(item.styles.color);
        if (item.styles.backgroundColor && item.styles.backgroundColor !== 'rgba(0, 0, 0, 0)') colors.add(item.styles.backgroundColor);
      });
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2).slice(0, 2000);
      return { text, words, colors: Array.from(colors).slice(0, 80), layout: visible };
    });

    return {
      url: page.url(),
      title: await page.title(),
      screenshot: await page.screenshot({ type: 'png', fullPage: true }),
      ...data,
    };
  }

  private async scoreVisualQa(target: VisualPageProfile, local: VisualPageProfile): Promise<VisualQaRun['scores']> {
    const [targetRaw, localRaw] = await Promise.all([
      sharp(target.screenshot).resize(256, 256, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
      sharp(local.screenshot).resize(256, 256, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
    ]);
    let delta = 0;
    for (let i = 0; i < targetRaw.length; i++) delta += Math.abs(targetRaw[i] - localRaw[i]);
    const pixel = Math.max(0, 100 - (delta / targetRaw.length / 255) * 100);
    const text = this.jaccardScore(target.words, local.words);
    const color = this.jaccardScore(target.colors, local.colors);
    const layout = this.layoutScore(target.layout, local.layout);
    const overall = Math.round((pixel * 0.45) + (layout * 0.25) + (text * 0.2) + (color * 0.1));
    return { overall, pixel: Math.round(pixel), text: Math.round(text), layout: Math.round(layout), color: Math.round(color) };
  }

  private jaccardScore(left: string[], right: string[]): number {
    const a = new Set(left);
    const b = new Set(right);
    if (a.size === 0 && b.size === 0) return 100;
    const intersection = Array.from(a).filter((item) => b.has(item)).length;
    const union = new Set([...a, ...b]).size || 1;
    return (intersection / union) * 100;
  }

  private layoutScore(target: VisualPageProfile['layout'], local: VisualPageProfile['layout']): number {
    const countScore = 100 - Math.min(100, Math.abs(target.length - local.length) / Math.max(target.length, 1) * 100);
    const targetTags = target.map((item) => item.tag);
    const localTags = local.map((item) => item.tag);
    const tagScore = this.jaccardScore(targetTags, localTags);
    const targetLarge = target.filter((item) => item.rect.width > 200 && item.rect.height > 80).length;
    const localLarge = local.filter((item) => item.rect.width > 200 && item.rect.height > 80).length;
    const regionScore = 100 - Math.min(100, Math.abs(targetLarge - localLarge) / Math.max(targetLarge, 1) * 100);
    return (countScore * 0.35) + (tagScore * 0.35) + (regionScore * 0.3);
  }

  private buildVisualQaFindings(target: VisualPageProfile, local: VisualPageProfile, scores: VisualQaRun['scores']): VisualQaRun['findings'] {
    const findings: VisualQaRun['findings'] = [];
    if (scores.pixel < 82) findings.push({ severity: 'high', area: 'visual match', issue: `Pixel similarity is ${scores.pixel}/100.`, repair: 'Adjust page-level layout, spacing, backgrounds, imagery, and above-the-fold composition to match target-screenshot.png.' });
    if (scores.layout < 82) findings.push({ severity: 'high', area: 'layout structure', issue: `Layout similarity is ${scores.layout}/100 with ${target.layout.length} target elements vs ${local.layout.length} local elements.`, repair: 'Rebuild missing structural sections first: header, nav, hero, cards, forms, data regions, and footer.' });
    if (scores.text < 75) findings.push({ severity: 'medium', area: 'content coverage', issue: `Text overlap is ${scores.text}/100.`, repair: 'Copy visible headings, labels, calls to action, and representative body text from the target into the generated app.' });
    if (scores.color < 70) findings.push({ severity: 'medium', area: 'design tokens', issue: `Color overlap is ${scores.color}/100.`, repair: `Update Tailwind theme colors to use captured target colors: ${target.colors.slice(0, 12).join(', ')}.` });
    const missingWords = Array.from(new Set(target.words)).filter((word) => !local.words.includes(word)).slice(0, 20);
    if (missingWords.length) findings.push({ severity: 'low', area: 'missing terms', issue: `Missing prominent terms: ${missingWords.join(', ')}.`, repair: 'Use these terms to identify omitted content blocks and labels.' });
    return findings.length ? findings : [{ severity: 'low', area: 'acceptance', issue: 'No major mismatch detected by DOM-Vision Fusion scoring.', repair: 'Run manual review for interactions, responsive behavior, and authenticated states.' }];
  }

  private saveVisualQaRun(id: string, capturedAt: string, target: VisualPageProfile, local: VisualPageProfile, scores: VisualQaRun['scores'], findings: VisualQaRun['findings'], outputRoot?: string): string {
    const safeTitle = (target.title || 'visual-qa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'visual-qa';
    const root = outputRoot ? path.resolve(outputRoot) : path.join(process.cwd(), 'visual-qa-runs');
    const outputDir = path.join(root, `${safeTitle}-${id}`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'target-screenshot.png'), target.screenshot);
    fs.writeFileSync(path.join(outputDir, 'local-screenshot.png'), local.screenshot);
    fs.writeFileSync(path.join(outputDir, 'visual-diff.json'), JSON.stringify({ id, capturedAt, targetUrl: target.url, localUrl: local.url, scores, findings, target: this.visualProfileSummary(target), local: this.visualProfileSummary(local) }, null, 2));
    fs.writeFileSync(path.join(outputDir, 'repair-tasks.md'), this.buildVisualQaRepairTasks(scores, findings));
    return outputDir;
  }

  private visualProfileSummary(profile: VisualPageProfile): Record<string, any> {
    return { url: profile.url, title: profile.title, textLength: profile.text.length, words: profile.words.slice(0, 80), colors: profile.colors, layout: profile.layout.slice(0, 80) };
  }

  private buildVisualQaRepairTasks(scores: VisualQaRun['scores'], findings: VisualQaRun['findings']): string {
    return `# Visual QA Repair Tasks\n\nDOM-Vision Fusion score: ${scores.overall}/100\n\nScores:\n- Pixel: ${scores.pixel}/100\n- Layout: ${scores.layout}/100\n- Text: ${scores.text}/100\n- Color: ${scores.color}/100\n\n## Tasks\n${findings.map((finding, index) => `${index + 1}. [${finding.severity}] ${finding.area}: ${finding.repair}`).join('\n')}\n`;
  }

  private buildVisualQaRepairPrompt(target: VisualPageProfile, local: VisualPageProfile, scores: VisualQaRun['scores'], findings: VisualQaRun['findings'], outputDir: string): string {
    return `You are OpenCode repairing a NexusBrowser generated app using DOM-Vision Fusion QA.\n\nTarget URL: ${target.url}\nLocal preview: ${local.url}\nArtifact directory: ${outputDir}\nOverall score: ${scores.overall}/100\n\nUse these files:\n- target-screenshot.png\n- local-screenshot.png\n- visual-diff.json\n- repair-tasks.md\n\nRepair findings:\n${findings.map((finding) => `- [${finding.severity}] ${finding.area}: ${finding.issue} Fix: ${finding.repair}`).join('\n')}\n\nRules:\n- Prioritize structural layout and above-the-fold visual match first.\n- Preserve maintainable React/Tailwind code.\n- Do not copy secrets, cookies, account data, or private content.\n- Run the app build after changes and rerun visual QA.\n`;
  }

  async createResearchProject(sessionId: string, pageId: string, options: CrawlOptions = {}): Promise<{ project: ResearchProject; outputDir: string }> {
    const api = await this.crawlApiDiscovery(sessionId, pageId, options);
    const ui = await this.captureUiIntelligence(sessionId, pageId);
    const project = this.buildResearchProject(api, ui);
    const outputDir = this.saveResearchProject(project, options.outputDir);
    return { project, outputDir };
  }

  saveResearchProject(project: ResearchProject, outputRoot?: string): string {
    const safeTitle = (project.title || 'research-project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'research-project';
    const root = outputRoot ? path.resolve(outputRoot) : path.join(process.cwd(), 'research-projects');
    const outputDir = path.join(root, `${safeTitle}-${project.id}`);
    const dirs = ['tasks', 'api', 'mcp', 'database', 'ui', 'components', 'flows', 'sdk-agents', 'boilerplates', 'integrations', 'agents'];
    fs.mkdirSync(outputDir, { recursive: true });
    dirs.forEach((dir) => fs.mkdirSync(path.join(outputDir, dir), { recursive: true }));

    fs.writeFileSync(path.join(outputDir, 'project-brain.json'), JSON.stringify(project.brain, null, 2));
    fs.writeFileSync(path.join(outputDir, 'research-project.json'), JSON.stringify(project, null, 2));
    fs.writeFileSync(path.join(outputDir, 'scorecard.json'), JSON.stringify(project.scorecard, null, 2));
    fs.writeFileSync(path.join(outputDir, 'build-plan.json'), JSON.stringify(project.buildPlan, null, 2));
    fs.writeFileSync(path.join(outputDir, 'opencode-master-prompt.md'), project.masterPrompt);

    Object.entries(project.tasks).forEach(([file, content]) => fs.writeFileSync(path.join(outputDir, 'tasks', file), content));
    Object.entries(project.database).forEach(([file, content]) => fs.writeFileSync(path.join(outputDir, 'database', file), content));
    Object.entries(project.mcp).forEach(([file, content]) => fs.writeFileSync(path.join(outputDir, 'mcp', file), content));
    Object.entries(project.boilerplates).forEach(([file, content]) => fs.writeFileSync(path.join(outputDir, 'boilerplates', file), content));
    Object.entries(project.agentFiles).forEach(([file, content]) => fs.writeFileSync(path.join(outputDir, 'agents', file), content));
    for (const [name, artifact] of Object.entries(project.integrations)) {
      const integrationDir = path.join(outputDir, 'integrations', name);
      fs.mkdirSync(integrationDir, { recursive: true });
      Object.entries(artifact.files).forEach(([file, content]) => fs.writeFileSync(path.join(integrationDir, file), content));
    }

    fs.writeFileSync(path.join(outputDir, 'api', 'endpoints.json'), JSON.stringify(project.brain.api.endpoints, null, 2));
    fs.writeFileSync(path.join(outputDir, 'api', 'openapi.json'), JSON.stringify(project.brain.api.openApi, null, 2));
    fs.writeFileSync(path.join(outputDir, 'api', 'code-intelligence.json'), JSON.stringify(project.brain.code, null, 2));
    fs.writeFileSync(path.join(outputDir, 'ui', 'ui-report.json'), JSON.stringify(project.brain.ui, null, 2));
    fs.writeFileSync(path.join(outputDir, 'ui', 'design-tokens.json'), JSON.stringify(project.brain.ui.designTokens, null, 2));
    fs.writeFileSync(path.join(outputDir, 'ui', 'tailwind.config.ts'), project.brain.ui.tailwindConfig);
    fs.writeFileSync(path.join(outputDir, 'ui', 'Page.tsx'), project.brain.ui.pageComponent);
    Object.entries(project.brain.ui.componentFiles).forEach(([file, content]) => fs.writeFileSync(path.join(outputDir, 'components', file), content));
    Object.values(project.brain.api.sdkAgents).forEach((artifact) => {
      fs.writeFileSync(path.join(outputDir, 'sdk-agents', artifact.fileName), artifact.prompt);
      fs.writeFileSync(path.join(outputDir, 'sdk-agents', artifact.fileName.replace(/\.md$/, '.starter.txt')), artifact.starterCode);
    });

    return outputDir;
  }

  private buildResearchProject(api: ApiDiscoveryCatalog, ui: UiIntelligenceReport): ResearchProject {
    const id = uuid().slice(0, 8);
    const scorecard = this.buildResearchScorecard(api, ui);
    const buildPlan = this.buildProjectBuildPlan(api, ui);
    const projectBase = {
      id,
      createdAt: new Date().toISOString(),
      targetUrl: api.pageUrl,
      title: api.pageTitle || ui.title || 'Research Project',
      summary: `Research-to-code project for ${api.pageUrl}: ${api.endpoints.length} endpoints, ${ui.components.length} UI components, ${api.codeIntelligence.dataModels.length} inferred data models.`,
      brain: {
        pages: api.crawledPages,
        api,
        ui,
        code: api.codeIntelligence,
        recommendedStack: ['Next.js', 'React', 'Tailwind CSS', 'TypeScript', 'Node.js MCP server', 'SQLite local database', 'Prisma or Drizzle ORM'],
        integrations: getAllIntegrationProfiles().map((profile) => ({ name: profile.name, category: profile.category, features: profile.features, env: profile.env })),
        agents: getProjectAgentSwarm(),
        risks: this.buildResearchRisks(api, ui),
        nextResearchActions: this.buildNextResearchActions(api, ui),
      },
      scorecard,
      buildPlan,
      tasks: this.buildOpenCodeTasks(buildPlan, api, ui),
      database: this.buildDatabaseArtifacts(api.codeIntelligence),
      mcp: this.buildMcpArtifacts(api),
      boilerplates: this.buildBoilerplateArtifacts(api, ui),
      integrations: buildIntegrationArtifacts(),
      agentFiles: buildAgentFiles(),
    };
    return { ...projectBase, masterPrompt: this.buildMasterPrompt(projectBase) };
  }

  private extractDesignTokens(snapshot: CloneSnapshot): Record<string, any> {
    const colorCounts = this.countValues(snapshot.colors);
    const fontCounts = this.countValues(snapshot.fonts);
    const radii = this.countValues(snapshot.layout.map((item) => item.styles.borderRadius).filter(Boolean));
    const fontSizes = this.countValues(snapshot.layout.map((item) => item.styles.fontSize).filter(Boolean));

    return {
      colors: Object.keys(colorCounts).slice(0, 16),
      fonts: Object.keys(fontCounts).slice(0, 8),
      radii: Object.keys(radii).slice(0, 8),
      fontSizes: Object.keys(fontSizes).slice(0, 10),
      spacingScale: this.inferSpacingScale(snapshot.layout),
      semantic: {
        primary: Object.keys(colorCounts)[0] || '#0f172a',
        surface: Object.keys(colorCounts).find((color) => color.includes('255')) || '#ffffff',
        text: Object.keys(colorCounts).find((color) => color.includes('0, 0, 0') || color.includes('15, 23, 42')) || '#0f172a',
      },
    };
  }

  private classifyUiComponents(snapshot: CloneSnapshot, endpoints: ApiEndpoint[]): UiComponentInsight[] {
    return snapshot.layout
      .filter((item) => item.text || ['header', 'nav', 'main', 'section', 'footer', 'button', 'a', 'input', 'form'].includes(item.tag) || item.role)
      .slice(0, 160)
      .map((item, index) => {
        const kind = this.classifyComponentKind(item);
        return {
          name: this.componentName(kind, item, index),
          kind,
          selector: item.selector,
          text: item.text,
          tailwind: this.stylesToTailwind(item.styles, item.rect),
          confidence: this.componentConfidence(kind, item),
          dataDependencies: this.matchEndpointsToText(item.text, endpoints),
        };
      })
      .filter((item, index, all) => all.findIndex((other) => other.name === item.name && other.kind === item.kind) === index);
  }

  private buildLayoutMap(snapshot: CloneSnapshot): UiIntelligenceReport['layoutMap'] {
    return snapshot.layout
      .filter((item) => item.rect.width > 300 && item.rect.height > 30)
      .slice(0, 80)
      .map((item) => ({
        name: this.componentName(this.classifyComponentKind(item), item, 0),
        selector: item.selector,
        tag: item.tag,
        rect: item.rect,
        purpose: this.classifyComponentKind(item),
      }));
  }

  private extractInteractions(snapshot: CloneSnapshot): UiIntelligenceReport['interactions'] {
    return snapshot.layout
      .filter((item) => ['button', 'a', 'input', 'select', 'textarea'].includes(item.tag) || ['button', 'link', 'tab', 'menuitem'].includes(item.role || ''))
      .slice(0, 120)
      .map((item) => ({
        selector: item.selector,
        type: item.role || item.tag,
        text: item.text,
        expectedState: item.tag === 'input' ? 'focus, disabled, validation error' : 'hover, focus, active',
      }));
  }

  private buildUiApiMap(components: UiComponentInsight[], endpoints: ApiEndpoint[]): UiIntelligenceReport['uiApiMap'] {
    const mappings: UiIntelligenceReport['uiApiMap'] = [];
    for (const component of components) {
      for (const endpoint of endpoints) {
        const haystack = `${component.name} ${component.kind} ${component.text}`.toLowerCase();
        const endpointText = `${endpoint.path} ${endpoint.responseSample || ''}`.toLowerCase();
        if (haystack.split(/\W+/).filter((word) => word.length > 4).some((word) => endpointText.includes(word))) {
          mappings.push({ component: component.name, endpoint: endpoint.url, reason: 'matched component text/kind against endpoint path or sample response' });
        }
      }
    }
    return mappings.slice(0, 80);
  }

  private buildTailwindConfig(tokens: Record<string, any>): string {
    const colorEntries = (tokens.colors || []).slice(0, 12).map((color: string, index: number) => `        captured${index + 1}: ${JSON.stringify(color)}`).join(',\n');
    const fontFamily = (tokens.fonts?.[0] || 'Inter, ui-sans-serif, system-ui').split(',').map((font: string) => font.trim().replace(/^['"]|['"]$/g, ''));
    return `import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,js,jsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
${colorEntries || '        captured1: "#0f172a"'}
      },
      fontFamily: {
        captured: ${JSON.stringify(fontFamily)},
      },
    },
  },
  plugins: [],
} satisfies Config;
`;
  }

  private buildComponentFiles(components: UiComponentInsight[]): Record<string, string> {
    const selected = components.filter((component) => component.confidence >= 0.55).slice(0, 24);
    return Object.fromEntries(selected.map((component) => {
      const fileName = `${component.name}.tsx`;
      const tag = component.kind === 'button' ? 'button' : component.kind === 'link' ? 'a' : 'div';
      const props = tag === 'a' ? ' href="#"' : '';
      return [fileName, `export function ${component.name}() {
  return <${tag}${props} className="${component.tailwind}">${this.escapeReactText(component.text || component.kind)}</${tag}>;
}
`];
    }));
  }

  private buildIntelligentPageComponent(snapshot: CloneSnapshot, components: UiComponentInsight[]): string {
    const imports = components.filter((component) => component.confidence >= 0.55).slice(0, 12).map((component) => `import { ${component.name} } from './components/${component.name}';`).join('\n');
    const body = components.filter((component) => component.confidence >= 0.55).slice(0, 12).map((component) => `        <${component.name} />`).join('\n');
    return `${imports}

export default function Page() {
  return (
    <main className="min-h-screen bg-white font-captured text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
${body || `        <section className="rounded-lg border p-6">${this.escapeReactText(snapshot.title || 'Captured page')}</section>`}
      </div>
    </main>
  );
}
`;
  }

  private buildUiIntelligencePrompt(report: Omit<UiIntelligenceReport, 'prompt'>): string {
    return `You are OpenCode. Rebuild this captured website UI with high-quality Tailwind CSS components.

Source: ${report.url}
Title: ${report.title}

Use these files:
- design-tokens.json for colors, fonts, radii, sizes, and inferred semantics.
- tailwind.config.ts as the generated Tailwind starting config.
- components.json for classified UI elements and confidence scores.
- layout-map.json for page structure and visual hierarchy.
- interactions.json for hover/focus/active/form states.
- ui-api-map.json to connect UI sections to discovered backend endpoints.
- Page.tsx and components/*.tsx as generated starter components.

Build rules:
- Consolidate duplicated generated components into reusable design-system primitives.
- Preserve visual hierarchy, spacing, typography, colors, and responsive behavior.
- Use Tailwind classes first; only use custom CSS when Tailwind cannot express the captured UI cleanly.
- Treat low-confidence components as hints, not final architecture.
- Wire API-backed components to endpoint clients or MCP tools when ui-api-map.json provides a match.
`;
  }

  private countValues(values: string[]): Record<string, number> {
    return values.reduce<Record<string, number>>((acc, value) => {
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  private inferSpacingScale(layout: CloneSnapshot['layout']): number[] {
    const values = layout.flatMap((item) => [Math.round(item.rect.x), Math.round(item.rect.y), Math.round(item.rect.width), Math.round(item.rect.height)])
      .filter((value) => value > 0 && value <= 128 && value % 2 === 0);
    return Object.entries(this.countValues(values.map(String))).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([value]) => Number(value));
  }

  private classifyComponentKind(item: CloneSnapshot['layout'][number]): string {
    const text = item.text.toLowerCase();
    if (item.tag === 'header' || item.rect.y < 120 && item.rect.width > 600) return 'header';
    if (item.tag === 'nav' || item.role === 'navigation') return 'navigation';
    if (item.tag === 'button' || item.role === 'button') return 'button';
    if (item.tag === 'a' || item.role === 'link') return 'link';
    if (['input', 'select', 'textarea', 'form'].includes(item.tag)) return 'form-control';
    if (/meeting|agenda|calendar|event/.test(text)) return 'data-list';
    if (item.rect.width > 250 && item.rect.height > 100) return 'card-or-section';
    if (/copyright|privacy|terms/.test(text) || item.tag === 'footer') return 'footer';
    return 'content';
  }

  private componentName(kind: string, item: CloneSnapshot['layout'][number], index: number): string {
    const seed = item.text.split(/\s+/).filter(Boolean).slice(0, 4).join(' ') || `${kind} ${index + 1}`;
    const pascal = seed.replace(/[^a-z0-9]+/gi, ' ').trim().split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('');
    const suffix = kind.replace(/[^a-z0-9]+/gi, ' ').trim().split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
    return `${pascal || 'Captured'}${suffix}`.replace(/^[0-9]+/, 'Captured');
  }

  private componentConfidence(kind: string, item: CloneSnapshot['layout'][number]): number {
    let score = 0.35;
    if (['header', 'navigation', 'button', 'link', 'form-control', 'footer'].includes(kind)) score += 0.25;
    if (item.text) score += 0.15;
    if (item.role) score += 0.1;
    if (item.rect.width > 40 && item.rect.height > 20) score += 0.1;
    return Math.min(0.95, score);
  }

  private matchEndpointsToText(text: string, endpoints: ApiEndpoint[]): string[] {
    const terms = text.toLowerCase().split(/\W+/).filter((word) => word.length > 4);
    return endpoints.filter((endpoint) => terms.some((term) => `${endpoint.path} ${endpoint.responseSample || ''}`.toLowerCase().includes(term))).map((endpoint) => endpoint.url).slice(0, 5);
  }

  async discoverApiEndpoints(sessionId: string, pageId: string): Promise<ApiDiscoveryCatalog> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    const page = session.pages.get(pageId);
    if (!page) throw new Error('Page not found');

    const pageUrl = page.url();
    const pageTitle = await page.title();
    const networkRecords = session.networkRequests.filter((entry) => entry.pageId === pageId && this.looksLikeApiRequest(entry));
    const endpointMap = new Map<string, NetworkRequestRecord>();

    for (const record of networkRecords) {
      const normalized = this.normalizeEndpointUrl(record.url);
      const key = `${record.method.toUpperCase()} ${normalized}`;
      endpointMap.set(key, { ...record, url: normalized });
    }

    const endpoints = Array.from(endpointMap.values()).map((record) => this.toApiEndpoint(record));
    const codeIntelligence = this.buildCodeIntelligence(pageUrl, endpoints);

    return {
      capturedAt: new Date().toISOString(),
      sessionId,
      pageId,
      pageUrl,
      pageTitle,
      crawledPages: [pageUrl],
      endpoints,
      openApi: this.buildOpenApiDocument(pageTitle, pageUrl, endpoints),
      mcpTools: endpoints.map((endpoint) => endpoint.mcpTool),
      codeIntelligence,
      sdkAgents: this.buildSdkAgents(pageTitle, pageUrl, endpoints, codeIntelligence),
      instructions: this.buildApiInstructions(pageUrl, endpoints),
    };
  }

  async crawlApiDiscovery(sessionId: string, pageId: string, options: CrawlOptions = {}): Promise<ApiDiscoveryCatalog> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    const page = session.pages.get(pageId);
    if (!page) throw new Error('Page not found');

    const maxPages = Math.max(1, Math.min(options.maxPages || 10, 50));
    const delayMs = Math.max(250, Math.min(options.delayMs || 2500, 15000));
    const sameOriginOnly = options.sameOriginOnly !== false;
    const startUrl = page.url();
    const startOrigin = new URL(startUrl).origin;
    const visited = new Set<string>();
    const queue = [startUrl];
    let crawlRoot: string | undefined;

    while (queue.length > 0 && visited.size < maxPages) {
      const nextUrl = queue.shift()!;
      if (visited.has(nextUrl)) continue;
      if (sameOriginOnly && new URL(nextUrl).origin !== startOrigin) continue;

      visited.add(nextUrl);
      await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
      await page.waitForTimeout(delayMs);

      const snapshot = await this.captureCloneSnapshot(sessionId, pageId);
      if (!crawlRoot) {
        const catalogPreview = await this.discoverApiEndpoints(sessionId, pageId);
        crawlRoot = this.saveApiDiscoveryCatalog(catalogPreview, options.outputDir);
      }
      this.saveCrawledTailwindPage(snapshot, crawlRoot, visited.size);

      const links = await page.evaluate(() => Array.from(document.links).map((link) => link.href).filter(Boolean));
      for (const link of links) {
        try {
          const parsed = new URL(link);
          parsed.hash = '';
          const normalized = parsed.toString();
          if (!visited.has(normalized) && !queue.includes(normalized) && (!sameOriginOnly || parsed.origin === startOrigin)) queue.push(normalized);
        } catch {}
      }
    }

    const catalog = await this.discoverApiEndpoints(sessionId, pageId);
    catalog.crawledPages = Array.from(visited);
    if (crawlRoot) this.saveApiDiscoveryCatalog(catalog, path.dirname(crawlRoot));
    return catalog;
  }

  saveApiDiscoveryCatalog(catalog: ApiDiscoveryCatalog, outputRoot?: string): string {
    const safeTitle = (catalog.pageTitle || 'api-discovery')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'api-discovery';
    const timestamp = catalog.capturedAt.replace(/[:.]/g, '-');
    const root = outputRoot ? path.resolve(outputRoot) : path.join(process.cwd(), 'api-discoveries');
    const outputDir = path.join(root, `${safeTitle}-${timestamp}`);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'endpoints.json'), JSON.stringify(catalog.endpoints, null, 2));
    fs.writeFileSync(path.join(outputDir, 'openapi.json'), JSON.stringify(catalog.openApi, null, 2));
    fs.writeFileSync(path.join(outputDir, 'mcp-tools.json'), JSON.stringify(catalog.mcpTools, null, 2));
    fs.writeFileSync(path.join(outputDir, 'mcp-server-stub.ts'), this.buildMcpServerStub(catalog));
    fs.writeFileSync(path.join(outputDir, 'code-intelligence.json'), JSON.stringify(catalog.codeIntelligence, null, 2));
    fs.writeFileSync(path.join(outputDir, 'README.md'), catalog.instructions);
    fs.writeFileSync(path.join(outputDir, 'opencode-api-prompt.md'), this.buildOpenCodeApiPrompt(catalog));
    const agentsDir = path.join(outputDir, 'sdk-agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    for (const artifact of Object.values(catalog.sdkAgents)) {
      fs.writeFileSync(path.join(agentsDir, artifact.fileName), artifact.prompt);
      fs.writeFileSync(path.join(agentsDir, artifact.fileName.replace(/\.md$/, '.starter.txt')), artifact.starterCode);
    }

    return outputDir;
  }

  private async autoExportApiDiscovery(sessionId: string, pageId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    const page = session?.pages.get(pageId);
    if (!session || !page) return;

    const exportKey = `${pageId}:${page.url()}`;
    if (session.apiDiscoveryExports.has(exportKey)) return;
    session.apiDiscoveryExports.add(exportKey);

    const catalog = await this.discoverApiEndpoints(sessionId, pageId);
    if (catalog.endpoints.length === 0) return;
    const outputDir = this.saveApiDiscoveryCatalog(catalog);
    this.emit('api:discovered', { sessionId, pageId, outputDir, endpoints: catalog.endpoints.length });
    log.info(`API discovery package created: ${outputDir}`);
  }

  private looksLikeApiRequest(record: NetworkRequestRecord): boolean {
    const url = record.url.toLowerCase();
    const contentType = (record.contentType || record.responseHeaders?.['content-type'] || '').toLowerCase();
    if (record.resourceType === 'xhr' || record.resourceType === 'fetch') return true;
    if (contentType.includes('application/json') || contentType.includes('graphql')) return true;
    return /\/api\/|\/graphql|\/v\d+\/|\.json(\?|$)|\/rest\//.test(url);
  }

  private normalizeEndpointUrl(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      parsed.searchParams.forEach((_value, key) => parsed.searchParams.set(key, `{${key}}`));
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return rawUrl;
    }
  }

  private toApiEndpoint(record: NetworkRequestRecord): ApiEndpoint {
    const parsed = new URL(record.url);
    const authSignals = this.detectAuthSignals(record);
    const queryParameters = Array.from(parsed.searchParams.entries()).map(([name, example]) => ({ name, example }));

    return {
      id: `${record.method.toUpperCase()} ${parsed.pathname}`,
      url: record.url,
      origin: parsed.origin,
      path: parsed.pathname,
      method: record.method.toUpperCase(),
      resourceType: record.resourceType,
      status: record.status,
      requiresAuth: authSignals.length > 0,
      authSignals,
      requestHeaders: this.redactSensitiveHeaders(record.requestHeaders),
      responseHeaders: this.redactSensitiveHeaders(record.responseHeaders || {}),
      contentType: record.contentType,
      requestBodyExample: this.redactSensitiveBody(record.postData),
      queryParameters,
      responseSample: this.redactSensitiveBody(record.responseSample) || undefined,
      mcpTool: this.buildMcpTool(record, parsed, authSignals, queryParameters),
      usage: this.buildEndpointUsage(record, parsed, authSignals),
    };
  }

  private detectAuthSignals(record: NetworkRequestRecord): string[] {
    const requestHeaderKeys = Object.keys(record.requestHeaders).map((key) => key.toLowerCase());
    const responseHeaderKeys = Object.keys(record.responseHeaders || {}).map((key) => key.toLowerCase());
    const signals: string[] = [];

    if (requestHeaderKeys.includes('authorization')) signals.push('authorization header present');
    if (requestHeaderKeys.includes('x-api-key')) signals.push('x-api-key header present');
    if (requestHeaderKeys.includes('cookie')) signals.push('cookie/session header present');
    if (responseHeaderKeys.includes('www-authenticate')) signals.push('www-authenticate response header present');
    if (record.status === 401 || record.status === 403) signals.push(`response status ${record.status}`);

    return signals;
  }

  private buildMcpTool(record: NetworkRequestRecord, parsed: URL, authSignals: string[], queryParameters: Array<{ name: string; example: string }>): { name: string; description: string; inputSchema: Record<string, any> } {
    const name = `${record.method.toLowerCase()}_${parsed.hostname.replace(/[^a-z0-9]/gi, '_')}_${parsed.pathname.replace(/[^a-z0-9]/gi, '_')}`
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80);
    const properties = Object.fromEntries(queryParameters.map((param) => [param.name, { type: 'string', description: `Query parameter observed as ${param.example}` }]));
    if (record.postData) properties.body = { type: 'object', description: 'Request body. Shape inferred from requestBodyExample.' };

    return {
      name,
      description: `${record.method.toUpperCase()} ${parsed.pathname}${authSignals.length ? ' (authentication required)' : ''}`,
      inputSchema: {
        type: 'object',
        properties,
        required: [],
      },
    };
  }

  private redactSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => {
      if (/authorization|cookie|api[-_]?key|token|secret|session/i.test(key)) return [key, '[REDACTED]'];
      return [key, value];
    }));
  }

  private redactSensitiveBody(body?: string | null): string | null | undefined {
    if (!body) return body;
    return body.replace(/("?(?:password|token|secret|apiKey|api_key|authorization)"?\s*[:=]\s*)"?[^",&}\s]+"?/gi, '$1"[REDACTED]"');
  }

  private buildEndpointUsage(record: NetworkRequestRecord, parsed: URL, authSignals: string[]): string {
    const authLine = authSignals.length > 0 ? 'Requires authentication; provide the same auth mechanism shown in authSignals.' : 'No authentication signal was observed.';
    return `${record.method.toUpperCase()} ${parsed.pathname}. ${authLine} Use query parameters listed in queryParameters and requestBodyExample when present.`;
  }

  private buildOpenApiDocument(title: string, pageUrl: string, endpoints: ApiEndpoint[]): Record<string, any> {
    const paths: Record<string, any> = {};
    for (const endpoint of endpoints) {
      paths[endpoint.path] ||= {};
      paths[endpoint.path][endpoint.method.toLowerCase()] = {
        summary: endpoint.id,
        description: endpoint.usage,
        parameters: endpoint.queryParameters.map((param) => ({
          name: param.name,
          in: 'query',
          required: false,
          schema: { type: 'string', example: param.example },
        })),
        responses: {
          [endpoint.status || 200]: {
            description: endpoint.contentType || 'Observed response',
          },
        },
      };
    }

    return {
      openapi: '3.1.0',
      info: {
        title: `${title || 'Discovered Website'} API`,
        version: '1.0.0',
        description: `Automatically discovered from ${pageUrl}`,
      },
      paths,
    };
  }

  private buildCodeIntelligence(pageUrl: string, endpoints: ApiEndpoint[]): CodeIntelligenceReport {
    const dataModels = endpoints.flatMap((endpoint) => this.inferDataModels(endpoint));
    const uniqueModels = dataModels.filter((model, index, all) => all.findIndex((other) => other.name === model.name) === index);
    const databaseTables = uniqueModels.map((model) => ({
      name: this.toSnakeCase(model.name),
      purpose: `Stores or caches data returned by ${model.source}`,
      columns: [
        { name: 'id', type: 'string primary key' },
        ...model.fields.slice(0, 24).map((field) => ({ name: this.toSnakeCase(field.name), type: this.toDatabaseType(field.type) })),
        { name: 'created_at', type: 'timestamp' },
        { name: 'updated_at', type: 'timestamp' },
      ],
    }));

    return {
      architecture: [
        `Create an SDK layer for ${new URL(pageUrl).origin} with one typed function per endpoint.`,
        'Keep browser-discovered endpoint details in a generated manifest and hand-written business logic in separate files.',
        'Use environment variables for tokens, API keys, base URLs, and tenant/domain identifiers.',
        'Add cache/retry/rate-limit wrappers around read-heavy GET endpoints.',
        'Expose MCP tools as thin wrappers over SDK functions so agents call stable tool names instead of raw URLs.',
      ],
      dataModels: uniqueModels,
      databaseTables,
      functions: endpoints.map((endpoint) => ({
        name: this.endpointFunctionName(endpoint),
        language: 'cross-sdk',
        purpose: endpoint.usage,
        input: endpoint.mcpTool.inputSchema,
        output: endpoint.contentType || 'unknown response',
        endpoint: endpoint.url,
      })),
      authStrategy: this.buildAuthStrategy(endpoints),
      errorHandling: [
        'Handle 401/403 as authentication or permission failures and never retry indefinitely.',
        'Handle 429 with exponential backoff and respect Retry-After headers when present.',
        'Treat 5xx responses as transient unless response body indicates a permanent validation error.',
        'Log method, path, status, and request ID headers; never log secrets, cookies, bearer tokens, or raw PII.',
      ],
      recommendedFiles: [
        { path: 'src/sdk/client.ts', purpose: 'Shared request client with auth, retries, JSON parsing, and redaction.' },
        { path: 'src/sdk/endpoints.ts', purpose: 'Typed functions generated from endpoints.json.' },
        { path: 'src/sdk/types.ts', purpose: 'Inferred TypeScript data models.' },
        { path: 'src/mcp/server.ts', purpose: 'MCP server exposing one safe tool per SDK function.' },
        { path: 'database/schema.sql', purpose: 'Optional tables for local cache, sync jobs, or cloned app backend.' },
        { path: 'examples/', purpose: 'Runnable examples for public and authenticated calls.' },
      ],
    };
  }

  private buildSdkAgents(title: string, pageUrl: string, endpoints: ApiEndpoint[], intelligence: CodeIntelligenceReport): Record<string, SdkAgentArtifact> {
    return {
      javascript: {
        fileName: 'javascript-sdk-agent.md',
        purpose: 'Build a full JavaScript/TypeScript SDK and MCP bridge from discovered endpoints.',
        prompt: this.buildJavaScriptSdkPrompt(title, pageUrl, endpoints, intelligence),
        starterCode: this.buildJavaScriptSdkStarter(endpoints),
      },
      php: {
        fileName: 'php-sdk-agent.md',
        purpose: 'Build a PHP SDK for backend integrations and WordPress/Laravel-style apps.',
        prompt: this.buildPhpSdkPrompt(title, pageUrl, endpoints, intelligence),
        starterCode: this.buildPhpSdkStarter(endpoints),
      },
      react: {
        fileName: 'react-sdk-agent.md',
        purpose: 'Build React hooks, data providers, and UI/API wiring from discovered endpoints.',
        prompt: this.buildReactSdkPrompt(title, pageUrl, endpoints, intelligence),
        starterCode: this.buildReactSdkStarter(endpoints),
      },
      tailwind: {
        fileName: 'tailwind-css-sdk-agent.md',
        purpose: 'Build a Tailwind design system, component library, and UI reconstruction guide.',
        prompt: this.buildTailwindSdkPrompt(title, pageUrl, endpoints, intelligence),
        starterCode: this.buildTailwindSdkStarter(),
      },
    };
  }

  private inferDataModels(endpoint: ApiEndpoint): CodeIntelligenceReport['dataModels'] {
    if (!endpoint.responseSample) return [];
    try {
      const parsed = JSON.parse(endpoint.responseSample);
      const sample = Array.isArray(parsed) ? parsed[0] : parsed?.data?.[0] || parsed?.items?.[0] || parsed;
      if (!sample || typeof sample !== 'object' || Array.isArray(sample)) return [];
      const fields = Object.entries(sample).slice(0, 40).map(([name, value]) => ({
        name,
        type: Array.isArray(value) ? 'array' : value === null ? 'unknown' : typeof value,
        required: value !== null && value !== undefined,
      }));
      return [{ name: this.modelNameFromPath(endpoint.path), source: endpoint.url, fields }];
    } catch {
      return [];
    }
  }

  private buildAuthStrategy(endpoints: ApiEndpoint[]): string[] {
    const authenticated = endpoints.filter((endpoint) => endpoint.requiresAuth);
    if (authenticated.length === 0) return ['No auth-required endpoints were observed; keep auth configuration available because deeper pages may require cookies, bearer tokens, or API keys.'];
    return Array.from(new Set(authenticated.flatMap((endpoint) => endpoint.authSignals))).map((signal) => `Support auth signal: ${signal}`);
  }

  private endpointFunctionName(endpoint: ApiEndpoint): string {
    const verb = endpoint.method.toLowerCase();
    const name = endpoint.path.split('/').filter(Boolean).slice(-3).join('_') || 'root';
    return `${verb}_${this.toSnakeCase(name)}`;
  }

  private modelNameFromPath(pathname: string): string {
    const segment = pathname.split('/').filter(Boolean).reverse().find((part) => !/v\d+|api|svc|service|services/i.test(part)) || 'DiscoveredModel';
    return segment.replace(/[^a-z0-9]+/gi, ' ').trim().split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('') || 'DiscoveredModel';
  }

  private toSnakeCase(value: string): string {
    return value.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'value';
  }

  private toDatabaseType(type: string): string {
    if (type === 'number') return 'numeric';
    if (type === 'boolean') return 'boolean';
    if (type === 'array' || type === 'object') return 'jsonb';
    return 'text';
  }

  private buildJavaScriptSdkPrompt(title: string, pageUrl: string, endpoints: ApiEndpoint[], intelligence: CodeIntelligenceReport): string {
    return this.buildSdkPrompt('JavaScript/TypeScript', title, pageUrl, endpoints, intelligence, [
      'Create a typed fetch client with baseUrl, auth provider, retries, timeout, and response parsing.',
      'Generate functions from code-intelligence.json function names and endpoints.json.',
      'Export TypeScript interfaces from inferred data models.',
      'Include Node and browser usage examples.',
    ]);
  }

  private buildPhpSdkPrompt(title: string, pageUrl: string, endpoints: ApiEndpoint[], intelligence: CodeIntelligenceReport): string {
    return this.buildSdkPrompt('PHP', title, pageUrl, endpoints, intelligence, [
      'Create a Composer-ready SDK with a Client class, endpoint methods, exceptions, and DTO arrays.',
      'Support bearer token, API key header, and cookie/session auth through constructor options.',
      'Include Laravel service-provider guidance and plain PHP examples.',
      'Generate PHPUnit tests using mocked HTTP responses from responseSample values.',
    ]);
  }

  private buildReactSdkPrompt(title: string, pageUrl: string, endpoints: ApiEndpoint[], intelligence: CodeIntelligenceReport): string {
    return this.buildSdkPrompt('React', title, pageUrl, endpoints, intelligence, [
      'Create hooks for read endpoints, mutation helpers for write endpoints, loading/error states, and suspense-safe boundaries if the app supports them.',
      'Wire hooks into generated UI components from ui-intelligence exports.',
      'Keep data-fetching logic separate from Tailwind presentation components.',
      'Generate examples for dashboard/list/detail/search pages.',
    ]);
  }

  private buildTailwindSdkPrompt(title: string, pageUrl: string, endpoints: ApiEndpoint[], intelligence: CodeIntelligenceReport): string {
    return this.buildSdkPrompt('Tailwind CSS', title, pageUrl, endpoints, intelligence, [
      'Create a Tailwind design-system package from design tokens and component classifications.',
      'Generate primitives for Button, Card, Input, Select, Table, Modal, Navigation, Header, Footer, and DataList.',
      'Document responsive rules, interaction states, dark-mode strategy, and accessibility expectations.',
      'Map API-backed UI components to React SDK hooks or MCP tools when ui-api-map.json exists.',
    ]);
  }

  private buildSdkPrompt(language: string, title: string, pageUrl: string, endpoints: ApiEndpoint[], intelligence: CodeIntelligenceReport, tasks: string[]): string {
    return `You are an expert ${language} SDK agent working from NexusBrowser discovery artifacts.

Website: ${title || pageUrl}
Source: ${pageUrl}
Endpoint count: ${endpoints.length}
Inferred model count: ${intelligence.dataModels.length}

Artifacts to use:
- endpoints.json
- openapi.json
- code-intelligence.json
- mcp-tools.json
- ui-api-map.json when present
- design-tokens.json and components.json when present

Tasks:
${tasks.map((task) => `- ${task}`).join('\n')}

Rules:
- Never hardcode captured secrets, cookies, tokens, or API keys.
- Use environment variables and explicit configuration.
- Prefer clean generated code that a senior engineer can maintain.
- Include examples, errors, edge cases, and testing guidance.
`;
  }

  private buildJavaScriptSdkStarter(endpoints: ApiEndpoint[]): string {
    const methods = endpoints.slice(0, 40).map((endpoint) => `  async ${this.endpointFunctionName(endpoint)}(params = {}) {
    return this.request(${JSON.stringify(endpoint.method)}, ${JSON.stringify(endpoint.url)}, params);
  }`).join('\n\n');
    return `export class DiscoveredApiClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '';
    this.token = options.token || process.env.API_AUTH_TOKEN;
  }

  async request(method, endpoint, params) {
    const url = new URL(endpoint);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (key !== 'body' && value !== undefined) url.searchParams.set(key, String(value));
    });
    const headers = { accept: 'application/json' };
    if (this.token) headers.authorization = \`Bearer \${this.token}\`;
    const response = await fetch(url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(params.body || {}) });
    if (!response.ok) throw new Error(\`API request failed: \${response.status}\`);
    return response.json().catch(() => response.text());
  }

${methods}
}
`;
  }

  private buildPhpSdkStarter(endpoints: ApiEndpoint[]): string {
    const methods = endpoints.slice(0, 30).map((endpoint) => `    public function ${this.endpointFunctionName(endpoint)}(array $params = []): array|string
    {
        return $this->request('${endpoint.method}', '${endpoint.url}', $params);
    }`).join('\n\n');
    return `<?php

final class DiscoveredApiClient
{
    public function __construct(private ?string $token = null) {}

    private function request(string $method, string $endpoint, array $params = []): array|string
    {
        $url = $endpoint;
        if ($method === 'GET' && $params) {
            $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($params);
        }
        $headers = ['Accept: application/json'];
        if ($this->token) $headers[] = 'Authorization: Bearer ' . $this->token;
        $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers)]]);
        $body = file_get_contents($url, false, $context);
        $json = json_decode($body ?: '', true);
        return json_last_error() === JSON_ERROR_NONE ? $json : ($body ?: '');
    }

${methods}
}
`;
  }

  private buildReactSdkStarter(endpoints: ApiEndpoint[]): string {
    const firstGet = endpoints.find((endpoint) => endpoint.method === 'GET');
    return `import { useEffect, useState } from 'react';

export function useDiscoveredEndpoint(url = ${JSON.stringify(firstGet?.url || '')}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(url));

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    fetch(url, { headers: { accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((nextData) => { if (!cancelled) setData(nextData); })
      .catch((nextError) => { if (!cancelled) setError(nextError); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  return { data, error, loading };
}
`;
  }

  private buildTailwindSdkStarter(): string {
    return `export const uiPrimitives = {
  button: 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2',
  card: 'rounded-lg border bg-white p-6 shadow-sm',
  input: 'w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2',
  section: 'mx-auto w-full max-w-7xl px-4 py-8 md:px-8',
  nav: 'flex items-center justify-between gap-4',
};
`;
  }

  private buildResearchScorecard(api: ApiDiscoveryCatalog, ui: UiIntelligenceReport): ResearchProject['scorecard'] {
    return {
      apiCoverage: { score: Math.min(100, api.endpoints.length * 12), notes: [`${api.endpoints.length} endpoints discovered`, `${api.crawledPages.length} pages crawled`] },
      uiCoverage: { score: Math.min(100, ui.components.length * 3), notes: [`${ui.components.length} components classified`, `${ui.layoutMap.length} layout regions mapped`] },
      dataModelConfidence: { score: Math.min(100, api.codeIntelligence.dataModels.length * 20), notes: [`${api.codeIntelligence.dataModels.length} models inferred from response samples`] },
      mcpReadiness: { score: Math.min(100, api.mcpTools.length * 12), notes: [`${api.mcpTools.length} MCP tool definitions generated`] },
      buildReadiness: { score: api.endpoints.length > 0 && ui.components.length > 0 ? 75 : 40, notes: ['OpenCode tasks, SDK agents, database, MCP, and UI artifacts generated'] },
    };
  }

  private buildProjectBuildPlan(api: ApiDiscoveryCatalog, ui: UiIntelligenceReport): ResearchProject['buildPlan'] {
    return [
      { id: '01', title: 'Project Setup', goal: 'Create the selected app boilerplate with TypeScript, Tailwind, linting, and environment configuration.', outputs: ['package.json', 'src/', '.env.example'] },
      { id: '02', title: 'Database Layer', goal: 'Create local SQLite schema, ORM models, and seed data from discovered API response samples.', outputs: ['database/schema.sql', 'database/schema.prisma', 'database/seed.json'] },
      { id: '03', title: 'API SDK', goal: `Implement typed client functions for ${api.endpoints.length} discovered endpoints with auth, retries, and redaction.`, outputs: ['src/sdk/client.ts', 'src/sdk/endpoints.ts', 'src/sdk/types.ts'] },
      { id: '04', title: 'MCP Server', goal: 'Expose discovered APIs as safe MCP tools backed by SDK functions.', outputs: ['src/mcp/server.ts', 'src/mcp/tools.ts', 'mcp/README.md'] },
      { id: '05', title: 'Tailwind Design System', goal: `Turn ${ui.components.length} classified UI components into reusable Tailwind primitives and page components.`, outputs: ['tailwind.config.ts', 'src/components/', 'src/app/page.tsx'] },
      { id: '06', title: 'Wire UI To Data', goal: 'Connect UI components to SDK hooks, API clients, MCP tools, or local database fallbacks.', outputs: ['src/hooks/', 'src/services/', 'src/components/*'] },
      { id: '07', title: 'Common Integrations', goal: 'Add selected production integrations: GitHub, Stripe, auth, database providers, email, storage, AI, analytics, deployment, commerce, and monitoring.', outputs: ['integrations/', '.env.example', 'src/integrations/'] },
      { id: '08', title: 'Tests And QA', goal: 'Generate Playwright smoke tests, API tests, visual comparison tasks, and agent repair loops.', outputs: ['tests/', 'playwright.config.ts', 'qa-report.md'] },
    ];
  }

  private buildOpenCodeTasks(plan: ResearchProject['buildPlan'], api: ApiDiscoveryCatalog, ui: UiIntelligenceReport): Record<string, string> {
    return Object.fromEntries(plan.map((step) => [`${step.id}-${this.toSnakeCase(step.title).replace(/_/g, '-')}.md`, `# ${step.title}

Goal: ${step.goal}

Context:
- Target: ${api.pageUrl}
- Endpoints: ${api.endpoints.length}
- UI components: ${ui.components.length}
- Inferred models: ${api.codeIntelligence.dataModels.length}

Required outputs:
${step.outputs.map((output) => `- ${output}`).join('\n')}

Rules:
- Read project-brain.json before editing.
- Use generated artifacts as references, not as unreviewed final code.
- Keep secrets in environment variables.
- Add tests or examples for every generated SDK function or user flow.
`]));
  }

  private buildDatabaseArtifacts(intelligence: CodeIntelligenceReport): Record<string, string> {
    const schemaSql = intelligence.databaseTables.map((table) => `CREATE TABLE IF NOT EXISTS ${table.name} (\n${table.columns.map((column) => `  ${column.name} ${column.type}`).join(',\n')}\n);`).join('\n\n');
    const prismaModels = intelligence.databaseTables.map((table) => `model ${table.name.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')} {\n${table.columns.map((column) => `  ${column.name} ${this.toPrismaType(column.type)}`).join('\n')}\n}`).join('\n\n');
    return {
      'schema.sql': schemaSql || '-- No database tables inferred yet. Crawl deeper pages or APIs with JSON response samples.',
      'schema.prisma': `datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}\n\n${prismaModels || '// No models inferred yet.'}\n`,
      'seed.json': JSON.stringify(intelligence.dataModels.map((model) => ({ model: model.name, source: model.source, sample: Object.fromEntries(model.fields.map((field) => [field.name, null])) })), null, 2),
      'database-agent.md': 'Use schema.sql/schema.prisma as a first pass. Normalize repeated nested JSON into child tables only when the app needs querying or editing those values. Add indexes for external IDs, dates, slugs, and foreign keys.',
    };
  }

  private buildMcpArtifacts(api: ApiDiscoveryCatalog): Record<string, string> {
    return {
      'tools.json': JSON.stringify(api.mcpTools, null, 2),
      'server.ts': this.buildMcpServerStub(api),
      'README.md': `# MCP Server\n\nGenerated from ${api.pageUrl}.\n\nExpose these tools through @modelcontextprotocol/sdk and route calls through the generated API SDK. Keep credentials in environment variables.\n`,
      'opencode-mcp-config.json': JSON.stringify({ mcpServers: { discoveredApi: { command: 'node', args: ['dist/mcp/server.js'], env: { API_AUTH_TOKEN: '${API_AUTH_TOKEN}' } } } }, null, 2),
    };
  }

  private buildBoilerplateArtifacts(api: ApiDiscoveryCatalog, ui: UiIntelligenceReport): Record<string, string> {
    return {
      'nextjs-prisma.md': `Create a Next.js app with Tailwind, Prisma SQLite, API SDK, MCP server, and ${ui.components.length} UI-informed components for ${api.pageUrl}.`,
      'vite-react.md': 'Create a Vite React app with Tailwind and the generated SDK hooks. Use local JSON fixtures when live API auth is unavailable.',
      'express-sqlite.md': 'Create an Express or Fastify backend with SQLite cache tables, sync jobs for GET endpoints, and REST proxy routes.',
      'mcp-server-only.md': 'Create only the MCP server and SDK wrapper, no UI. Best for agent automation against discovered APIs.',
      'php-sdk.md': 'Create a Composer package from sdk-agents/php-sdk-agent.md and expose endpoint methods for Laravel or plain PHP.',
    };
  }

  private buildResearchRisks(api: ApiDiscoveryCatalog, ui: UiIntelligenceReport): string[] {
    const risks = [];
    if (api.endpoints.length < 5) risks.push('Low endpoint count; crawl more pages and interact with filters/forms to improve API coverage.');
    if (api.codeIntelligence.dataModels.length === 0) risks.push('No data models inferred; response bodies may be unavailable or not JSON.');
    if (ui.components.length < 20) risks.push('Low UI component count; capture additional responsive screenshots or interact with menus/modals.');
    if (api.endpoints.some((endpoint) => endpoint.requiresAuth)) risks.push('Some endpoints require auth; generated apps need environment-based credential handling.');
    return risks.length ? risks : ['No major research risks detected from current crawl.'];
  }

  private buildNextResearchActions(api: ApiDiscoveryCatalog, ui: UiIntelligenceReport): string[] {
    return [
      'Click search, filters, menus, pagination, forms, and detail pages to expose more API traffic.',
      'Run api-crawl with a higher maxPages value for broader same-origin coverage.',
      'Capture ui-intelligence at mobile, tablet, and desktop widths for better responsive Tailwind output.',
      api.endpoints.length < 10 ? 'Endpoint coverage is probably incomplete; continue browsing deeper pages.' : 'Endpoint coverage is moderate; verify authenticated flows if needed.',
      ui.uiApiMap.length === 0 ? 'UI/API mapping is weak; interact with dynamic sections so response samples can be linked to visible components.' : 'Review ui-api-map.json and wire high-confidence mappings first.',
    ];
  }

  private buildMasterPrompt(project: Omit<ResearchProject, 'masterPrompt'>): string {
    return `You are OpenCode building a researched app from NexusBrowser artifacts.

Target: ${project.targetUrl}
Title: ${project.title}

Read first:
- project-brain.json
- build-plan.json
- scorecard.json
- tasks/*.md

Build goal:
Create a better, maintainable version of the researched website with React, Tailwind, local database support, API SDKs, MCP tools, tests, and clear docs.

Rules:
- Follow tasks in numeric order.
- Use API files for backend/client behavior.
- Use UI files for design system and component reconstruction.
- Use database files for local persistence and mock/offline mode.
- Use MCP files to expose APIs to agents.
- Never hardcode secrets, cookies, tokens, or captured credentials.
- Use integrations/* to add GitHub, Stripe, auth, database, email, storage, AI, analytics, deployment, commerce, and monitoring when useful.
- Run build/tests after each major phase and fix failures.

Summary: ${project.summary}
`;
  }

  private toPrismaType(type: string): string {
    if (type.includes('primary key')) return 'String @id @default(cuid())';
    if (type.includes('timestamp')) return 'DateTime @default(now())';
    if (type.includes('boolean')) return 'Boolean?';
    if (type.includes('numeric')) return 'Float?';
    if (type.includes('json')) return 'Json?';
    return 'String?';
  }

  private buildApiInstructions(pageUrl: string, endpoints: ApiEndpoint[]): string {
    const publicEndpoints = endpoints.filter((endpoint) => !endpoint.requiresAuth);
    const authenticatedEndpoints = endpoints.filter((endpoint) => endpoint.requiresAuth);
    const lines = [
      '# Discovered API Endpoints',
      '',
      `Captured from: ${pageUrl}`,
      '',
      'Files:',
      '- `endpoints.json`: normalized endpoint catalog with auth classification.',
      '- `openapi.json`: OpenAPI 3.1 document generated from observed traffic.',
      '- `mcp-tools.json`: MCP tool definitions inferred from endpoints.',
      '- `mcp-server-stub.ts`: starter MCP server implementation stub.',
      '- `code-intelligence.json`: architecture, database, model, and function guidance for coding agents.',
      '- `sdk-agents/`: JavaScript, PHP, React, and Tailwind CSS SDK-agent prompts plus starter code.',
      '- `opencode-api-prompt.md`: instructions for OpenCode to create wrappers, clients, or server mocks.',
      '',
      `Public endpoints observed: ${publicEndpoints.length}`,
      `Authenticated endpoints observed: ${authenticatedEndpoints.length}`,
      '',
      '## Endpoints',
      ...endpoints.map((endpoint) => `- ${endpoint.method} ${endpoint.url} - ${endpoint.requiresAuth ? `auth required (${endpoint.authSignals.join(', ')})` : 'no auth signal observed'}`),
      '',
      'Security note: sensitive headers and body fields are redacted. Do not ship captured cookies, bearer tokens, or private keys.',
      '',
      'Agent note: use `code-intelligence.json` before writing code. It explains inferred data models, database tables, SDK functions, auth strategy, and recommended project files.',
    ];

    return `${lines.join('\n')}\n`;
  }

  private buildOpenCodeApiPrompt(catalog: ApiDiscoveryCatalog): string {
    return `You are OpenCode. Build a developer-friendly API integration from this NexusBrowser API discovery package.

Use:
- endpoints.json for endpoint details, methods, headers, auth classification, query params, and body examples.
- openapi.json for a generated OpenAPI spec.
- mcp-tools.json and mcp-server-stub.ts for custom MCP server generation.
- README.md for human instructions.

Tasks:
- Create clean API client functions for the discovered endpoints.
- Separate public endpoints from authenticated endpoints.
- Add environment variables for required API keys/tokens instead of hardcoding secrets.
- Generate examples showing how to call each endpoint.
- If building a mock server, preserve paths, methods, query parameters, and response status expectations.
- If building an MCP server, expose one safe MCP tool per endpoint and require credentials through environment variables.

Captured page: ${catalog.pageUrl}
Endpoint count: ${catalog.endpoints.length}
Authenticated endpoint count: ${catalog.endpoints.filter((endpoint) => endpoint.requiresAuth).length}
`;
  }

  private buildMcpServerStub(catalog: ApiDiscoveryCatalog): string {
    const tools = catalog.endpoints.map((endpoint) => `  ${JSON.stringify(endpoint.mcpTool.name)}: {
    endpoint: ${JSON.stringify(endpoint.url)},
    method: ${JSON.stringify(endpoint.method)},
    requiresAuth: ${JSON.stringify(endpoint.requiresAuth)},
  }`).join(',\n');

    return `// Starter MCP server map generated by NexusBrowser.
// Wire this into @modelcontextprotocol/sdk and put credentials in environment variables.

export const discoveredTools = {
${tools}
};

export async function callDiscoveredTool(name: keyof typeof discoveredTools, input: Record<string, unknown>) {
  const tool = discoveredTools[name];
  const url = new URL(tool.endpoint);

  for (const [key, value] of Object.entries(input)) {
    if (key !== 'body' && value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (tool.requiresAuth && process.env.API_AUTH_TOKEN) headers.authorization = \`Bearer \${process.env.API_AUTH_TOKEN}\`;

  const response = await fetch(url, {
    method: tool.method,
    headers,
    body: tool.method === 'GET' ? undefined : JSON.stringify(input.body || {}),
  });

  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: await response.text(),
  };
}
`;
  }

  private saveCrawledTailwindPage(snapshot: CloneSnapshot, rootDir: string, index: number): void {
    const pagesDir = path.join(rootDir, 'tailwind-pages');
    const safeTitle = (snapshot.title || `page-${index}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || `page-${index}`;
    const pageDir = path.join(pagesDir, `${String(index).padStart(2, '0')}-${safeTitle}`);

    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, 'TailwindPage.tsx'), snapshot.tailwindComponent);
    fs.writeFileSync(path.join(pageDir, 'tailwind-ui.md'), snapshot.tailwindInventory);
    fs.writeFileSync(path.join(pageDir, 'screenshot.png'), Buffer.from(snapshot.screenshot, 'base64'));
    fs.writeFileSync(path.join(pageDir, 'page.json'), JSON.stringify({ url: snapshot.url, title: snapshot.title, layout: snapshot.layout, images: snapshot.images, colors: snapshot.colors, fonts: snapshot.fonts }, null, 2));
  }

  async createNewPage(sessionId: string): Promise<PageInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const page = await session.context.newPage();
    const pageId = uuid();
    const info: PageInfo = { id: pageId, url: 'about:blank', title: 'New Tab', loading: false };

    session.pages.set(pageId, page);
    session.pageInfos.set(pageId, info);
    this.setupPageListeners(page, pageId, session);

    return info;
  }

  async closePage(sessionId: string, pageId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const page = session.pages.get(pageId);
    if (page) {
      await page.close();
      session.pages.delete(pageId);
      session.pageInfos.delete(pageId);
    }
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    log.info(`Destroying session ${sessionId}`);
    for (const [, page] of session.pages) {
      await page.close().catch(() => {});
    }
    await session.context.close().catch(() => {});
    await session.browser.close().catch(() => {});
    this.sessions.delete(sessionId);
    this.emit('session:destroyed', { sessionId });
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionInfo(session: BrowserSession): SessionInfo {
    return {
      id: session.id,
      createdAt: session.createdAt,
      lastActive: session.lastActive,
      pages: Array.from(session.pageInfos.values()),
      activePageId: session.activePageId,
    };
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => this.getSessionInfo(s));
  }

  async getSessionPage(sessionId: string, pageId: string): Promise<Page | undefined> {
    return this.sessions.get(sessionId)?.pages.get(pageId);
  }
}
