import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuilderPlatform, BuildWorkspace } from '../platform';
import * as verification from '../browser-verification';
import { config } from '../../core/config';

describe('Backend-owned build and repair lifecycle', () => {
  let root: string;
  let platform: BuilderPlatform;
  let build: BuildWorkspace;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-lifecycle-'));
    platform = new BuilderPlatform();
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, '.nexus'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'echo ok', dev: 'node server.js' } }));
    fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'before');
    build = { id: '1234abcd', root, name: 'Tasks', prompt: 'Build a task tracker', status: 'created', previewStatus: 'stopped', previewUrl: 'http://127.0.0.1:5173',
      opencodeCommand: 'opencode', logPath: path.join(root, 'executor.log'), previewLogPath: path.join(root, 'preview.log'), previewCommand: '', brain: { mode: 'opencode', provider: 'opencode', executor: 'opencode', notes: [] }, createdAt: new Date().toISOString() };
    (platform as any).builds.set(build.id, build);
  });
  afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  test('zero executor exit remains nonterminal until independent verification finishes', async () => {
    let exit!: (code: number) => void;
    let finishVerification!: (passed: boolean) => void;
    jest.spyOn(platform as any, 'launchCodeExecution').mockImplementation((...args: any[]) => { exit = args[4]; return undefined; });
    jest.spyOn(platform as any, 'verifyAndRepair').mockImplementation(() => new Promise<boolean>((resolve) => { finishVerification = resolve; }));
    const run = platform.updateBuildFromChat(build.id, 'Add due dates');
    exit(0);
    expect(platform.getBuildActivity(build.id, run.id).terminal).toBe(false);
    expect(run.status).toBe('verifying');
    const queued = platform.updateBuildFromChat(build.id, 'Make it more compact');
    expect(queued.status).toBe('queued');
    jest.spyOn(platform as any, 'startNextQueuedUpdate').mockReturnValue(false);
    finishVerification(false);
    await new Promise((resolve) => setImmediate(resolve));
    expect(run.status).toBe('failed');
    expect(build.status).toBe('failed');
  });
  test('repairs from browser evidence, reruns checks, and locks acceptance during repair', async () => {
    const contract = { product: 'Tasks', workflows: [{ name: 'Create task', path: '/', steps: [{ action: 'click', target: { role: 'button', name: 'Add task' } }, { action: 'expectText', text: 'Created' }] }] };
    fs.writeFileSync(path.join(root, '.nexus', 'product-contract.json'), JSON.stringify(contract));
    jest.spyOn(platform, 'runBuildDoctor').mockResolvedValue({ issues: [] } as any);
    jest.spyOn(platform, 'stopPreview').mockReturnValue(build);
    jest.spyOn(platform, 'startPreview').mockReturnValue(build);
    jest.spyOn(platform as any, 'waitForPreview').mockResolvedValue(undefined);
    const browser = jest.spyOn(verification, 'verifyBrowserProduct')
      .mockResolvedValueOnce({ status: 'failed', issues: ['Add task button does not create a task'], workflows: [], artifacts: ['/evidence/mobile.png'] })
      .mockResolvedValueOnce({ status: 'passed', issues: [], workflows: [], artifacts: ['/evidence/repaired.png'] });
    const repair = jest.spyOn(platform as any, 'runCodeExecutionBlocking').mockImplementation(async () => {
      fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'repaired');
      fs.writeFileSync(path.join(root, '.nexus', 'product-contract.json'), '{}');
      return { code: 0, stdout: '', stderr: '', timedOut: false };
    });
    expect(await (platform as any).verifyAndRepair(build)).toBe(true);
    expect(repair.mock.calls[0][1]).toContain('Add task button does not create a task');
    expect(repair.mock.calls[0][1]).toContain('/evidence/mobile.png');
    expect(browser.mock.calls[1][3]?.workflows[0].name).toBe('Create task');
    expect(build.verification?.phase).toBe('passed');
    expect(platform.getBuildCheckpoints(build.id)[0].after).toBeDefined();
  });
  test('polling an old update cannot change an active project job', () => {
    const run = platform.updateBuildFromChat(build.id, 'Prepare a change', { launch: false });
    run.status = 'completed';
    build.status = 'verifying';
    platform.getBuildActivity(build.id, run.id);
    expect(build.status).toBe('verifying');
  });
  test('executor prose and absent tests cannot certify independent success', () => {
    fs.writeFileSync(build.logPath, '✓ built in 400ms\nNo automated tests configured\nCode executor exited with code 1');
    expect((platform as any).executorLogShowsVerifiedBuild(build.logPath)).toBe(false);
  });
  test('remote HTTP acknowledgements do not complete a build', async () => {
    const previous = config.get();
    config.update({ codeExecution: { ...previous.codeExecution, mode: 'remote', remoteUrl: 'https://executor.example' } });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: async () => JSON.stringify({ id: 'job', status: 'accepted' }) } as any);
    try {
      await expect((platform as any).callRemoteCodeExecution(root, 'Build tasks', 'build', build.logPath)).rejects.toThrow('complete and synchronize');
    } finally { config.update(previous); }
  });
  test('persistent job state marks interrupted verification as failed after restart', () => {
    build.status = 'verifying';
    build.verification = { phase: 'browser', pass: 1, issues: [], artifacts: ['evidence.png'] };
    (platform as any).persistBuild(build);
    const restored = (new BuilderPlatform() as any).hydrateBuildFromRoot(build.id, root);
    expect(restored.status).toBe('failed');
    expect(restored.verification.issues[0]).toContain('interrupted');
    expect(restored.verification.artifacts).toContain('evidence.png');
  });
});
