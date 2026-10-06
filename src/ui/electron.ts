import {
  app,
  BrowserView,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  ipcMain,
  Menu,
  Session,
  WebContents,
} from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ActionResult, BrowserAction } from '../core/types';

interface BrowserTab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  consoleMessages: string[];
  networkMessages: Array<{ url: string; method: string; status?: number; error?: string }>;
  view: BrowserView;
}

interface BrowserCommand {
  type: 'navigate' | 'new-tab' | 'activate-tab' | 'close-tab' | 'back' | 'forward' | 'reload' | 'stop' | 'home' | 'toggle-agent' | 'open-devtools' | 'window-minimize' | 'window-maximize' | 'window-close' | 'responsive-toggle' | 'responsive-size';
  tabId?: string;
  value?: string;
  width?: number;
  height?: number;
}

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let agentView: BrowserView | null = null;
let activeTabId = '';
let agentVisible = true;
let responsive = { enabled: false, width: 390, height: 844, scale: 1 };
let contextTimer: NodeJS.Timeout | undefined;

const tabs = new Map<string, BrowserTab>();
const childWindows: Set<BrowserWindow> = new Set();
const configuredSessions = new WeakSet<Session>();
const agentControllerContents = new Set<number>();

const NEXUS_PORT = String(process.env.NEXUS_PORT || 3000);
const NEXUS_ORIGIN = `http://127.0.0.1:${NEXUS_PORT}`;
const CHROME_HEIGHT = 92;
const AGENT_PANEL_WIDTH = 420;
const PROFILE_ROOT = process.env.NEXUS_PROFILE_DIR || (app.isPackaged
  ? app.getPath('userData')
  : path.join(process.cwd(), '.nexus', 'electron-profile'));

app.setPath('userData', PROFILE_ROOT);
app.setPath('sessionData', path.join(PROFILE_ROOT, 'session'));
app.setPath('cache', path.join(PROFILE_ROOT, 'cache'));
app.commandLine.appendSwitch('disk-cache-dir', path.join(PROFILE_ROOT, 'cache'));
if (process.env.NEXUS_REMOTE_DEBUGGING_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.NEXUS_REMOTE_DEBUGGING_PORT);
if (process.env.NEXUS_DISABLE_GPU === 'true') app.disableHardwareAcceleration();

app.on('child-process-gone', (_event, details) => {
  if (details.type !== 'GPU' || details.reason === 'clean-exit' || details.reason === 'killed') return;
  console.error('NEXUS_GPU_FAILURE', JSON.stringify(details));
});
app.on('render-process-gone', (_event, _contents, details) => {
  if (details.reason === 'launch-failed' || details.reason === 'integrity-failure') {
    console.error('NEXUS_RENDERER_LAUNCH_FAILED', JSON.stringify(details));
  }
});

function appAsset(...parts: string[]): string {
  const root = app.isPackaged ? app.getAppPath() : process.cwd();
  return path.join(root, ...parts);
}

function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`Nexus backend did not start at ${url}`));
        else setTimeout(check, 500);
      });
      req.setTimeout(1500, () => req.destroy());
    };
    check();
  });
}

function startBackend(): void {
  if (process.env.NEXUS_EXTERNAL_SERVER === 'true') return;
  const backendEntry = app.isPackaged
    ? process.env.NEXUS_BACKEND_ENTRY || path.join(app.getAppPath(), 'dist', 'index.js')
    : path.join(__dirname, '..', 'index.js');

  backendProcess = spawn(process.execPath, [backendEntry, '--api-only', `--port=${NEXUS_PORT}`], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NEXUS_PORT },
    stdio: 'ignore',
    windowsHide: true,
  });
}

function secureWebPreferences() {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  };
}

function baseWindowOptions(): BrowserWindowConstructorOptions {
  return {
    backgroundColor: '#11120f',
    icon: appAsset('public', 'icon.png'),
    webPreferences: secureWebPreferences(),
  };
}

function configureSession(targetSession: Session): void {
  if (configuredSessions.has(targetSession)) return;
  configuredSessions.add(targetSession);
  targetSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['clipboard-read', 'clipboard-sanitized-write', 'media', 'geolocation', 'notifications'].includes(permission));
  });
  const record = (details: { webContentsId?: number; url: string; method: string; statusCode?: number; error?: string }) => {
    const tab = [...tabs.values()].find((item) => {
      const contents = item.view.webContents;
      return contents && !contents.isDestroyed() && contents.id === details.webContentsId;
    });
    if (!tab) return;
    let safeUrl = details.url;
    try { const parsed = new URL(details.url); safeUrl = `${parsed.origin}${parsed.pathname}`; } catch {}
    const error = details.error === 'net::OK' ? undefined : details.error;
    tab.networkMessages.push({ url: safeUrl, method: details.method, status: details.statusCode, error });
    tab.networkMessages = tab.networkMessages.slice(-60);
    if (tab.id === activeTabId && (error || (details.statusCode || 0) >= 400)) scheduleActiveTabContext();
  };
  targetSession.webRequest.onCompleted(record);
  targetSession.webRequest.onErrorOccurred(record);
}

function normalizeLocalUrl(url: string): string {
  return url.replace('http://localhost:', 'http://127.0.0.1:');
}

function resolveAddress(value: string): string {
  const input = value.trim();
  if (!input) return `${NEXUS_ORIGIN}/browser-home.html`;
  if (/^(https?|file):\/\//i.test(input) || input === 'about:blank') return normalizeLocalUrl(input);
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(input)) return `http://${input}`;
  if (/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/|$)/i.test(input)) return `https://${input}`;
  const searchBase = process.env.NEXUS_SEARCH_URL || 'https://www.google.com/search?q=';
  return `${searchBase}${encodeURIComponent(input)}`;
}

function createBrowserSurface(url: string, options: BrowserWindowConstructorOptions = {}): BrowserWindow {
  const isAgentSurface = url.includes('#chat');
  const win = new BrowserWindow({
    ...baseWindowOptions(),
    width: options.width || 1280,
    height: options.height || 860,
    minWidth: options.minWidth || 520,
    minHeight: options.minHeight || 420,
    title: options.title || 'Nexus Browser',
    parent: options.parent,
    modal: options.modal,
    show: false,
    webPreferences: {
      ...secureWebPreferences(),
      ...(isAgentSurface ? { preload: path.join(__dirname, 'agent-preload.js') } : {}),
    },
  });

  childWindows.add(win);
  const controllerContentsId = isAgentSurface ? win.webContents.id : undefined;
  if (controllerContentsId) agentControllerContents.add(controllerContentsId);
  configureSession(win.webContents.session);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    childWindows.delete(win);
    if (controllerContentsId) agentControllerContents.delete(controllerContentsId);
  });
  wireKeyboardShortcuts(win.webContents);
  win.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    createBrowserSurface(normalizeLocalUrl(nextUrl), classifyWindow(nextUrl));
    return { action: 'deny' };
  });
  void win.loadURL(normalizeLocalUrl(url));
  return win;
}

function classifyWindow(url: string): BrowserWindowConstructorOptions {
  if (url.includes('#chat')) return { width: 430, height: 720, minWidth: 360, minHeight: 520, title: 'Nexus Chat' };
  if (url.startsWith('http://127.0.0.1:3002') || url.startsWith('http://localhost:3002')) return { width: 1280, height: 860, minWidth: 760, minHeight: 560, title: 'Nexus IDE' };
  if (/^http:\/\/(?:127\.0\.0\.1|localhost):5\d{3}/.test(url)) return { width: 1280, height: 880, minWidth: 390, minHeight: 640, title: 'Generated App Preview' };
  return { width: 1280, height: 860, minWidth: 520, minHeight: 420, title: 'Nexus Browser' };
}

function activeTab(): BrowserTab | undefined {
  return tabs.get(activeTabId);
}

function tabState(tab: BrowserTab) {
  const contents = tab.view.webContents;
  return {
    id: tab.id,
    title: tab.title || 'New tab',
    url: tab.url,
    loading: tab.loading,
    canGoBack: !contents.isDestroyed() && contents.canGoBack(),
    canGoForward: !contents.isDestroyed() && contents.canGoForward(),
  };
}

function publishState(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('nexus-browser:state', {
    tabs: Array.from(tabs.values()).map(tabState),
    activeTabId,
    agentVisible,
    responsive,
    maximized: mainWindow.isMaximized(),
  });
}

function layoutViews(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [width, height] = mainWindow.getContentSize();
  const panelWidth = agentVisible ? Math.min(AGENT_PANEL_WIDTH, Math.max(360, width - 360)) : 0;
  const pageWidth = Math.max(0, width - panelWidth);
  const chromeHeight = CHROME_HEIGHT + (responsive.enabled ? 52 : 0);
  const pageHeight = Math.max(0, height - chromeHeight);
  const tab = activeTab();

  if (tab && !tab.view.webContents.isDestroyed()) {
    tab.view.setAutoResize({ width: false, height: false });
    if (responsive.enabled) {
      responsive.scale = Math.min(1, Math.max(1, pageWidth - 32) / responsive.width, Math.max(1, pageHeight - 24) / responsive.height);
      const fittedWidth = Math.max(1, Math.floor(responsive.width * responsive.scale));
      const fittedHeight = Math.max(1, Math.floor(responsive.height * responsive.scale));
      tab.view.setBounds({ x: Math.max(0, Math.floor((pageWidth - fittedWidth) / 2)), y: chromeHeight + 12, width: fittedWidth, height: fittedHeight });
      tab.view.webContents.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: { width: responsive.width, height: responsive.height }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 1, viewSize: { width: responsive.width, height: responsive.height }, scale: responsive.scale });
    } else {
      tab.view.webContents.disableDeviceEmulation();
      tab.view.setBounds({ x: 0, y: chromeHeight, width: pageWidth, height: pageHeight });
    }
  }
  if (agentView && agentVisible && !agentView.webContents.isDestroyed()) {
    agentView.setBounds({ x: pageWidth, y: chromeHeight, width: panelWidth, height: pageHeight });
    agentView.setAutoResize({ width: false, height: false });
  }
}

function attachActiveViews(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  for (const view of mainWindow.getBrowserViews()) mainWindow.removeBrowserView(view);
  const tab = activeTab();
  if (tab && !tab.view.webContents.isDestroyed()) mainWindow.addBrowserView(tab.view);
  if (agentView && agentVisible && !agentView.webContents.isDestroyed()) mainWindow.addBrowserView(agentView);
  layoutViews();
  publishState();
}

function updateTabFromContents(tab: BrowserTab): void {
  if (tab.view.webContents.isDestroyed()) return;
  tab.url = normalizeLocalUrl(tab.view.webContents.getURL() || tab.url);
  tab.title = tab.view.webContents.getTitle() || tab.title || 'New tab';
  tab.loading = tab.view.webContents.isLoading();
  publishState();
}

function scheduleActiveTabContext(): void {
  if (contextTimer) clearTimeout(contextTimer);
  contextTimer = setTimeout(() => void pushActiveTabContext(), 250);
}

async function pushActiveTabContext(): Promise<void> {
  const tab = activeTab();
  if (!tab || !agentView || tab.view.webContents.isDestroyed() || agentView.webContents.isDestroyed()) return;
  if (!agentView.webContents.getURL().startsWith(NEXUS_ORIGIN)) return;
  try {
    const page = await tab.view.webContents.executeJavaScript(`(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const text = document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 12000) : '';
      const links = Array.from(document.querySelectorAll('a[href]')).filter(visible).slice(0, 40).map((element) => ({
        text: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 160),
        href: element.href,
      }));
      const controls = Array.from(document.querySelectorAll('button,input,select,textarea,[role="button"]')).filter(visible).slice(0, 50).map((element) => ({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || element.getAttribute('role') || '',
        label: (element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.innerText || '').trim().slice(0, 160),
      }));
      const frameworks = [
        window.React ? 'React' : '',
        window.__NEXT_DATA__ ? 'Next.js' : '',
        window.Vue ? 'Vue' : '',
        document.querySelector('[data-reactroot],#__next,#root') ? 'component-root' : '',
      ].filter(Boolean);
      return { title: document.title, url: location.href, text, links, controls, frameworks };
    })()`, true);
    if (tab.id !== activeTabId) return;
    const context = [
      'Nexus native Chromium tab evidence:',
      `Rendered page: ${page.title || tab.title} - ${page.url || tab.url}`,
      `Framework signals: ${page.frameworks.join(', ') || 'none detected'}`,
      `Visible controls: ${JSON.stringify(page.controls)}`,
      `Visible links: ${JSON.stringify(page.links)}`,
      `Recent console: ${tab.consoleMessages.join(' | ') || 'none captured'}`,
      `Recent network: ${JSON.stringify(tab.networkMessages)}`,
      `Visible text: ${page.text || 'none'}`,
    ].join('\n');
    const payload = { type: 'nexus-native-tab-context', tabId: tab.id, title: page.title || tab.title, url: page.url || tab.url, context };
    await agentView.webContents.executeJavaScript(`window.postMessage(${JSON.stringify(payload)}, location.origin)`, true);
  } catch {
    // Browser-internal and restricted pages may not expose a document. Navigation still works.
  }
}

function wireKeyboardShortcuts(contents: WebContents): void {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const modifier = input.control || input.meta;
    const key = input.key.toLowerCase();
    if (modifier && key === 'l') {
      event.preventDefault();
      mainWindow?.webContents.send('nexus-browser:focus-address');
    } else if (modifier && key === 't') {
      event.preventDefault();
      createTab();
    } else if (modifier && key === 'w') {
      event.preventDefault();
      closeTab(activeTabId);
    } else if (modifier && key === 'r') {
      event.preventDefault();
      activeTab()?.view.webContents.reload();
    } else if (modifier && input.shift && key === 'a') {
      event.preventDefault();
      toggleAgentPanel();
    } else if (input.alt && key === 'left') {
      event.preventDefault();
      const current = activeTab()?.view.webContents;
      if (current?.canGoBack()) current.goBack();
    } else if (input.alt && key === 'right') {
      event.preventDefault();
      const current = activeTab()?.view.webContents;
      if (current?.canGoForward()) current.goForward();
    } else if (input.key === 'F12' || (modifier && input.shift && key === 'i')) {
      event.preventDefault();
      activeTab()?.view.webContents.openDevTools({ mode: 'detach' });
    }
  });
}

function wireTab(tab: BrowserTab): void {
  const contents = tab.view.webContents;
  configureSession(contents.session);
  wireKeyboardShortcuts(contents);
  contents.setUserAgent(`${contents.getUserAgent().replace(/\sElectron\/\S+/i, '')} NexusBrowser/${app.getVersion()}`);
  contents.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: 'deny' };
  });
  contents.on('did-start-loading', () => {
    tab.loading = true;
    updateTabFromContents(tab);
  });
  contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) { tab.consoleMessages = []; tab.networkMessages = []; }
  });
  contents.on('did-stop-loading', () => {
    tab.loading = false;
    updateTabFromContents(tab);
    scheduleActiveTabContext();
  });
  contents.on('did-navigate', () => updateTabFromContents(tab));
  contents.on('did-navigate-in-page', () => updateTabFromContents(tab));
  contents.on('page-title-updated', (_event, title) => {
    tab.title = title;
    publishState();
  });
  contents.on('console-message', (_event, _level, message, line, sourceId) => {
    tab.consoleMessages.push(`${message} (${sourceId || 'page'}:${line || 0})`);
    tab.consoleMessages = tab.consoleMessages.slice(-12);
    if (tab.id === activeTabId) scheduleActiveTabContext();
  });
  contents.on('did-fail-load', (_event, code, description, validatedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    tab.title = `Could not load: ${description}`;
    tab.url = validatedUrl || tab.url;
    tab.loading = false;
    publishState();
  });
}

function createTab(value = `${NEXUS_ORIGIN}/browser-home.html`): BrowserTab {
  const view = new BrowserView({ webPreferences: secureWebPreferences() });
  view.setBackgroundColor('#f4f4ee');
  const tab: BrowserTab = {
    id: randomUUID(),
    title: 'New tab',
    url: resolveAddress(value),
    loading: true,
    consoleMessages: [],
    networkMessages: [],
    view,
  };
  tabs.set(tab.id, tab);
  wireTab(tab);
  activeTabId = tab.id;
  attachActiveViews();
  void view.webContents.loadURL(tab.url);
  return tab;
}

function activateTab(tabId: string): void {
  if (!tabs.has(tabId)) return;
  activeTabId = tabId;
  attachActiveViews();
  scheduleActiveTabContext();
}

function closeTab(tabId: string): void {
  const tab = tabs.get(tabId);
  if (!tab) return;
  const ids = Array.from(tabs.keys());
  const closedIndex = ids.indexOf(tabId);
  tabs.delete(tabId);
  if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
  if (activeTabId === tabId) {
    const nextId = ids[closedIndex + 1] || ids[closedIndex - 1] || '';
    activeTabId = tabs.has(nextId) ? nextId : '';
  }
  if (!tabs.size) createTab();
  else attachActiveViews();
}

function navigateActive(value: string): void {
  const tab = activeTab();
  if (!tab) return;
  const url = resolveAddress(value);
  tab.url = url;
  tab.loading = true;
  publishState();
  void tab.view.webContents.loadURL(url);
}

function elementTargetScript(selector: string): string {
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    if (selector.startsWith('text=')) {
      const text = selector.slice(5).trim().toLowerCase();
      return Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[tabindex]'))
        .find((element) => {
          const value = (element.innerText || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.value || '').trim().toLowerCase();
          return value === text || value.includes(text);
        }) || null;
    }
    try { return document.querySelector(selector); } catch { return null; }
  })()`;
}

async function waitForPageToSettle(contents: WebContents, timeoutMs = 10000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 75));
  if (contents.isDestroyed() || !contents.isLoading()) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      contents.removeListener('did-stop-loading', done);
      resolve();
    }
    contents.once('did-stop-loading', done);
    if (!contents.isLoading()) done();
  });
}

async function nativePageResult(tab: BrowserTab, started: number, data: any): Promise<ActionResult> {
  const contents = tab.view.webContents;
  let content = '';
  try {
    content = await contents.executeJavaScript('document.documentElement?.outerHTML || ""', true);
  } catch {}
  return {
    success: true,
    nativeEvidence: { console: tab.consoleMessages, network: tab.networkMessages },
    data,
    page: {
      id: tab.id,
      url: normalizeLocalUrl(contents.getURL() || tab.url),
      title: contents.getTitle() || tab.title || 'New tab',
      content: String(content || '').slice(0, 160000),
      timestamp: Date.now(),
    },
    duration: Date.now() - started,
  };
}

async function executeActiveAction(action: BrowserAction): Promise<ActionResult> {
  const started = Date.now();
  const tab = activeTab();
  if (!tab || tab.view.webContents.isDestroyed()) return { success: false, error: 'No active native browser tab', duration: 0 };
  const contents = tab.view.webContents;

  try {
    let data: any;
    switch (action.type) {
      case 'navigate':
        if (!action.url) throw new Error('A URL is required');
        await contents.loadURL(resolveAddress(action.url));
        data = { url: contents.getURL() };
        break;
      case 'back':
        if (contents.canGoBack()) contents.goBack();
        await waitForPageToSettle(contents);
        data = { url: contents.getURL() };
        break;
      case 'forward':
        if (contents.canGoForward()) contents.goForward();
        await waitForPageToSettle(contents);
        data = { url: contents.getURL() };
        break;
      case 'reload':
        contents.reload();
        await waitForPageToSettle(contents);
        data = { url: contents.getURL() };
        break;
      case 'click':
        if (action.coordinates) {
          const { x, y } = action.coordinates;
          contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
          contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        } else {
          if (!action.selector) throw new Error('A selector or coordinates are required');
          data = await contents.executeJavaScript(`(() => {
            const element = ${elementTargetScript(action.selector)};
            if (!element) throw new Error('Element not found: ' + ${JSON.stringify(action.selector)});
            element.scrollIntoView({ block: 'center', inline: 'center' });
            element.click();
            return { clicked: true, tag: element.tagName.toLowerCase(), text: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 160) };
          })()`, true);
        }
        await waitForPageToSettle(contents);
        data ||= { clicked: true };
        break;
      case 'type': {
        const selector = action.selector || 'input:focus,textarea:focus,[contenteditable="true"]:focus';
        const value = action.value || '';
        if (action.coordinates) {
          const { x, y } = action.coordinates;
          contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
          contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        }
        data = await contents.executeJavaScript(`(() => {
          const element = ${elementTargetScript(selector)};
          if (!element) throw new Error('Input not found: ' + ${JSON.stringify(selector)});
          element.focus();
          const value = ${JSON.stringify(value)};
          if (element.isContentEditable) element.textContent = value;
          else {
            const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
            if (descriptor?.set) descriptor.set.call(element, value);
            else element.value = value;
          }
          element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { typed: true, length: value.length };
        })()`, true);
        break;
      }
      case 'select':
        if (!action.selector) throw new Error('A selector is required');
        data = await contents.executeJavaScript(`(() => {
          const element = ${elementTargetScript(action.selector)};
          if (!(element instanceof HTMLSelectElement)) throw new Error('Select not found: ' + ${JSON.stringify(action.selector)});
          element.value = ${JSON.stringify(action.value || '')};
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { selected: true, value: element.value };
        })()`, true);
        break;
      case 'hover':
        if (!action.selector) throw new Error('A selector is required');
        data = await contents.executeJavaScript(`(() => {
          const element = ${elementTargetScript(action.selector)};
          if (!element) throw new Error('Element not found: ' + ${JSON.stringify(action.selector)});
          element.scrollIntoView({ block: 'center', inline: 'center' });
          const rect = element.getBoundingClientRect();
          return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
        })()`, true);
        contents.sendInputEvent({ type: 'mouseMove', x: data.x, y: data.y });
        data = { hovered: true, ...data };
        break;
      case 'press': {
        const keyCode = action.value || 'Enter';
        contents.sendInputEvent({ type: 'keyDown', keyCode });
        contents.sendInputEvent({ type: 'keyUp', keyCode });
        await waitForPageToSettle(contents);
        data = { pressed: keyCode };
        break;
      }
      case 'scroll': {
        const x = action.coordinates?.x || 0;
        const y = action.coordinates?.y || 300;
        data = await contents.executeJavaScript(`(() => { window.scrollBy(${x}, ${y}); return { x: scrollX, y: scrollY }; })()`, true);
        break;
      }
      case 'drag': {
        const [startX, startY, endX, endY] = (action.value || '0,0,100,100').split(',').map(Number);
        contents.sendInputEvent({ type: 'mouseMove', x: startX, y: startY });
        contents.sendInputEvent({ type: 'mouseDown', x: startX, y: startY, button: 'left', clickCount: 1 });
        contents.sendInputEvent({ type: 'mouseMove', x: endX, y: endY, button: 'left' });
        contents.sendInputEvent({ type: 'mouseUp', x: endX, y: endY, button: 'left', clickCount: 1 });
        data = { dragged: true };
        break;
      }
      case 'screenshot': {
        const image = await contents.capturePage();
        data = { screenshot: image.toPNG().toString('base64') };
        break;
      }
      case 'pdf': {
        const pdf = await contents.printToPDF({ printBackground: true, pageSize: 'A4' });
        data = { pdf: pdf.toString('base64') };
        break;
      }
      case 'evaluate':
        data = await contents.executeJavaScript(action.script || 'undefined', true);
        break;
      case 'wait': {
        const timeout = Math.max(0, Math.min(Number(action.options?.timeout || 1000), 120000));
        await new Promise((resolve) => setTimeout(resolve, timeout));
        data = { waited: timeout };
        break;
      }
      default:
        return { success: false, error: `Unknown native action: ${(action as BrowserAction).type}`, duration: Date.now() - started };
    }
    updateTabFromContents(tab);
    if (!['evaluate', 'screenshot', 'wait'].includes(action.type)) scheduleActiveTabContext();
    return await nativePageResult(tab, started, data);
  } catch (error: any) {
    return { success: false, error: error?.message || String(error), duration: Date.now() - started };
  }
}

function toggleAgentPanel(): void {
  agentVisible = !agentVisible;
  attachActiveViews();
}

function createAgentView(): void {
  if (!mainWindow) return;
  agentView = new BrowserView({
    webPreferences: {
      ...secureWebPreferences(),
      preload: path.join(__dirname, 'agent-preload.js'),
    },
  });
  const agentContentsId = agentView.webContents.id;
  agentControllerContents.add(agentContentsId);
  agentView.setBackgroundColor('#f7f7f2');
  configureSession(agentView.webContents.session);
  wireKeyboardShortcuts(agentView.webContents);
  agentView.webContents.setWindowOpenHandler(({ url }) => {
    const normalized = normalizeLocalUrl(url);
    if (normalized.includes('#chat')) createBrowserSurface(normalized, classifyWindow(normalized));
    else createTab(normalized);
    return { action: 'deny' };
  });
  agentView.webContents.on('did-finish-load', scheduleActiveTabContext);
  agentView.webContents.on('destroyed', () => agentControllerContents.delete(agentContentsId));
  void agentView.webContents.loadURL(`${NEXUS_ORIGIN}/#chat`);
}

async function executeCommand(command: BrowserCommand): Promise<void> {
  const tab = command.tabId ? tabs.get(command.tabId) : activeTab();
  switch (command.type) {
    case 'responsive-toggle':
      responsive.enabled = !responsive.enabled;
      layoutViews();
      scheduleActiveTabContext();
      break;
    case 'responsive-size': {
      const width = Number(command.width), height = Number(command.height);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 240 || width > 3840 || height < 240 || height > 3840) throw new Error('Screen dimensions must be whole numbers between 240 and 3840');
      responsive = { ...responsive, enabled: true, width, height };
      layoutViews();
      scheduleActiveTabContext();
      break;
    }
    case 'navigate': navigateActive(command.value || ''); break;
    case 'new-tab': createTab(command.value); break;
    case 'activate-tab': if (command.tabId) activateTab(command.tabId); break;
    case 'close-tab': if (command.tabId) closeTab(command.tabId); break;
    case 'back': if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack(); break;
    case 'forward': if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward(); break;
    case 'reload': tab?.view.webContents.reload(); break;
    case 'stop': tab?.view.webContents.stop(); break;
    case 'home': navigateActive(`${NEXUS_ORIGIN}/browser-home.html`); break;
    case 'toggle-agent': toggleAgentPanel(); break;
    case 'open-devtools': tab?.view.webContents.openDevTools({ mode: 'detach' }); break;
    case 'window-minimize': mainWindow?.minimize(); break;
    case 'window-maximize':
      if (mainWindow?.isMaximized()) mainWindow.unmaximize();
      else mainWindow?.maximize();
      break;
    case 'window-close': mainWindow?.close(); break;
  }
  publishState();
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    ...baseWindowOptions(),
    width: 1500,
    height: 940,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    show: false,
    title: 'Nexus Browser',
    webPreferences: {
      ...secureWebPreferences(),
      preload: path.join(__dirname, 'browser-preload.js'),
    },
  });

  configureSession(mainWindow.webContents.session);
  wireKeyboardShortcuts(mainWindow.webContents);
  mainWindow.on('resize', () => { layoutViews(); publishState(); });
  mainWindow.on('maximize', publishState);
  mainWindow.on('unmaximize', publishState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.once('did-finish-load', publishState);

  await waitForServer(`${NEXUS_ORIGIN}/health`);
  await mainWindow.loadFile(appAsset('public', 'browser-shell.html'));
  createAgentView();
  createTab(process.env.NEXUS_START_URL || `${NEXUS_ORIGIN}/browser-home.html`);
  mainWindow.show();
}

ipcMain.handle('nexus-browser:get-state', () => ({
  tabs: Array.from(tabs.values()).map(tabState),
  activeTabId,
  agentVisible,
  responsive,
  maximized: mainWindow?.isMaximized() || false,
}));
ipcMain.handle('nexus-browser:command', (_event, command: BrowserCommand) => executeCommand(command));
ipcMain.handle('nexus-browser:get-active-state', (event) => {
  if (!agentControllerContents.has(event.sender.id)) throw new Error('Native browser control is only available to Nexus Chat');
  const tab = activeTab();
  return tab ? { available: true, tab: tabState(tab) } : { available: false };
});
ipcMain.handle('nexus-browser:active-action', (event, action: BrowserAction) => {
  if (!agentControllerContents.has(event.sender.id)) throw new Error('Native browser control is only available to Nexus Chat');
  return executeActiveAction(action);
});

function startupFailed(error: unknown): void {
  console.error('Nexus startup failed:', error);
  if (backendProcess) backendProcess.kill();
  app.exit(1);
}

app.whenReady().then(async () => {
  app.setAppUserModelId('ai.nexus.browser');
  Menu.setApplicationMenu(null);
  startBackend();
  await createWindow();
}).catch(startupFailed);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  const closingTabs = [...tabs.values()];
  tabs.clear();
  for (const tab of closingTabs) {
    const contents = tab.view.webContents;
    if (contents && !contents.isDestroyed()) contents.close();
  }
  if (agentView && !agentView.webContents.isDestroyed()) agentView.webContents.close();
  for (const win of childWindows) win.destroy();
  if (backendProcess) backendProcess.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow().catch(startupFailed);
});
