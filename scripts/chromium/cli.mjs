import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptRoot, '..', '..');
const sourceRoot = path.join(repoRoot, '.chromium-source');
const depotToolsRoot = path.join(sourceRoot, 'depot_tools');
const devToolsRoot = path.join(sourceRoot, 'devtools-frontend');
const chromiumCheckoutRoot = path.join(sourceRoot, 'chromium-checkout');
const chromiumRoot = path.join(chromiumCheckoutRoot, 'src');
const isWindows = process.platform === 'win32';

function fail(message) {
  throw new Error(message);
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      continue;
    }
    const separator = argument.indexOf('=');
    if (separator !== -1) {
      options[argument.slice(2, separator)] = argument.slice(separator + 1);
    } else if (args[index + 1] && !args[index + 1].startsWith('--')) {
      options[argument.slice(2)] = args[index + 1];
      index += 1;
    } else {
      options[argument.slice(2)] = true;
    }
  }
  return options;
}

function sourceEnvironment() {
  const pathEntries = [depotToolsRoot];
  const nestedDepotTools = path.join(devToolsRoot, 'third_party', 'depot_tools');
  if (fs.existsSync(nestedDepotTools)) {
    pathEntries.push(nestedDepotTools);
  }
  const environment = {
    ...process.env,
    PATH: [...pathEntries, process.env.PATH ?? ''].join(path.delimiter),
    VPYTHON_VIRTUALENV_ROOT: path.join(sourceRoot, 'vpython'),
    DEPOT_TOOLS_WIN_TOOLCHAIN: '0',
  };
  if (isWindows) {
    environment.GIT_CONFIG_COUNT = '1';
    environment.GIT_CONFIG_KEY_0 = 'http.sslBackend';
    environment.GIT_CONFIG_VALUE_0 = 'openssl';
  }
  return environment;
}

function spawnResult(command, args = [], options = {}) {
  const needsShell = isWindows && /\.(?:bat|cmd)$/i.test(command);
  return spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? sourceEnvironment(),
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? 'pipe',
    shell: needsShell,
    windowsHide: true,
  });
}

function run(command, args = [], options = {}) {
  const result = spawnResult(command, args, {...options, stdio: 'inherit'});
  if (result.error) {
    fail(`Unable to start ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} exited with code ${result.status}.`);
  }
}

function capture(command, args = [], options = {}) {
  const result = spawnResult(command, args, options);
  if (result.error || result.status !== 0) {
    return '';
  }
  return String(result.stdout ?? '').trim();
}

function commandExists(command, args = ['--version']) {
  const result = spawnResult(command, args);
  return !result.error && result.status === 0;
}

function depotTool(name) {
  return path.join(depotToolsRoot, `${name}${isWindows ? '.bat' : ''}`);
}

function readManifest() {
  const manifestPath = path.join(repoRoot, 'chromium-fork', 'fork-manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function gitOutput(repository, args) {
  return capture('git', ['-C', repository, ...args]);
}

function setPinnedRevision(repository, revision, label) {
  if (!revision) {
    return;
  }
  const currentRevision = gitOutput(repository, ['rev-parse', 'HEAD']);
  if (currentRevision === revision) {
    return;
  }
  if (gitOutput(repository, ['status', '--porcelain'])) {
    fail(`${label} has local changes and cannot move from ${currentRevision} to ${revision}. Preserve or discard those changes explicitly, then rerun bootstrap.`);
  }
  const sslArgs = isWindows ? ['-c', 'http.sslBackend=openssl'] : [];
  run('git', ['-C', repository, ...sslArgs, 'fetch', '--depth', '1', 'origin', revision]);
  run('git', ['-C', repository, 'checkout', '--detach', revision]);
}

function freeDiskGb() {
  try {
    const stats = fs.statfsSync(repoRoot);
    return Math.round((stats.bavail * stats.bsize / 1024 ** 3) * 10) / 10;
  } catch {
    return null;
  }
}

function doctor(options) {
  const checks = [];
  const add = (name, ready, details, required = true) => checks.push({name, ready, details, required});
  const supported = ['win32', 'darwin', 'linux'].includes(process.platform);
  add('Desktop OS', supported, `${os.type()} ${os.release()} (${process.arch})`);
  add('Source path', !repoRoot.includes(' '), repoRoot.includes(' ') ? 'Chromium checkout paths cannot contain spaces' : repoRoot);

  const disk = freeDiskGb();
  add('Free disk', disk === null || disk >= 100, disk === null ? 'Unable to determine; Chromium requires at least 100 GB' : `${disk} GB available; Chromium requires at least 100 GB`);
  add('Git', commandExists('git'), capture('git', ['--version']) || 'git was not found');
  add('Node.js', true, process.version, false);

  if (process.platform === 'win32') {
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const vswhere = path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
    const visualStudio = fs.existsSync(vswhere) ? capture(vswhere, [
      '-latest', '-products', '*', '-version', '[18.0,19.0)',
      '-requires', 'Microsoft.VisualStudio.Workload.NativeDesktop', '-property', 'installationPath',
    ]) : '';
    add('Visual Studio 2026', Boolean(visualStudio), visualStudio || '18.0+ with Desktop C++ and ATL/MFC is required');

    const sdkRoot = path.join(programFilesX86, 'Windows Kits', '10');
    const includeRoot = path.join(sdkRoot, 'Include');
    const sdk = fs.existsSync(includeRoot) ? fs.readdirSync(includeRoot).find(name => name.startsWith('10.0.28000.')) : '';
    add('Windows 11 SDK', Boolean(sdk), sdk || '10.0.28000.x is required');
    const debuggerPath = path.join(sdkRoot, 'Debuggers', 'x64', 'cdb.exe');
    add('Debugging Tools', fs.existsSync(debuggerPath), fs.existsSync(debuggerPath) ? debuggerPath : 'Windows SDK Debugging Tools are required');
  } else if (process.platform === 'darwin') {
    const developerRoot = capture('xcode-select', ['-p']);
    add('Xcode tools', Boolean(developerRoot), developerRoot || 'Install the current Xcode and command-line tools');
    const sdkRoot = developerRoot ? path.join(developerRoot, 'Platforms', 'MacOSX.platform', 'Developer', 'SDKs') : '';
    const sdks = sdkRoot && fs.existsSync(sdkRoot) ? fs.readdirSync(sdkRoot).filter(name => name.startsWith('MacOSX')) : [];
    add('macOS SDK', sdks.length > 0, sdks.join(', ') || 'No macOS SDK was found');
  } else if (process.platform === 'linux') {
    const pythonVersion = capture('python3', ['--version']);
    const match = pythonVersion.match(/Python (\d+)\.(\d+)/);
    const pythonReady = Boolean(match) && (Number(match[1]) > 3 || Number(match[2]) >= 9);
    add('Python 3.9+', pythonReady, pythonVersion || 'python3 was not found');
    add('Linux host', process.arch === 'x64', process.arch === 'x64' ? 'x86-64 host ready' : 'The default Chromium Linux workflow targets x86-64');
  }

  add('depot_tools checkout', fs.existsSync(path.join(depotToolsRoot, '.git')), depotToolsRoot, false);
  add('DevTools source', fs.existsSync(path.join(devToolsRoot, '.git')), devToolsRoot, false);
  add('Chromium source', fs.existsSync(path.join(chromiumRoot, '.git')), chromiumRoot, false);

  const width = Math.max(...checks.map(check => check.name.length), 5);
  for (const check of checks) {
    const status = check.ready ? 'ready' : check.required ? 'missing' : 'optional';
    console.log(`${check.name.padEnd(width)}  ${status.padEnd(8)}  ${check.details}`);
  }
  if (options.strict && checks.some(check => check.required && !check.ready)) {
    process.exitCode = 1;
  }
}

function bootstrap(options) {
  const target = String(options.target ?? 'DevTools').toLowerCase();
  if (!['devtools', 'chromium', 'all'].includes(target)) {
    fail('--target must be DevTools, Chromium, or All.');
  }
  const manifest = readManifest();
  fs.mkdirSync(sourceRoot, {recursive: true});

  if (!fs.existsSync(path.join(depotToolsRoot, '.git'))) {
    const sslArgs = isWindows ? ['-c', 'http.sslBackend=openssl'] : [];
    run('git', [...sslArgs, 'clone', '--depth', '1', manifest.upstream.depotTools.url, depotToolsRoot]);
  }
  setPinnedRevision(depotToolsRoot, manifest.upstream.depotTools.revision, 'depot_tools');
  if (isWindows) {
    run('git', ['-C', depotToolsRoot, 'config', 'http.sslBackend', 'openssl']);
  }

  const historyArgs = options.history ? [] : ['--no-history'];
  if (target === 'devtools' || target === 'all') {
    if (!fs.existsSync(path.join(devToolsRoot, '.git'))) {
      run(depotTool('fetch'), [...historyArgs, 'devtools-frontend'], {cwd: sourceRoot});
    }
    setPinnedRevision(devToolsRoot, manifest.upstream.devtoolsFrontend.revision, 'DevTools frontend');
    run(depotTool('gclient'), ['sync', ...historyArgs], {cwd: sourceRoot});
  }

  if (target === 'chromium' || target === 'all') {
    fs.mkdirSync(chromiumCheckoutRoot, {recursive: true});
    if (!fs.existsSync(path.join(chromiumRoot, '.git'))) {
      const hookArgs = process.platform === 'linux' ? ['--nohooks'] : [];
      run(depotTool('fetch'), [...historyArgs, ...hookArgs, '--force', 'chromium'], {cwd: chromiumCheckoutRoot});
    }
    if (manifest.upstream.chromium.revision) {
      setPinnedRevision(chromiumRoot, manifest.upstream.chromium.revision, 'Chromium');
    }
    if (process.platform === 'linux') {
      const depsScript = path.join(chromiumRoot, 'build', 'install-build-deps.sh');
      if (!options['skip-system-deps']) {
        run('bash', [depsScript], {cwd: chromiumRoot});
      }
      run(depotTool('gclient'), ['runhooks'], {cwd: chromiumRoot});
    } else {
      run(depotTool('gclient'), ['sync', ...historyArgs], {cwd: chromiumCheckoutRoot});
    }
  }
  console.log(`Source bootstrap complete for ${target}.`);
}

function addAfterAnchor(filePath, anchor, insertion, needle) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (text.includes(needle)) {
    return;
  }
  if (!text.includes(anchor)) {
    fail(`Upstream anchor was not found in ${filePath}. Rebase the Nexus overlay for this revision.`);
  }
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(filePath, text.replace(anchor, `${anchor}${newline}${insertion}`), 'utf8');
}

function applyOverlays(options) {
  const destinationRoot = path.resolve(options['devtools-root'] ?? devToolsRoot);
  if (!fs.existsSync(path.join(destinationRoot, '.git'))) {
    fail(`DevTools source was not found at ${destinationRoot}. Run npm run chromium:bootstrap:devtools first.`);
  }
  const overlayRoot = path.join(repoRoot, 'chromium-fork', 'overlays', 'devtools', 'front_end', 'panels', 'nexus');
  const panelRoot = path.join(destinationRoot, 'front_end', 'panels', 'nexus');
  fs.mkdirSync(panelRoot, {recursive: true});
  for (const entry of fs.readdirSync(overlayRoot, {withFileTypes: true})) {
    fs.cpSync(path.join(overlayRoot, entry.name), path.join(panelRoot, entry.name), {recursive: true, force: true});
  }

  addAfterAnchor(
    path.join(destinationRoot, 'front_end', 'entrypoints', 'devtools_app', 'devtools_app.ts'),
    "import '../../panels/network/network-meta.js';",
    "import '../../panels/nexus/nexus-meta.js';",
    '../../panels/nexus/nexus-meta.js',
  );
  addAfterAnchor(
    path.join(destinationRoot, 'front_end', 'entrypoints', 'devtools_app', 'BUILD.gn'),
    '    "../../panels/mobile_throttling:meta",',
    '    "../../panels/nexus:meta",',
    '../../panels/nexus:meta',
  );
  const resources = path.join(destinationRoot, 'config', 'gni', 'devtools_grd_files.gni');
  addAfterAnchor(
    resources,
    '  "front_end/panels/mobile_throttling/mobile_throttling.js",',
    '  "front_end/panels/nexus/nexus-meta.js",\n  "front_end/panels/nexus/nexus.js",',
    'front_end/panels/nexus/nexus-meta.js',
  );
  addAfterAnchor(
    resources,
    '  "front_end/panels/mobile_throttling/throttlingSettingsTab.css.js",',
    '  "front_end/panels/nexus/NexusPanel.js",\n  "front_end/panels/nexus/nexusPanel.css.js",',
    'front_end/panels/nexus/NexusPanel.js',
  );
  console.log(`Applied the Nexus DevTools source overlay to ${destinationRoot}.`);
}

function devToolsBuildTools() {
  if (process.platform === 'win32') {
    return {
      gn: path.join(devToolsRoot, 'buildtools', 'win', 'gn.exe'),
      ninja: path.join(devToolsRoot, 'third_party', 'ninja', 'ninja.exe'),
    };
  }
  return {
    gn: path.join(devToolsRoot, 'buildtools', process.platform === 'darwin' ? 'mac' : 'linux64', 'gn'),
    ninja: path.join(devToolsRoot, 'third_party', 'ninja', 'ninja'),
  };
}

function buildDevTools(options) {
  const target = String(options.target ?? 'Default');
  if (!fs.existsSync(path.join(devToolsRoot, 'package.json'))) {
    fail('DevTools source is missing. Run npm run chromium:bootstrap:devtools first.');
  }
  const tools = devToolsBuildTools();
  if (!fs.existsSync(tools.gn) || !fs.existsSync(tools.ninja)) {
    fail('Pinned DevTools build tools are missing. Run npm run chromium:bootstrap:devtools first.');
  }
  run(tools.gn, ['gen', path.join('out', target)], {cwd: devToolsRoot});
  run(tools.ninja, ['-C', path.join('out', target), 'devtools_frontend_resources'], {cwd: devToolsRoot});
  console.log(`Built the Nexus DevTools frontend in ${path.join(devToolsRoot, 'out', target, 'gen', 'front_end')}.`);
}

function buildChromium(options) {
  const output = String(options.output ?? path.join('out', 'Nexus'));
  if (!fs.existsSync(path.join(chromiumRoot, '.git'))) {
    fail('Chromium source is missing. Run npm run chromium:bootstrap first.');
  }
  const outputPath = path.join(chromiumRoot, output);
  fs.mkdirSync(outputPath, {recursive: true});
  fs.copyFileSync(path.join(repoRoot, 'chromium-fork', 'args', 'nexus-debug.gn'), path.join(outputPath, 'args.gn'));
  run(depotTool('gn'), ['gen', output], {cwd: chromiumRoot});
  run(depotTool('autoninja'), ['-C', output, 'chrome'], {cwd: chromiumRoot});
  console.log(`Built Nexus Chromium at ${browserPathForOutput(outputPath)}.`);
}

function browserPathForOutput(outputPath) {
  if (process.platform === 'win32') {
    return path.join(outputPath, 'chrome.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(outputPath, 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
  }
  return path.join(outputPath, 'chrome');
}

function runChromium(options) {
  const browserPath = path.resolve(options.browser ?? browserPathForOutput(path.join(chromiumRoot, 'out', 'Nexus')));
  const devToolsTarget = String(options['devtools-target'] ?? 'Default');
  const startUrl = String(options.url ?? 'http://127.0.0.1:3207/');
  const devToolsFrontend = path.join(devToolsRoot, 'out', devToolsTarget, 'gen', 'front_end');
  if (!fs.existsSync(browserPath)) {
    fail(`A built Chromium binary was not found at ${browserPath}. Run npm run chromium:build first.`);
  }
  if (!fs.existsSync(devToolsFrontend)) {
    fail(`The customized DevTools frontend was not found at ${devToolsFrontend}. Run npm run chromium:devtools first.`);
  }
  const profile = path.join(sourceRoot, 'profiles', `nexus-source-${process.platform}`);
  fs.mkdirSync(profile, {recursive: true});
  const args = [
    `--user-data-dir=${profile}`,
    `--custom-devtools-frontend=${pathToFileURL(`${devToolsFrontend}${path.sep}`).href}`,
    '--auto-open-devtools-for-tabs',
    '--remote-debugging-port=9333',
    startUrl,
  ];
  const child = spawn(browserPath, args, {detached: true, stdio: 'ignore'});
  child.unref();
  console.log(`Started Nexus Chromium for ${process.platform} from ${browserPath}.`);
}

function help() {
  console.log(`Nexus Chromium source workflow

Commands:
  doctor [--strict]
  bootstrap --target=DevTools|Chromium|All [--history] [--skip-system-deps]
  apply [--devtools-root=PATH]
  build-devtools [--target=Default]
  build [--output=out/Nexus]
  run [--browser=PATH] [--devtools-target=Default] [--url=URL]
`);
}

const [command = 'help', ...rawOptions] = process.argv.slice(2);
const options = parseOptions(rawOptions);

try {
  switch (command) {
    case 'doctor': doctor(options); break;
    case 'bootstrap': bootstrap(options); break;
    case 'apply': applyOverlays(options); break;
    case 'build-devtools': buildDevTools(options); break;
    case 'build': buildChromium(options); break;
    case 'run': runChromium(options); break;
    case 'help': help(); break;
    default: fail(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
