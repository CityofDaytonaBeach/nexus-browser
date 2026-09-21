import * as fs from 'fs';
import { Browser, chromium, LaunchOptions } from 'playwright';

export async function launchChromium(options: LaunchOptions = {}): Promise<Browser> {
  const errors: string[] = [];
  try {
    return await chromium.launch(options);
  } catch (error: any) {
    errors.push(error.message);
  }

  const channels = process.platform === 'win32' ? ['chrome', 'msedge'] : ['chrome'];
  for (const channel of channels) {
    try {
      return await chromium.launch({ ...options, channel });
    } catch (error: any) {
      errors.push(`${channel}: ${error.message}`);
    }
  }

  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const candidates = [
    configured,
    process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined,
    process.platform === 'win32' ? 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' : undefined,
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : undefined,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined,
    process.platform === 'linux' ? '/usr/bin/google-chrome' : undefined,
    process.platform === 'linux' ? '/usr/bin/chromium' : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));

  for (const executablePath of Array.from(new Set(candidates))) {
    try {
      return await chromium.launch({ ...options, executablePath });
    } catch (error: any) {
      errors.push(`${executablePath}: ${error.message}`);
    }
  }

  throw new Error(`No usable Chromium browser was found. Install Playwright Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. ${errors.slice(-2).join(' | ')}`);
}
