import { createServer, Server } from 'http';
import { CloudServer } from '../server';
import { config } from '../../core/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('Chat-owned HTTP execution routing', () => {
  let cloud: any;
  let http: Server;
  let url: string;
  let root: string;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-chat-route-'));
    cloud = new CloudServer() as any;
    jest.spyOn(cloud, 'saveChatState').mockImplementation(() => {});
    jest.spyOn(cloud, 'collectGathererObservation').mockResolvedValue({ pageId: '', context: 'No active rendered browser session' });
    jest.spyOn(cloud, 'buildGathererContext').mockReturnValue('No active rendered browser session');
    jest.spyOn(cloud, 'applyAutonomousRuntimeFromChat').mockImplementation((...args: any[]) => args[7]);
    http = createServer(cloud.getApp());
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(http.address() as any).port}`;
    cloud.builderChats.set('project-chat', []);
    cloud.chatProjects.set('project-chat', 'project-a');
    jest.spyOn(cloud.builderPlatform, 'getBuild').mockImplementation((id) => id === 'project-a' ? { id, prompt: 'Task tracker', root, logPath: path.join(root, 'executor.log'), previewLogPath: path.join(root, 'preview.log') } : undefined);
  });
  afterEach(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await cloud.stop();
    fs.rmSync(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
  const post = async (url: string, body: any) => {
    const security = await fetch(`${url}/api/security/csrf`, { headers: { 'x-api-key': config.get().auth.apiKey } });
    const { token } = await security.json() as any;
    const response = await fetch(`${url}/api/builder/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': config.get().auth.apiKey, 'x-csrf-token': token }, body: JSON.stringify(body) });
    return { code: response.status, data: await response.json() as any };
  };
  test('ignores a stale client project ID and executes only against the chat-owned project', async () => {
    jest.spyOn(cloud, 'runBuilderConductor').mockResolvedValue({ response: 'Change requested', actions: [], source: 'ai', intent: 'update' });
    const update = jest.spyOn(cloud.builderPlatform, 'updateBuildFromChat').mockReturnValue({ id: 'update', buildId: 'project-a', workspace: 'test', status: 'running' });
    const result = await post(url, { chatId: 'project-chat', activeBuildId: 'project-b', message: 'Make it easier to read?', mode: 'build' });
    expect(result.code).toBe(200);
    expect(update.mock.calls[0][0]).toBe('project-a');
    expect(result.data.projectId).toBe('project-a');
  });
  test('semantic build intent cannot override Ask mode', async () => {
    jest.spyOn(cloud, 'runBuilderConductor').mockResolvedValue({ response: 'Here is an explanation', actions: [], source: 'ai', intent: 'build' });
    const update = jest.spyOn(cloud.builderPlatform, 'updateBuildFromChat');
    const start = jest.spyOn(cloud.builderPlatform, 'startBuildFromPrompt');
    const result = await post(url, { chatId: 'project-chat', message: 'Build a tracker', mode: 'chat' });
    expect(result.code).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
  test('a new chat cannot accidentally edit a globally selected client project', async () => {
    jest.spyOn(cloud, 'runBuilderConductor').mockResolvedValue({ response: 'Hello', actions: [], source: 'ai', intent: 'ask' });
    const update = jest.spyOn(cloud.builderPlatform, 'updateBuildFromChat');
    const result = await post(url, { chatId: 'new-chat', activeBuildId: 'project-b', message: 'Thanks', mode: 'build' });
    expect(result.code).toBe(200);
    expect(result.data.projectId).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
