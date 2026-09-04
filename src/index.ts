import { config } from './core/config';
import { createLogger } from './core/logger';
import { BrowserManager } from './browser/manager';
import { CloudServer } from './cloud/server';
import { IDEServer } from './ide/server';
import { AutomationEngine } from './automation/engine';
import * as dotenv from 'dotenv';

dotenv.config();

const log = createLogger('Main');

const ASCII_LOGO = `
 ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
 ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
 ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
 ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
 ██║ ╚████║███████╗██╔╝ ╚██╗╚██████╔╝███████║
 ╚═╝  ╚═══╝╚══════╝╚═╝   ╚═╝ ╚═════╝ ╚══════╝
 ┌──────────────────────────────────────────────┐
 │  The First AI-Native Smart Browser v1.0.0    │
 │  Cloud • AI Agent • OpenCode IDE • Full Dev   │
 └──────────────────────────────────────────────┘
`;

async function main() {
  console.log(ASCII_LOGO);

  const args = process.argv.slice(2);
  const isCloud = args.includes('--cloud');
  const isHeadless = args.includes('--headless');
  const noIDE = args.includes('--no-ide');
  const apiOnly = args.includes('--api-only');
  const portArg = args.find((a) => a.startsWith('--port='));

  if (portArg) {
    config.update({ server: { ...config.get().server, port: parseInt(portArg.split('=')[1]) } });
  }

  if (isHeadless) {
    config.update({ browser: { ...config.get().browser, headless: true } });
  }

  log.info('Starting NexusBrowser...');
  log.info(`Mode: ${isCloud ? 'Cloud' : 'Local'} | Headless: ${isHeadless || config.get().browser.headless}`);

  const browserManager = BrowserManager.getInstance();
  await browserManager.initialize();
  log.info('Browser engine ready');

  if (!apiOnly) {
    const cloudServer = new CloudServer();
    await cloudServer.start();
    log.info(`REST API: http://localhost:${config.get().server.port}`);
    log.info(`WebSocket: ws://localhost:${config.get().server.port}`);
  }

  if (config.get().ide.enabled && !noIDE) {
    const ideServer = new IDEServer();
    await ideServer.start();
    log.info(`IDE: http://localhost:${config.get().ide.port}`);
  }

  const automation = new AutomationEngine();
  await automation.initialize();
  log.info('Automation engine ready');

  if (!isCloud) {
    log.info('');
    log.info(`Open builder UI: http://localhost:${config.get().server.port}`);
  }

  log.info('');
  log.info('NexusBrowser is running!');
  log.info('─────────────────────────────────────');
  log.info(`  API:     http://localhost:${config.get().server.port}`);
  log.info(`  IDE:     http://localhost:${config.get().ide.port}`);
  log.info(`  WS:      ws://localhost:${config.get().server.port}`);
  log.info('─────────────────────────────────────');

  process.on('SIGINT', async () => {
    log.info('Shutting down...');
    await browserManager.cleanup();
    process.exit(0);
  });

  process.on('unhandledRejection', (error) => {
    log.error('Unhandled rejection:', error);
  });
}

main().catch((error) => {
  log.error('Failed to start:', error);
  process.exit(1);
});
