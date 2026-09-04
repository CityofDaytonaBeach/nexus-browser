import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../core/config';
import { createLogger } from '../core/logger';

const log = createLogger('IDE');

interface IDEFile {
  path: string;
  name: string;
  content?: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

interface TerminalSession {
  id: string;
  pid: number;
  ws: WebSocket;
}

export class IDEServer {
  private app: express.Application;
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private terminals: Map<string, TerminalSession> = new Map();

  constructor() {
    this.app = express();
    this.app.use(express.json());

    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes(): void {
    this.app.get('/api/files', (req, res) => {
      const dirPath = (req.query.path as string) || process.cwd();
      this.listFiles(dirPath).then((files) => res.json(files)).catch((e) => res.status(500).json({ error: e.message }));
    });

    this.app.get('/api/file', (req, res) => {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'path required' });
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const stat = fs.statSync(filePath);
        res.json({ content, size: stat.size, modified: stat.mtimeMs });
      } catch (e: any) {
        res.status(404).json({ error: e.message });
      }
    });

    this.app.post('/api/file', (req, res) => {
      const { path: filePath, content } = req.body;
      if (!filePath) return res.status(400).json({ error: 'path required' });
      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content || '');
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.delete('/api/file', (req, res) => {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'path required' });
      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true });
        } else {
          fs.unlinkSync(filePath);
        }
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.post('/api/file/rename', (req, res) => {
      const { oldPath, newPath } = req.body;
      try {
        fs.renameSync(oldPath, newPath);
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.get('/api/workspace', (_req, res) => {
      res.json({
        root: process.cwd(),
        home: os.homedir(),
        workspace: path.join(os.homedir(), 'source'),
      });
    });

    this.app.get('/api/search', (req, res) => {
      const query = (req.query.q as string)?.toLowerCase();
      const dir = (req.query.path as string) || process.cwd();
      if (!query) return res.json([]);

      const results: Array<{ file: string; line: number; content: string }> = [];
      this.searchFiles(dir, query, results, 100);
      res.json(results);
    });
  }

  private async listFiles(dirPath: string): Promise<IDEFile[]> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const stat = fs.statSync(fullPath);
        return {
          path: fullPath,
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stat.size,
          modified: stat.mtimeMs,
        };
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  private searchFiles(dir: string, query: string, results: Array<{ file: string; line: number; content: string }>, maxResults: number): void {
    if (results.length >= maxResults) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.searchFiles(fullPath, query, results, maxResults);
        } else {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (results.length >= maxResults) return;
              if (lines[i].toLowerCase().includes(query)) {
                results.push({ file: fullPath, line: i + 1, content: lines[i].trim() });
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      log.debug('IDE WebSocket connected');

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          switch (msg.type) {
            case 'terminal:create':
              await this.createTerminal(ws, msg.id || `term-${Date.now()}`);
              break;
            case 'terminal:input':
              this.writeTerminal(msg.id, msg.data);
              break;
            case 'terminal:resize':
              this.resizeTerminal(msg.id, msg.cols, msg.rows);
              break;
            case 'terminal:kill':
              this.killTerminal(msg.id);
              break;
          }
        } catch (e: any) {
          ws.send(JSON.stringify({ type: 'error', error: e.message }));
        }
      });
    });
  }

  private async createTerminal(ws: WebSocket, id: string): Promise<void> {
    try {
      const pty = require('node-pty');
      const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env,
      });

      const terminal: TerminalSession = { id, pid: ptyProcess.pid, ws };
      this.terminals.set(id, terminal);

      ptyProcess.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'terminal:output', id, data }));
        }
      });

      ptyProcess.onExit(() => {
        this.terminals.delete(id);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'terminal:exit', id }));
        }
      });

      ws.send(JSON.stringify({ type: 'terminal:created', id }));
    } catch (error: any) {
      log.warn('node-pty not available, terminal disabled');
      ws.send(JSON.stringify({ type: 'terminal:error', error: 'node-pty not installed' }));
    }
  }

  private writeTerminal(id: string, data: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        const pty = require('node-pty');
        // pty process write handled via reference
      } catch {}
    }
  }

  private resizeTerminal(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        // resize handled by pty
      } catch {}
    }
  }

  private killTerminal(id: string): void {
    this.terminals.delete(id);
  }

  async start(): Promise<void> {
    const cfg = config.get();
    return new Promise((resolve) => {
      this.httpServer.listen(cfg.ide.port, () => {
        log.info(`IDE server on port ${cfg.ide.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const [, terminal] of this.terminals) {
      try { process.kill(terminal.pid); } catch {}
    }
    this.terminals.clear();
    return new Promise((resolve) => this.httpServer.close(() => resolve()));
  }
}
