const { spawnSync } = require('child_process');
const path = require('path');

const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');

spawnSync(electronBin, [path.join(__dirname, '..', 'dist', 'ui', 'electron.js')], {
  stdio: 'inherit',
  env: { ...process.env, NEXUS_EXTERNAL_SERVER: 'true' },
});
