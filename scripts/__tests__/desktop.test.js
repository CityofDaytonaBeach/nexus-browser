const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { runElectron } = require('../desktop');

function fakeLaunch(results) {
  const calls = [];
  return {
    calls,
    spawnProcess: (_bin, args, options) => {
      calls.push({ args, options });
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        const result = results.shift();
        if (result.error) child.emit('error', result.error);
        else {
          child.stderr.emit('data', Buffer.from(result.output || ''));
          child.emit('exit', result.code, result.signal || null);
        }
      });
      return child;
    },
  };
}

test('GPU failure retries once with software rendering and keeps the sandbox', async () => {
  const launch = fakeLaunch([{ code: 1, output: "GPU process isn't usable" }, { code: 0 }]);
  assert.equal(await runElectron('electron', launch), 0);
  assert.equal(launch.calls.length, 2);
  assert.equal(launch.calls[0].args.includes('--disable-gpu'), false);
  assert.equal(launch.calls[1].args.includes('--disable-gpu'), true);
  assert.equal(launch.calls[1].options.env.NEXUS_DISABLE_GPU, 'true');
  assert.equal(launch.calls.some(call => call.args.includes('--no-sandbox')), false);
});

test('a second GPU failure is terminal rather than an endless restart', async () => {
  const launch = fakeLaunch([{ code: 1, output: 'NEXUS_GPU_FAILURE' }, { code: 2, output: 'NEXUS_GPU_FAILURE' }]);
  assert.equal(await runElectron('electron', launch), 2);
  assert.equal(launch.calls.length, 2);
});

test('unrelated crashes and signals do not get hidden or retried', async () => {
  for (const result of [{ code: 7 }, { code: null, signal: 'SIGTERM' }]) {
    const launch = fakeLaunch([result]);
    assert.equal(await runElectron('electron', launch), result.code ?? 1);
    assert.equal(launch.calls.length, 1);
  }
});

test('launch errors propagate to backend cleanup', async () => {
  const launch = fakeLaunch([{ error: new Error('ENOENT') }]);
  await assert.rejects(runElectron('electron', launch), /ENOENT/);
});

test('disabling the entire Chromium sandbox requires explicit compatibility mode', async () => {
  const launch = fakeLaunch([{ code: 0 }]);
  assert.equal(await runElectron('electron', { ...launch, compatibilityMode: true }), 0);
  assert.equal(launch.calls[0].args.includes('--no-sandbox'), true);
});
