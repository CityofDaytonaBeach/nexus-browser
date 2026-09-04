import { EventEmitter } from 'events';
import { BrowserEngine, BrowserSession } from './engine';
import { createLogger } from '../core/logger';
import { config } from '../core/config';

const log = createLogger('BrowserManager');

export class BrowserManager extends EventEmitter {
  private engine: BrowserEngine;
  private static instance: BrowserManager;

  private constructor() {
    super();
    this.engine = BrowserEngine.getInstance();
  }

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  async initialize(): Promise<void> {
    log.info('Initializing Browser Manager');
    const cfg = config.get();

    this.engine.on('session:created', (data) => this.emit('session:created', data));
    this.engine.on('session:destroyed', (data) => this.emit('session:destroyed', data));
    this.engine.on('page:navigated', (data) => this.emit('page:navigated', data));
    this.engine.on('page:loaded', (data) => this.emit('page:loaded', data));
    this.engine.on('page:console', (data) => this.emit('page:console', data));

    if (cfg.browser.userDataDir) {
      const fs = require('fs');
      if (!fs.existsSync(cfg.browser.userDataDir)) {
        fs.mkdirSync(cfg.browser.userDataDir, { recursive: true });
      }
    }

    log.info('Browser Manager initialized');
  }

  async getDefaultSession(): Promise<BrowserSession> {
    const sessions = this.engine.getAllSessions();
    if (sessions.length > 0) {
      return this.engine.getSession(sessions[0].id)!;
    }

    const info = await this.engine.createSession();
    return this.engine.getSession(info.id)!;
  }

  getEngine(): BrowserEngine {
    return this.engine;
  }

  async cleanup(): Promise<void> {
    log.info('Cleaning up all sessions');
    const sessions = this.engine.getAllSessions();
    for (const s of sessions) {
      await this.engine.destroySession(s.id);
    }
  }
}
