import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
const childProcess = require('child_process') as typeof import('child_process');
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuilderPlatform } from '../platform';
import { config } from '../../core/config';

describe('Executor reasoning and lifecycle', () => {
  let root: string;
  let original: any;
  let idle: string | undefined;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-executor-test-')); original = { ...config.get().codeExecution }; idle = process.env.CODE_EXECUTION_IDLE_TIMEOUT_MS; });
  afterEach(() => {
    config.update({ codeExecution: original });
    if (idle === undefined) delete process.env.CODE_EXECUTION_IDLE_TIMEOUT_MS; else process.env.CODE_EXECUTION_IDLE_TIMEOUT_MS = idle;
    jest.useRealTimers(); jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true });
  });
  test('idle timeout reports a terminal failure even if descendant pipes never close', async () => {
    const platform: any = new BuilderPlatform();
    config.update({ codeExecution: { ...original, localCli: 'nexus-test-executor' } });
    const child: any = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = jest.fn(); child.killed = false;
    jest.spyOn(childProcess, 'spawn').mockReturnValue(child);
    process.env.CODE_EXECUTION_IDLE_TIMEOUT_MS = '60000';
    jest.useFakeTimers();
    const exited = jest.fn();
    platform.launchCodeExecution(root, 'test', 'build', path.join(root, 'executor.log'), exited);
    jest.advanceTimersByTime(60000);
    expect(exited).toHaveBeenCalledWith(1);
    child.emit('close', 0);
    expect(exited).toHaveBeenCalledTimes(1);
    await new Promise<void>(resolve => child.stdout.destroyed ? resolve() : child.stdout.once('close', resolve));
  });
  test('OpenCode supplies semantic reasoning without granting its router file or shell tools', async () => {
    const platform: any = new BuilderPlatform();
    config.update({ codeExecution: { ...original, mode: 'local', localCli: 'opencode', localArgs: ['run'] } });
    const run = jest.spyOn(platform, 'runCommand').mockResolvedValue({ code: 0, timedOut: false, stderr: '', stdout: JSON.stringify({ type: 'text', part: { text: '{"intent":"browser"}' } }) });
    expect(await platform.reasonAboutChat('Route this request')).toBe('{"intent":"browser"}');
    const call: any[] = run.mock.calls[0];
    expect(call[2]).toContain('--format');
    const overrides = JSON.parse(call[4].OPENCODE_CONFIG_CONTENT);
    expect(overrides.agent['nexus-router'].permission['*']).toBe('deny');
    expect(overrides.agent.build.permission.bash['npm run dev*']).toBe('deny');
    expect(call[4].XDG_DATA_HOME).toBeTruthy();
  });
});
