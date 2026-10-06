const { runElectron } = require('./desktop');
const path = require('path');

const root = path.join(__dirname, '..');
const electronBin = process.platform === 'win32'
  ? path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(root, 'node_modules', '.bin', 'electron');

runElectron(electronBin, { compatibilityMode: process.argv.includes('--compat') })
  .then((code) => { process.exitCode = code; })
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
