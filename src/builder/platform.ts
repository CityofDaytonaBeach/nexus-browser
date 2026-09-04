import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
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

export interface BuildWorkspace {
  id: string;
  name: string;
  root: string;
  prompt: string;
  status: 'created' | 'opencode-running' | 'opencode-unavailable' | 'failed';
  opencodeCommand: string;
  logPath: string;
  previewCommand: string;
  createdAt: string;
}

export class BuilderPlatform {
  private snapshots: Map<string, WorkspaceSnapshot> = new Map();
  private locks: Map<string, FileLock> = new Map();
  private sessions: Map<string, OpenCodeSessionStub> = new Map();
  private builds: Map<string, BuildWorkspace> = new Map();
  private buildProcesses: Map<string, ChildProcess> = new Map();

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

  startBuildFromPrompt(prompt: string, options: { workspaceRoot?: string; uiLook?: string; mode?: string } = {}): BuildWorkspace {
    const id = uuid().slice(0, 8);
    const name = this.safeProjectName(prompt) || `nexus-app-${id}`;
    const root = path.join(path.resolve(options.workspaceRoot || path.join(process.cwd(), 'generated-apps')), `${name}-${id}`);
    const logPath = path.join(root, 'opencode-build.log');
    const opencodePrompt = this.buildOpenCodeAppPrompt(prompt, options.uiLook || 'modern-saas');

    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    this.writeStarterApp(root, name, prompt);
    fs.writeFileSync(path.join(root, 'OPENCODE_BUILD_PROMPT.md'), opencodePrompt);

    const command = `opencode run ${JSON.stringify(opencodePrompt)}`;
    const build: BuildWorkspace = {
      id,
      name,
      root,
      prompt,
      status: 'created',
      opencodeCommand: command,
      logPath,
      previewCommand: 'npm install && npm run dev',
      createdAt: new Date().toISOString(),
    };

    try {
      const commandParts = process.platform === 'win32'
        ? { command: 'cmd.exe', args: ['/c', 'opencode', 'run', opencodePrompt] }
        : { command: 'opencode', args: ['run', opencodePrompt] };
      const child = spawn(commandParts.command, commandParts.args, {
        cwd: root,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
      const log = fs.createWriteStream(logPath, { flags: 'a' });
      child.stdout.pipe(log);
      child.stderr.pipe(log);
      child.on('exit', (code) => {
        log.write(`\nOpenCode exited with code ${code}\n`);
        this.buildProcesses.delete(id);
      });
      child.on('error', (error) => {
        log.write(`\nOpenCode failed to start: ${error.message}\n`);
        build.status = 'opencode-unavailable';
      });
      this.buildProcesses.set(id, child);
      build.status = 'opencode-running';
    } catch {
      fs.writeFileSync(logPath, `OpenCode could not be launched automatically. Run this manually from ${root}:\n${command}\n`);
      build.status = 'opencode-unavailable';
    }

    this.builds.set(id, build);
    this.createOpenCodeSession(root, opencodePrompt, options.mode || 'build');
    return build;
  }

  getBuilds(): BuildWorkspace[] {
    return Array.from(this.builds.values());
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

  private safeProjectName(prompt: string): string {
    const base = prompt.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42);
    if (base.includes('landing')) return 'landing-page';
    if (base.includes('dashboard')) return 'dashboard-app';
    if (base.includes('saas')) return 'saas-app';
    return base || 'nexus-app';
  }

  private writeStarterApp(root: string, name: string, prompt: string): void {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview' },
      dependencies: { '@vitejs/plugin-react': 'latest', vite: 'latest', typescript: 'latest', react: 'latest', 'react-dom': 'latest' },
      devDependencies: {},
    }, null, 2));
    fs.writeFileSync(path.join(root, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>\n');
    fs.writeFileSync(path.join(root, 'src', 'main.jsx'), `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport './styles.css';\n\nfunction App() {\n  return (\n    <main className="page">\n      <nav className="nav"><strong>${name}</strong><a>Features</a><a>Pricing</a><button>Start Building</button></nav>\n      <section className="hero">\n        <p className="eyebrow">NexusBrowser generated starter</p>\n        <h1>${this.escapeHtml(prompt).slice(0, 90) || 'Build a production landing page'}</h1>\n        <p>OpenCode is now connected to this workspace. It should turn this starter into a polished application using the prompt in OPENCODE_BUILD_PROMPT.md.</p>\n        <div className="actions"><button>Get Started</button><button className="ghost">View Plan</button></div>\n      </section>\n      <section className="grid"><article>Research</article><article>Plan</article><article>Build</article></section>\n    </main>\n  );\n}\n\ncreateRoot(document.getElementById('root')).render(<App />);\n`);
    fs.writeFileSync(path.join(root, 'src', 'styles.css'), `body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f7fbff;color:#0f172a}.page{min-height:100vh}.nav{height:64px;display:flex;align-items:center;gap:24px;padding:0 40px;border-bottom:1px solid #dbeafe;background:white}.nav strong{margin-right:auto;color:#0284c7}.nav a{color:#475569}.nav button,.hero button{border:0;border-radius:12px;background:#0284c7;color:white;padding:12px 18px;font-weight:700}.hero{max-width:920px;margin:0 auto;padding:96px 24px;text-align:center}.eyebrow{color:#0284c7;font-weight:800;text-transform:uppercase;letter-spacing:.16em}.hero h1{font-size:clamp(40px,8vw,84px);line-height:.95;margin:16px 0}.hero p{font-size:20px;color:#475569}.actions{display:flex;gap:12px;justify-content:center;margin-top:28px}.hero .ghost{background:white;color:#0284c7;border:1px solid #bae6fd}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:980px;margin:0 auto;padding:0 24px 80px}.grid article{border:1px solid #dbeafe;border-radius:20px;background:white;padding:28px;font-weight:800;color:#0284c7}@media(max-width:760px){.nav{padding:0 16px}.nav a{display:none}.grid{grid-template-columns:1fr}.hero{text-align:left}.actions{justify-content:flex-start}}`);
    fs.writeFileSync(path.join(root, 'README.md'), `# ${name}\n\nGenerated by NexusBrowser Builder.\n\nPrompt:\n${prompt}\n\nRun locally:\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`);
  }

  private buildOpenCodeAppPrompt(prompt: string, uiLook: string): string {
    return `You are OpenCode inside a NexusBrowser generated app workspace.\n\nUser request: ${prompt}\n\nUI look: ${uiLook}\n\nBuild a real working application, not just notes. Use the starter files already created in this workspace. Improve the landing page/application with clean React, production-quality CSS, responsive layout, accessible components, and clear project structure.\n\nRequired work:\n- Inspect the current files.\n- Replace the starter with a polished implementation matching the request.\n- Keep the app runnable with npm install and npm run dev.\n- Add clear README usage instructions.\n- Do not hardcode secrets.\n- Run or explain build verification.\n`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
  }
}
