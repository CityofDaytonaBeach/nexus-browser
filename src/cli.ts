import { Command } from 'commander';
import { config } from './core/config';
import { createLogger } from './core/logger';
import { BrowserEngine } from './browser/engine';
import { AIAgent } from './agent/index';
import { AutomationEngine } from './automation/engine';
import * as dotenv from 'dotenv';

dotenv.config();

const log = createLogger('CLI');
const program = new Command();

program
  .name('nexus')
  .description('NexusBrowser CLI - Control your AI browser from the command line')
  .version('1.0.0');

program
  .command('start')
  .description('Start the NexusBrowser server')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('--headless', 'Run browser in headless mode')
  .option('--no-ide', 'Disable built-in IDE')
  .action(async (opts) => {
    config.update({
      server: { ...config.get().server, port: parseInt(opts.port) },
      browser: { ...config.get().browser, headless: opts.headless || false },
      ide: { ...config.get().ide, enabled: opts.ide !== false },
    });

    const { CloudServer } = await import('./cloud/server');
    const { IDEServer } = await import('./ide/server');
    const { BrowserManager } = await import('./browser/manager');

    const bm = BrowserManager.getInstance();
    await bm.initialize();

    const server = new CloudServer();
    await server.start();

    if (config.get().ide.enabled) {
      const ide = new IDEServer();
      await ide.start();
    }

    log.info('NexusBrowser is running');
  });

program
  .command('browse')
  .description('Open a URL in the browser')
  .argument('<url>', 'URL to open')
  .option('--screenshot', 'Take a screenshot')
  .option('--pdf', 'Save as PDF')
  .action(async (url, opts) => {
    config.update({ browser: { ...config.get().browser, headless: true } });

    const engine = BrowserEngine.getInstance();
    const session = await engine.createSession();
    const pageId = session.activePageId!;

    log.info(`Navigating to ${url}`);
    await engine.executeAction(session.id, pageId, { type: 'navigate', url });

    if (opts.screenshot) {
      const buf = await engine.getPageScreenshot(session.id, pageId);
      if (buf) {
        const filename = `screenshot-${Date.now()}.png`;
        require('fs').writeFileSync(filename, buf);
        log.info(`Screenshot saved: ${filename}`);
      }
    }

    if (opts.pdf) {
      const result = await engine.executeAction(session.id, pageId, { type: 'pdf' });
      if (result.success && result.data?.pdf) {
        const filename = `page-${Date.now()}.pdf`;
        require('fs').writeFileSync(filename, Buffer.from(result.data.pdf, 'base64'));
        log.info(`PDF saved: ${filename}`);
      }
    }

    if (!opts.screenshot && !opts.pdf) {
      const content = await engine.getPageContent(session.id, pageId);
      console.log(content.slice(0, 5000));
    }

    await engine.destroySession(session.id);
  });

program
  .command('agent')
  .description('Give the AI agent a task')
  .argument('<goal>', 'Task description')
  .option('--url <url>', 'Starting URL')
  .action(async (goal, opts) => {
    config.update({ browser: { ...config.get().browser, headless: true } });

    const engine = BrowserEngine.getInstance();
    const agent = new AIAgent();

    const session = await engine.createSession();
    const pageId = session.activePageId!;

    if (opts.url) {
      await engine.executeAction(session.id, pageId, { type: 'navigate', url: opts.url });
    }

    log.info(`Agent executing: ${goal}`);

    agent.on('task:step', (data) => {
      log.info(`  Step ${data.step + 1}: ${data.description}`);
    });

    const task = await agent.startTask(goal, session.id, pageId);
    log.info(`Task ${task.status}: ${task.result || task.error}`);

    if (task.status === 'completed') {
      const buf = await engine.getPageScreenshot(session.id, pageId);
      if (buf) {
        require('fs').writeFileSync('agent-result.png', buf);
        log.info('Result screenshot saved to agent-result.png');
      }
    }

    await engine.destroySession(session.id);
  });

program
  .command('automate')
  .description('Run an automation script')
  .argument('<script>', 'Script file (JSON) or inline JSON')
  .option('-s, --session <id>', 'Existing session ID')
  .action(async (scriptStr, opts) => {
    config.update({ browser: { ...config.get().browser, headless: true } });

    const automation = new AutomationEngine();
    await automation.initialize();

    let script;
    try {
      if (scriptStr.endsWith('.json')) {
        script = JSON.parse(require('fs').readFileSync(scriptStr, 'utf8'));
      } else {
        script = JSON.parse(scriptStr);
      }
    } catch (e: any) {
      log.error(`Failed to parse script: ${e.message}`);
      return;
    }

    const created = automation.createScript(script);
    log.info(`Running automation: ${created.name || created.id}`);
    const exec = await automation.runScript(created.id, opts.session);
    log.info(`Execution ${exec.status}`);

    if (exec.status === 'completed' && exec.results.length > 0) {
      require('fs').writeFileSync('automation-result.json', JSON.stringify(exec, null, 2));
      log.info('Results saved to automation-result.json');
    }
  });

program
  .command('script:create')
  .description('Create a new automation script')
  .argument('<name>', 'Script name')
  .option('-d, --description <desc>', 'Description', '')
  .action(async (name, opts) => {
    const automation = new AutomationEngine();
    await automation.initialize();

    const script = automation.createScript({
      name,
      description: opts.description,
      triggers: [{ type: 'manual', config: {} }],
      steps: [],
      variables: {},
      enabled: true,
    });

    log.info(`Created script: ${script.id}`);
    log.info(`Edit automations/${script.id}.json to configure`);
    console.log(JSON.stringify(script, null, 2));
  });

program.parse();
