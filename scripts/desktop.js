const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');
const port = process.env.NEXUS_PORT || '3000';
const logPath = path.join(root, 'nexus-desktop-backend.log');
const log = fs.createWriteStream(logPath, { flags: 'a' });

function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://localhost:${port}/health`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error(`Backend did not start on port ${port}`));
        else setTimeout(check, 500);
      });
      req.setTimeout(1500, () => req.destroy());
    };
    check();
  });
}

async function main() {
  const backend = spawn(process.execPath, [path.join(root, 'dist', 'index.js'), '--api-only'], {
    cwd: root,
    env: { ...process.env, NEXUS_PORT: port },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backend.stdout.pipe(log);
  backend.stderr.pipe(log);

  backend.on('exit', (code) => {
    log.write(`\nBackend exited with code ${code}\n`);
  });

  await waitForServer();

  const electronBin = process.platform === 'win32'
    ? path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(root, 'node_modules', '.bin', 'electron');
  const electron = spawn(electronBin, [path.join(root, 'dist', 'ui', 'electron.js')], {
    cwd: root,
    env: { ...process.env, NEXUS_PORT: port, NEXUS_EXTERNAL_SERVER: 'true' },
    stdio: 'inherit',
    shell: false,
  });

  const stopBackend = () => {
    if (!backend.killed) backend.kill();
  };

  electron.on('exit', (code) => {
    stopBackend();
    process.exit(code || 0);
  });
  process.on('SIGINT', stopBackend);
  process.on('SIGTERM', stopBackend);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
