const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');
const port = process.env.NEXUS_PORT || '3000';

function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://localhost:${port}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - started > timeoutMs) reject(new Error(`Backend health check failed: HTTP ${res.statusCode}`));
        else setTimeout(check, 500);
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

function isGpuFailure(output) {
  return /GPU process isn't usable|gpu_process_host.*GPU process exited unexpectedly|NEXUS_GPU_FAILURE/i.test(output);
}

async function runElectron(electronBin, { compatibilityMode = false, spawnProcess = spawn } = {}) {
  let softwareRendering = compatibilityMode || process.env.NEXUS_DISABLE_GPU === 'true';
  for (;;) {
    const args = softwareRendering ? ['--disable-gpu', '--disable-software-rasterizer'] : [];
    // This broad workaround is opt-in; automatic GPU recovery retains Chromium's sandbox.
    if (compatibilityMode) args.push('--no-sandbox');
    args.push(path.join(root, 'dist', 'ui', 'electron.js'));
    const result = await new Promise((resolve, reject) => {
      let output = '';
      const child = spawnProcess(electronBin, args, {
        cwd: root,
        env: { ...process.env, NEXUS_PORT: port, NEXUS_EXTERNAL_SERVER: 'true', NEXUS_MANAGED_LAUNCH: 'true', NEXUS_DISABLE_GPU: softwareRendering ? 'true' : 'false' },
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false,
      });
      child.stdout.on('data', (data) => process.stdout.write(data));
      child.stderr.on('data', (data) => {
        output = (output + data.toString()).slice(-16000);
        process.stderr.write(data);
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal, output }));
    });
    if (result.code !== 0 && !softwareRendering && isGpuFailure(result.output)) {
      console.error('Nexus: GPU startup failed; retrying once with software rendering (page sandbox remains enabled).');
      softwareRendering = true;
      continue;
    }
    if (result.code !== 0 && /NEXUS_RENDERER_LAUNCH_FAILED/.test(result.output)) {
      console.error('Nexus: Windows could not launch sandboxed page processes. Launch Nexus outside the restricted execution environment. --compat is an explicit workaround that disables the Chromium sandbox.');
    }
    return result.code ?? 1;
  }
}

async function main() {
  const log = fs.createWriteStream(path.join(root, 'nexus-desktop-backend.log'), { flags: 'a' });
  const backend = spawn(process.execPath, [path.join(root, 'dist', 'index.js'), '--api-only', `--port=${port}`], {
    cwd: root,
    env: { ...process.env, NEXUS_PORT: port },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backend.stdout.pipe(log);
  backend.stderr.pipe(log);

  backend.on('exit', (code) => {
    if (!log.writableEnded) log.write(`\nBackend exited with code ${code}\n`);
  });

  const stopBackend = () => {
    if (!backend.killed) backend.kill();
  };

  process.on('SIGINT', stopBackend);
  process.on('SIGTERM', stopBackend);
  try {
    await waitForServer();
    const electronBin = process.platform === 'win32'
      ? path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
      : path.join(root, 'node_modules', '.bin', 'electron');
    process.exitCode = await runElectron(electronBin, { compatibilityMode: process.argv.includes('--compat') });
  } finally {
    stopBackend();
    backend.stdout.unpipe(log);
    backend.stderr.unpipe(log);
    process.removeListener('SIGINT', stopBackend);
    process.removeListener('SIGTERM', stopBackend);
    log.end();
  }
}

module.exports = { runElectron, isGpuFailure };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
