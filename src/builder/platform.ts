import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

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

export class BuilderPlatform {
  private snapshots: Map<string, WorkspaceSnapshot> = new Map();
  private locks: Map<string, FileLock> = new Map();
  private sessions: Map<string, OpenCodeSessionStub> = new Map();

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
}
