#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

console.log('NexusBrowser Setup');
console.log('==================\n');

function run(cmd) {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    console.error(`Command failed: ${cmd}`);
  }
}

console.log('1. Installing dependencies...');
run('npm install');

console.log('\n2. Installing Playwright browsers...');
run('npx playwright install chromium');

console.log('\n3. Creating directories...');
['profiles', 'automations', 'config'].forEach(dir => {
  const dirPath = path.join(root, dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

console.log('\n4. Creating default config...');
const configPath = path.join(root, 'config', 'default.json');
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({
    server: { port: 3000, wsPort: 3001, host: '0.0.0.0', corsOrigin: '*' },
    browser: { headless: false, viewportWidth: 1920, viewportHeight: 1080 },
    cloud: { enabled: false, maxSessions: 10 },
    ide: { port: 3002, enabled: true },
  }, null, 2));
}

console.log('\n5. Creating .env from template...');
const envPath = path.join(root, '.env');
const envExample = path.join(root, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envPath);
  console.log('   Created .env - edit with your API keys');
}

console.log('\n6. Compiling TypeScript...');
run('npx tsc');

console.log('\n==================');
console.log('Setup complete!');
console.log('');
console.log('Next steps:');
console.log('  1. Edit .env with your API keys (OPENAI_API_KEY or ANTHROPIC_API_KEY)');
console.log('  2. Run: npm start');
console.log('  3. Open http://localhost:3000 in your browser');
console.log('');
console.log('CLI commands:');
console.log('  nexus start          - Start the server');
console.log('  nexus browse <url>   - Browse a URL');
console.log('  nexus agent <goal>   - Give AI agent a task');
console.log('  nexus automate <file> - Run automation script');
