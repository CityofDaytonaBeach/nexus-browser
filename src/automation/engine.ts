import { BrowserEngine } from '../browser/engine';
import { AIAgent, AgentTask } from '../agent/index';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { createLogger } from '../core/logger';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('Automation');

export interface AutomationScript {
  id: string;
  name: string;
  description: string;
  triggers: Trigger[];
  steps: AutomationStep[];
  variables: Record<string, string>;
  schedule?: ScheduleConfig;
  enabled: boolean;
  createdAt: number;
  lastRun?: number;
  runCount: number;
}

export interface Trigger {
  type: 'manual' | 'schedule' | 'event' | 'webhook' | 'url_match';
  config: Record<string, any>;
}

export interface AutomationStep {
  id: string;
  action: string;
  params: Record<string, any>;
  waitFor?: string;
  timeout?: number;
  retry?: number;
}

export interface ScheduleConfig {
  type: 'interval' | 'cron' | 'once';
  value: string;
  timezone?: string;
}

export interface WorkflowExecution {
  id: string;
  scriptId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  startedAt: number;
  completedAt?: number;
  results: any[];
  error?: string;
}

export class AutomationEngine extends EventEmitter {
  private scripts: Map<string, AutomationScript> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private engine: BrowserEngine;
  private agent: AIAgent;
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.engine = BrowserEngine.getInstance();
    this.agent = new AIAgent();
  }

  async initialize(): Promise<void> {
    log.info('Automation Engine initializing');
    this.loadScripts();
    this.startScheduledScripts();
    log.info('Automation Engine ready');
  }

  private loadScripts(): void {
    const scriptsDir = path.join(process.cwd(), 'automations');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
      return;
    }

    try {
      const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const script = JSON.parse(fs.readFileSync(path.join(scriptsDir, file), 'utf8'));
        this.scripts.set(script.id, script);
        log.debug(`Loaded script: ${script.name}`);
      }
    } catch (error: any) {
      log.error(`Failed to load scripts: ${error.message}`);
    }
  }

  private startScheduledScripts(): void {
    for (const [, script] of this.scripts) {
      if (script.enabled && script.schedule) {
        this.scheduleScript(script);
      }
    }
  }

  private scheduleScript(script: AutomationScript): void {
    if (!script.schedule) return;

    if (script.schedule.type === 'interval') {
      const ms = this.parseInterval(script.schedule.value);
      const timer = setInterval(() => this.runScript(script.id), ms);
      this.timers.set(script.id, timer);
    }
  }

  private parseInterval(value: string): number {
    const match = value.match(/(\d+)(s|m|h|d)/);
    if (!match) return 60000;
    const num = parseInt(match[1]);
    switch (match[2]) {
      case 's': return num * 1000;
      case 'm': return num * 60000;
      case 'h': return num * 3600000;
      case 'd': return num * 86400000;
      default: return 60000;
    }
  }

  createScript(config: Omit<AutomationScript, 'id' | 'createdAt' | 'runCount'>): AutomationScript {
    const script: AutomationScript = {
      ...config,
      id: uuid(),
      createdAt: Date.now(),
      runCount: 0,
    };
    this.scripts.set(script.id, script);
    this.saveScript(script);
    this.emit('script:created', { scriptId: script.id });
    return script;
  }

  updateScript(id: string, updates: Partial<AutomationScript>): AutomationScript | null {
    const script = this.scripts.get(id);
    if (!script) return null;
    Object.assign(script, updates);
    this.saveScript(script);
    return script;
  }

  deleteScript(id: string): boolean {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }
    this.scripts.delete(id);
    const filePath = path.join(process.cwd(), 'automations', `${id}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  }

  private saveScript(script: AutomationScript): void {
    const scriptsDir = path.join(process.cwd(), 'automations');
    if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, `${script.id}.json`), JSON.stringify(script, null, 2));
  }

  async runScript(scriptId: string, sessionId?: string): Promise<WorkflowExecution> {
    const script = this.scripts.get(scriptId);
    if (!script) throw new Error('Script not found');

    const exec: WorkflowExecution = {
      id: uuid(),
      scriptId,
      status: 'running',
      startedAt: Date.now(),
      results: [],
    };
    this.executions.set(exec.id, exec);

    this.emit('execution:started', { executionId: exec.id, scriptId });

    try {
      let sid = sessionId;
      if (!sid) {
        const session = await this.engine.createSession();
        sid = session.id;
      }

      const pageId = this.engine.getSession(sid)?.activePageId || '';

      for (const step of script.steps) {
        const result = await this.executeStep(sid, pageId, step);
        exec.results.push({ step: step.id, result });
        this.emit('execution:step', { executionId: exec.id, step: step.id });
      }

      exec.status = 'completed';
      exec.completedAt = Date.now();
      script.lastRun = Date.now();
      script.runCount++;
      this.saveScript(script);

      this.emit('execution:completed', { executionId: exec.id });
    } catch (error: any) {
      exec.status = 'failed';
      exec.error = error.message;
      exec.completedAt = Date.now();
      this.emit('execution:failed', { executionId: exec.id, error: error.message });
    }

    return exec;
  }

  private async executeStep(sessionId: string, pageId: string, step: AutomationStep): Promise<any> {
    const retries = step.retry || 0;
    for (let i = 0; i <= retries; i++) {
      try {
        switch (step.action) {
          case 'navigate':
            return await this.engine.executeAction(sessionId, pageId, { type: 'navigate', url: step.params.url, options: { timeout: step.timeout } });

          case 'click':
            return await this.engine.executeAction(sessionId, pageId, { type: 'click', selector: step.params.selector, options: { timeout: step.timeout } });

          case 'type':
            return await this.engine.executeAction(sessionId, pageId, { type: 'type', selector: step.params.selector, value: step.params.text, options: { timeout: step.timeout } });

          case 'screenshot':
            return await this.engine.executeAction(sessionId, pageId, { type: 'screenshot', options: step.params });

          case 'wait':
            return await this.engine.executeAction(sessionId, pageId, { type: 'wait', options: { timeout: step.params.ms || 1000 } });

          case 'evaluate':
            return await this.engine.executeAction(sessionId, pageId, { type: 'evaluate', script: step.params.script });

          case 'ai_task':
            return await this.agent.startTask(step.params.goal, sessionId, pageId);

          case 'extract':
            return await this.engine.executeAction(sessionId, pageId, {
              type: 'evaluate',
              script: step.params.selector
                ? `document.querySelector('${step.params.selector}')?.textContent`
                : 'document.body.innerText',
            });

          case 'scroll':
            return await this.engine.executeAction(sessionId, pageId, { type: 'scroll', coordinates: { x: 0, y: step.params.amount || 300 } });

          case 'pdf':
            return await this.engine.executeAction(sessionId, pageId, { type: 'pdf' });

          case 'select':
            return await this.engine.executeAction(sessionId, pageId, { type: 'select', selector: step.params.selector, value: step.params.value });

          case 'press':
            return await this.engine.executeAction(sessionId, pageId, { type: 'press', value: step.params.key });

          default:
            throw new Error(`Unknown action: ${step.action}`);
        }
      } catch (error: any) {
        if (i === retries) throw error;
        log.warn(`Step ${step.id} failed, retry ${i + 1}/${retries}: ${error.message}`);
      }
    }
  }

  getScript(id: string): AutomationScript | undefined {
    return this.scripts.get(id);
  }

  getAllScripts(): AutomationScript[] {
    return Array.from(this.scripts.values());
  }

  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  getExecutionsForScript(scriptId: string): WorkflowExecution[] {
    return Array.from(this.executions.values()).filter((e) => e.scriptId === scriptId);
  }

  async destroy(): Promise<void> {
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
}
