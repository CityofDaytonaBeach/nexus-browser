import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { config } from '../core/config';
import { createLogger } from '../core/logger';
import { BrowserPage, BrowserAction, ActionResult, PageInfo, SessionInfo } from '../core/types';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('Browser');

export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  pages: Map<string, Page>;
  pageInfos: Map<string, PageInfo>;
  activePageId?: string;
  cdpSession?: CDPSession;
  createdAt: number;
  lastActive: number;
}

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
    });

    page.on('console', (msg) => {
      this.emit('page:console', { sessionId: session.id, pageId, type: msg.type(), text: msg.text() });
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
