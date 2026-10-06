import { createServer, Server } from 'http';
import { CloudServer } from '../server';
import { config } from '../../core/config';
import { browserRequest } from '../../browser/chat-tasks';

describe('Browser-first command execution', () => {
  let cloud: any;
  let http: Server;
  let url: string;
  let actions: any[];
  let currentUrl: string;
  beforeEach(async () => {
    cloud = new CloudServer() as any;
    cloud.builderChats.clear(); cloud.chatProjects.clear();
    actions = []; currentUrl = 'https://example.com';
    jest.spyOn(cloud, 'saveChatState').mockImplementation(() => {});
    jest.spyOn(cloud, 'applyAutonomousRuntimeFromChat').mockImplementation((...args: any[]) => args[7]);
    jest.spyOn(cloud, 'collectGathererObservation').mockResolvedValue({ pageId: 'active-tab', context: 'Live browser evidence' });
    jest.spyOn(cloud, 'buildGathererContext').mockReturnValue('Live browser evidence');
    jest.spyOn(cloud, 'runBuilderConductor').mockResolvedValue({ response: 'Ready', intent: 'build', actions: [], source: 'fallback' });
    jest.spyOn(cloud, 'executeBrowserAction').mockImplementation(async (_sid: any, _pid: any, action: any) => {
      actions.push(action);
      if (action.type === 'navigate') currentUrl = action.url;
      return { success: true, duration: 1, data: { url: currentUrl, title: 'Example', text: 'A real example', links: [{ text: 'Pricing', url: 'https://example.com/pricing' }], resources: [{ url: 'https://example.com/api/products?token=secret', type: 'fetch' }], forms: [] } };
    });
    http = createServer(cloud.getApp());
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(http.address() as any).port}`;
  });
  afterEach(async () => {
    http.closeAllConnections(); await new Promise<void>((resolve) => http.close(() => resolve()));
    await cloud.stop(); jest.restoreAllMocks();
  });
  async function chat(message: string, mode = 'build') {
    const security = await fetch(`${url}/api/security/csrf`, { headers: { 'x-api-key': config.get().auth.apiKey } });
    const { token } = await security.json() as any;
    const response = await fetch(`${url}/api/builder/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': config.get().auth.apiKey, 'x-csrf-token': token }, body: JSON.stringify({ chatId: 'test-actions', sessionId: 'electron-native', pageId: 'active-tab', message, mode }) });
    return { status: response.status, ...await response.json() as any };
  }
  test('plain-language search actually navigates and returns observed result links', async () => {
    const result = await chat('Could you search the web for candy shops?');
    expect(result.status).toBe(200);
    expect(actions[0].url).toContain('google.com/search?q=candy');
    expect(result.response).toContain('https://example.com/pricing');
    expect(cloud.runBuilderConductor).not.toHaveBeenCalled();
  });
  test('find the pricing page follows an observed link, rather than just reading the page', async () => {
    const result = await chat('/agent-browser chat "find the pricing page"');
    expect(result.status).toBe(200);
    expect(actions.some(action => action.type === 'navigate' && action.url === 'https://example.com/pricing')).toBe(true);
  });
  test('API requests inspect actual resource calls and redact query parameters', async () => {
    const result = await chat('give me apis');
    expect(result.response).toContain('/api/products');
    expect(result.response).not.toContain('secret');
    expect(cloud.runBuilderConductor).not.toHaveBeenCalled();
  });
  test('search then copy opens a result and hands captured evidence to the build executor', async () => {
    const reference = { screenshotPath: 'ref.png', profilePath: 'ref.json', matchRequired: true };
    const ground = jest.spyOn(cloud, 'groundChatReference').mockResolvedValue({ sessionId: 'electron-native', pageId: 'active-tab', reference });
    const build = jest.spyOn(cloud.builderPlatform, 'startBuildFromPrompt').mockReturnValue({ id: 'new-app', root: 'test', status: 'opencode-running' });
    const result = await chat('Search for a candy shop website and copy it');
    expect(result.status).toBe(200);
    expect(currentUrl).toBe('https://example.com/pricing');
    expect(ground).toHaveBeenCalled();
    expect((build.mock.calls[0][1] as any)?.reference).toEqual(reference);
    expect(result.build.id).toBe('new-app');
  });
  test('browser failures stop dependent builds and report the actual error', async () => {
    (cloud.executeBrowserAction as jest.Mock).mockResolvedValue({ success: false, error: 'Navigation failed' });
    const build = jest.spyOn(cloud.builderPlatform, 'startBuildFromPrompt');
    const result = await chat('Copy https://example.com');
    expect(result.requiresInput).toBe(true);
    expect(result.response).toContain('Navigation failed');
    expect(build).not.toHaveBeenCalled();
  });
  test('copy this page captures the active tab and starts implementation without needing a URL', async () => {
    const reference = { screenshotPath: 'active.png', profilePath: 'active.json', matchRequired: true };
    jest.spyOn(cloud, 'groundChatReference').mockResolvedValue({ sessionId: 'electron-native', pageId: 'active-tab', reference });
    const build = jest.spyOn(cloud.builderPlatform, 'startBuildFromPrompt').mockReturnValue({ id: 'copy', root: 'test', status: 'opencode-running' });
    const result = await chat('Could you copy this page?');
    expect(result.status).toBe(200);
    expect((build.mock.calls[0][1] as any).reference).toEqual(reference);
  });
  test('semantic browser actions execute instead of staying as suggested buttons', async () => {
    (cloud.runBuilderConductor as jest.Mock).mockResolvedValue({ intent: 'browser', response: 'I will do it', actions: [], browserTasks: [{ type: 'click', target: 'Pricing' }] });
    const result = await chat('Use the pricing control');
    expect(result.response).toContain('Clicked Pricing');
    expect(actions.some(action => action.type === 'click')).toBe(true);
  });
  test('research action buttons capture the current rendered reference', async () => {
    const ground = jest.spyOn(cloud, 'groundChatReference').mockResolvedValue({ reference: { screenshotPath: 'research.png' } });
    const result = await chat('Run research project and create a project brain from the current target.');
    expect(ground).toHaveBeenCalled(); expect(result.response).toContain('research.png');
  });
  test('rejects arbitrary JavaScript supplied as a semantic browser task', () => {
    expect(() => cloud.parseBuilderConductorJson('{"intent":"browser","response":"ok","browserTasks":[{"type":"evaluate","script":"steal()"}]}')).toThrow();
  });
  test('polite copy and search requests retain the dependent build intent', () => {
    expect(browserRequest('Could you copy https://example.com?')?.buildAfter).toBe(true);
    expect(browserRequest('Find a bookstore website and recreate it')?.tasks[0].type).toBe('search');
  });
});
