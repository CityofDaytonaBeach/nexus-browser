import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createServer, Server } from 'http';
import { verifyBrowserProduct } from '../browser-verification';
import { launchChromium } from '../../browser/launch';
import { BrowserEngine, VisualPageProfile } from '../../browser/engine';
import { visualProfileScript } from '../../browser/visual-profile';

const contract = { product: 'Task tracker', workflows: [{ name: 'Add and persist a task', path: '/', steps: [
  { action: 'fill', target: { role: 'textbox', name: 'New task' }, value: 'Browser task' },
  { action: 'click', target: { role: 'button', name: 'Add task' } },
  { action: 'expectText', text: 'Browser task' },
  { action: 'reload' }, { action: 'expectText', text: 'Browser task' },
] }] };
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<main><h1>Task tracker</h1><label>New task<input aria-label="New task" id="task"></label><button id="add">Add task</button><ul id="tasks"></ul></main>
<script>const tasks=JSON.parse(localStorage.getItem('tasks')||'[]');function render(){document.getElementById('tasks').replaceChildren(...tasks.map(t=>{const el=document.createElement('li');el.textContent=t;return el;}));}render();document.getElementById('add').onclick=()=>{tasks.push(document.getElementById('task').value);localStorage.setItem('tasks',JSON.stringify(tasks));render();};</script></body></html>`;

describe('Independent rendered browser verification', () => {
  let root: string;
  let server: Server;
  let url: string;
  let html: string;
  let status: number;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-browser-check-'));
    fs.mkdirSync(path.join(root, '.nexus'));
    fs.writeFileSync(path.join(root, '.nexus', 'product-contract.json'), JSON.stringify(contract));
    html = fixture; status = 200;
    server = createServer((req, res) => { res.writeHead(status, { 'Content-Type': 'text/html' }); res.end(html); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  });
  test('exercises creation and reload persistence on desktop and mobile', async () => {
    const report = await verifyBrowserProduct(root, url, path.join(root, 'evidence'));
    expect(report.status).toBe('passed');
    expect(report.workflows.map((item) => item.device)).toEqual(['desktop', 'mobile']);
    expect(report.artifacts.filter((file) => file.endsWith('.png'))).toHaveLength(2);
    expect(report.artifacts.every((file) => fs.existsSync(file))).toBe(true);
  }, 60000);
  test('rejects a rendered app whose primary action does nothing', async () => {
    html = fixture.replace("document.getElementById('add').onclick=()=>{", "document.getElementById('add').onclick=()=>{return;");
    const report = await verifyBrowserProduct(root, url, path.join(root, 'evidence'));
    expect(report.status).toBe('failed');
    expect(report.workflows.every((item) => !item.passed)).toBe(true);
  }, 60000);
  test('rejects 404 previews rather than declaring them ready', async () => {
    status = 404;
    const report = await verifyBrowserProduct(root, url, path.join(root, 'evidence'));
    expect(report.status).toBe('failed');
    expect(report.issues.join('\n')).toContain('404');
  }, 60000);
  test('rejects missing outcome assertions without launching a browser', async () => {
    fs.writeFileSync(path.join(root, '.nexus', 'product-contract.json'), JSON.stringify({ product: 'Fake', workflows: [{ name: 'Fake', steps: [{ action: 'click', target: { role: 'button', name: 'Add task' } }, { action: 'reload' }] }] }));
    const report = await verifyBrowserProduct(root, url, path.join(root, 'evidence'));
    expect(report.issues.join('\n')).toContain('assert its outcome');
  });
  test('compares a captured native-style reference at its original viewport', async () => {
    const browser = await launchChromium({ headless: true });
    let target: VisualPageProfile;
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.goto(url, { waitUntil: 'networkidle' });
      const profile = await page.evaluate(visualProfileScript) as Omit<VisualPageProfile, 'screenshot'>;
      target = { ...profile, screenshot: await page.screenshot(), fullPage: false };
    } finally { await browser.close(); }
    const result = await BrowserEngine.getInstance().compareCapturedReference(target!, url, path.join(root, 'visual'));
    expect(result.scores.overall).toBeGreaterThan(95);
    expect(fs.existsSync(result.artifacts.targetScreenshot)).toBe(true);
    expect(fs.existsSync(result.artifacts.localScreenshot)).toBe(true);
  }, 60000);
});
