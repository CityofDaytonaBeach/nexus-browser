import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const NEXUS_PORT = process.env.NEXUS_PORT || 3000;

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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 800,
    minHeight: 600,
    title: 'NexusBrowser Builder',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f7fbff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(process.cwd(), 'public', 'icon.png'),
  });

  await waitForServer(`http://localhost:${NEXUS_PORT}/health`).catch(() => undefined);
  mainWindow.loadURL(`http://localhost:${NEXUS_PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
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
