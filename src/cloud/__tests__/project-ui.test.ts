import * as fs from 'fs';
import * as path from 'path';
import { createServer } from 'http';
import { launchChromium } from '../../browser/launch';

test('browser UI switches project ownership and clears it for new chats', async () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
  const server = createServer((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url === '/api/security/csrf') res.end(JSON.stringify({ token: 'fixture-token' }));
    else if (req.url === '/api/chats/a') res.end(JSON.stringify({ id: 'a', title: 'Project A', projectId: 'build-a', messages: [] }));
    else if (req.url === '/api/chats/b') res.end(JSON.stringify({ id: 'b', title: 'Project B', projectId: 'build-b', messages: [] }));
    else if (req.url === '/api/chats' && req.method === 'POST') res.end(JSON.stringify({ id: 'new', title: 'New chat', projectId: null, messages: [] }));
    else res.end('[]');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await launchChromium({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('nexus-active-build-id', 'stale-project');
      // Keep this isolated fixture away from any user's running backend socket.
      (window as any).WebSocket = class {
        static OPEN = 1; readyState = 0;
        send() {} close() {} addEventListener() {}
      };
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as any).port}`, { waitUntil: 'networkidle' });
    expect(await page.evaluate('activeBuildId')).toBeNull();
    await page.evaluate("openChat('a')");
    expect(await page.evaluate('activeBuildId')).toBe('build-a');
    await page.evaluate("openChat('b')");
    expect(await page.evaluate('activeBuildId')).toBe('build-b');
    page.once('dialog', (dialog) => dialog.accept('New chat'));
    await page.evaluate('createNewChat()');
    expect(await page.evaluate('activeBuildId')).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 60000);
