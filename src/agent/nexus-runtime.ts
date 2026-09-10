import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { AIAgent, AgentTask } from './index';

export interface NexusMemoryEntry {
  id: string;
  scope: 'project' | 'session' | 'user';
  content: string;
  tags: string[];
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface NexusSkill {
  id: string;
  name: string;
  description: string;
  trigger: string;
  steps: string[];
  successCount: number;
  failureCount: number;
  lessons: string[];
  createdAt: number;
  updatedAt: number;
}

export interface NexusDelegationRun {
  id: string;
  goal: string;
  agents: string[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  tasks: AgentTask[];
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface NexusScheduledJob {
  id: string;
  name: string;
  goal: string;
  intervalMs: number;
  enabled: boolean;
  agents: string[];
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  createdAt: number;
}

export interface NexusRuntimeState {
  memories: NexusMemoryEntry[];
  skills: NexusSkill[];
  delegations: NexusDelegationRun[];
  jobs: NexusScheduledJob[];
}

export class NexusAgentRuntime {
  private state: NexusRuntimeState = { memories: [], skills: [], delegations: [], jobs: [] };
  private readonly stateDir = path.join(process.cwd(), '.nexus', 'agent-runtime');
  private readonly stateFile = path.join(this.stateDir, 'state.json');
  private timers = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.load();
    this.startJobs();
  }

  getState(): NexusRuntimeState {
    return this.state;
  }

  remember(input: { scope?: NexusMemoryEntry['scope']; content: string; tags?: string[]; source?: string }): NexusMemoryEntry {
    const now = Date.now();
    const memory: NexusMemoryEntry = {
      id: uuid(),
      scope: input.scope || 'project',
      content: input.content,
      tags: input.tags || [],
      source: input.source || 'nexus-runtime',
      createdAt: now,
      updatedAt: now,
    };
    this.state.memories.unshift(memory);
    this.save();
    return memory;
  }

  searchMemory(query: string, limit = 20): NexusMemoryEntry[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return this.state.memories.slice(0, limit);

    return this.state.memories
      .map((memory) => ({ memory, score: this.scoreMemory(memory, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt)
      .slice(0, limit)
      .map((item) => item.memory);
  }

  findSkills(query: string, limit = 6): NexusSkill[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return this.state.skills.slice(0, limit);

    return this.state.skills
      .map((skill) => ({ skill, score: this.scoreSkill(skill, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.skill.updatedAt - a.skill.updatedAt)
      .slice(0, limit)
      .map((item) => item.skill);
  }

  recordSkillOutcome(id: string, success: boolean, lesson?: string): NexusSkill | undefined {
    const skill = this.state.skills.find((item) => item.id === id);
    if (!skill) return undefined;
    if (success) skill.successCount += 1;
    else skill.failureCount += 1;
    if (lesson) skill.lessons.unshift(lesson);
    skill.updatedAt = Date.now();
    this.save();
    return skill;
  }

  buildContext(query: string): string {
    const memories = this.searchMemory(query, 8);
    const skills = this.findSkills(query, 5);
    const jobs = this.state.jobs.filter((job) => job.enabled).slice(0, 6);

    return [
      'Nexus Native Agent Runtime:',
      `Persistent memories: ${this.state.memories.length}`,
      `Reusable skills: ${this.state.skills.length}`,
      `Delegation runs: ${this.state.delegations.length}`,
      `Enabled recurring jobs: ${jobs.length}`,
      '',
      'Relevant memory:',
      memories.length ? memories.map((memory) => `- ${memory.content.slice(0, 240)} [${memory.tags.join(', ') || memory.source}]`).join('\n') : '- none yet',
      '',
      'Relevant skills:',
      skills.length ? skills.map((skill) => `- ${skill.name}: ${skill.trigger}; steps=${skill.steps.slice(0, 4).join(' -> ')}`).join('\n') : '- none yet; create one after repeated or successful workflows',
      '',
      'Recurring jobs:',
      jobs.length ? jobs.map((job) => `- ${job.name}: every ${Math.round(job.intervalMs / 60000)}m; ${job.goal}`).join('\n') : '- none yet',
    ].join('\n');
  }

  upsertSkill(input: { id?: string; name: string; description: string; trigger: string; steps: string[]; lesson?: string }): NexusSkill {
    const now = Date.now();
    const existing = input.id ? this.state.skills.find((skill) => skill.id === input.id) : this.state.skills.find((skill) => skill.name.toLowerCase() === input.name.toLowerCase());

    if (existing) {
      existing.name = input.name;
      existing.description = input.description;
      existing.trigger = input.trigger;
      existing.steps = input.steps;
      existing.updatedAt = now;
      if (input.lesson) existing.lessons.unshift(input.lesson);
      this.save();
      return existing;
    }

    const skill: NexusSkill = {
      id: uuid(),
      name: input.name,
      description: input.description,
      trigger: input.trigger,
      steps: input.steps,
      successCount: 0,
      failureCount: 0,
      lessons: input.lesson ? [input.lesson] : [],
      createdAt: now,
      updatedAt: now,
    };
    this.state.skills.unshift(skill);
    this.save();
    return skill;
  }

  async delegate(input: { goal: string; agents?: string[]; sessionId: string; pageId: string }, agent: AIAgent): Promise<NexusDelegationRun> {
    const run: NexusDelegationRun = {
      id: uuid(),
      goal: input.goal,
      agents: input.agents?.length ? input.agents : ['research-agent', 'opencode-build-agent', 'qa-agent'],
      status: 'running',
      tasks: [],
      createdAt: Date.now(),
    };
    this.state.delegations.unshift(run);
    this.save();

    try {
      for (const agentId of run.agents) {
        const task = await agent.startTask(`[${agentId}] ${input.goal}`, input.sessionId, input.pageId);
        run.tasks.push(task);
      }
      run.status = 'completed';
      run.completedAt = Date.now();
      run.result = `Completed ${run.tasks.length} delegated task(s).`;
      this.remember({ content: `Delegation completed: ${input.goal}`, tags: ['delegation', ...run.agents], source: 'nexus-delegation' });
    } catch (error: any) {
      run.status = 'failed';
      run.error = error.message;
      run.completedAt = Date.now();
      this.remember({ content: `Delegation failed: ${input.goal}\n${error.message}`, tags: ['delegation', 'failure'], source: 'nexus-delegation' });
    }

    this.save();
    return run;
  }

  createJob(input: { name: string; goal: string; intervalMs: number; agents?: string[]; enabled?: boolean }): NexusScheduledJob {
    const now = Date.now();
    const job: NexusScheduledJob = {
      id: uuid(),
      name: input.name,
      goal: input.goal,
      intervalMs: Math.max(60000, input.intervalMs),
      enabled: input.enabled ?? true,
      agents: input.agents?.length ? input.agents : ['scheduler-agent', 'memory-agent'],
      nextRun: now + Math.max(60000, input.intervalMs),
      runCount: 0,
      createdAt: now,
    };
    this.state.jobs.unshift(job);
    this.scheduleJob(job);
    this.save();
    return job;
  }

  deleteJob(id: string): boolean {
    const timer = this.timers.get(id);
    if (timer) clearInterval(timer);
    this.timers.delete(id);
    const before = this.state.jobs.length;
    this.state.jobs = this.state.jobs.filter((job) => job.id !== id);
    this.save();
    return this.state.jobs.length !== before;
  }

  private scoreMemory(memory: NexusMemoryEntry, terms: string[]): number {
    const haystack = `${memory.content} ${memory.tags.join(' ')} ${memory.source}`.toLowerCase();
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  }

  private scoreSkill(skill: NexusSkill, terms: string[]): number {
    const haystack = `${skill.name} ${skill.description} ${skill.trigger} ${skill.steps.join(' ')} ${skill.lessons.join(' ')}`.toLowerCase();
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  }

  private startJobs(): void {
    for (const job of this.state.jobs) this.scheduleJob(job);
  }

  private scheduleJob(job: NexusScheduledJob): void {
    const existing = this.timers.get(job.id);
    if (existing) clearInterval(existing);
    if (!job.enabled) return;

    const timer = setInterval(() => {
      job.lastRun = Date.now();
      job.nextRun = job.lastRun + job.intervalMs;
      job.runCount += 1;
      this.remember({ content: `Scheduled job due: ${job.name}\nGoal: ${job.goal}`, tags: ['scheduled-job', ...job.agents], source: 'nexus-scheduler' });
      this.save();
    }, job.intervalMs);
    this.timers.set(job.id, timer);
  }

  private load(): void {
    if (!fs.existsSync(this.stateFile)) return;
    try {
      this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      this.state = { memories: [], skills: [], delegations: [], jobs: [] };
    }
  }

  private save(): void {
    if (!fs.existsSync(this.stateDir)) fs.mkdirSync(this.stateDir, { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }
}
