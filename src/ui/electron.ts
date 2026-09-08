import { app, BrowserWindow, BrowserWindowConstructorOptions, Menu, ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
const childWindows: Set<BrowserWindow> = new Set();

const NEXUS_PORT = process.env.NEXUS_PORT || 3000;
const NEXUS_ORIGIN = `http://127.0.0.1:${NEXUS_PORT}`;

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
    ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.js')
    : path.join(__dirname, '..', 'index.js');

  backendProcess = spawn(process.execPath, [backendEntry, '--api-only'], {
    env: { ...process.env, NEXUS_PORT: String(NEXUS_PORT) },
    stdio: 'ignore',
    windowsHide: true,
  });
}

function baseWindowOptions(): BrowserWindowConstructorOptions {
  return {
    backgroundColor: '#0f0f0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(process.cwd(), 'public', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  };
}

function createBrowserSurface(url: string, options: BrowserWindowConstructorOptions = {}): BrowserWindow {
  const win = new BrowserWindow({
    ...baseWindowOptions(),
    width: options.width || 1320,
    height: options.height || 860,
    minWidth: options.minWidth || 520,
    minHeight: options.minHeight || 420,
    title: options.title || 'Nexus Browser Tab',
    parent: options.parent,
    modal: options.modal,
    show: false,
  });

  childWindows.add(win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => childWindows.delete(win));
  wireBrowserWindow(win);
  win.loadURL(url);
  return win;
}

function classifyWindow(url: string): BrowserWindowConstructorOptions {
  if (url.includes('#chat')) return { width: 430, height: 720, minWidth: 360, minHeight: 520, title: 'Nexus Chat' };
  if (url.startsWith(`http://127.0.0.1:3002`) || url.startsWith(`http://localhost:3002`)) return { width: 1280, height: 860, minWidth: 760, minHeight: 560, title: 'Nexus IDE' };
  if (/^http:\/\/127\.0\.0\.1:5\d{3}/.test(url) || /^http:\/\/localhost:5\d{3}/.test(url)) return { width: 1280, height: 880, minWidth: 390, minHeight: 640, title: 'Generated App Preview' };
  return { width: 1320, height: 860, minWidth: 520, minHeight: 420, title: 'Nexus Browser Tab' };
}

function wireBrowserWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    createBrowserSurface(normalizeLocalUrl(url), classifyWindow(url));
    return { action: 'deny' };
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      event.preventDefault();
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['clipboard-read', 'clipboard-sanitized-write', 'media', 'geolocation', 'notifications'].includes(permission));
  });
}

function normalizeLocalUrl(url: string): string {
  return url.replace('http://localhost:', 'http://127.0.0.1:');
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    ...baseWindowOptions(),
    width: 1500,
    height: 940,
    minWidth: 800,
    minHeight: 600,
    title: 'Nexus Browser',
  });

  wireBrowserWindow(mainWindow);
  await waitForServer(`${NEXUS_ORIGIN}/health`).catch(() => undefined);
  mainWindow.loadURL(NEXUS_ORIGIN);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('ai.nexus.browser');
  Menu.setApplicationMenu(null);
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const win of childWindows) win.destroy();
  if (backendProcess) backendProcess.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
