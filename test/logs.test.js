// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never a password, never an authorization header.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAwtrix, HOST_1, createAll, createWorld } from './helpers/world.js';

const PASSWORD = 'Sup3r-s3cret!';
const BASIC = Buffer.from(`admin:${PASSWORD}`).toString('base64');

/** Capture the lines of the SDK logger at LOG_LEVEL=info. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const clock = new FakeAwtrix({ username: 'admin', password: PASSWORD });
  const w = await createWorld({
    clocks: { [HOST_1]: clock },
    config: { hosts: HOST_1, discovery: false, username: 'admin', password: PASSWORD },
    ...options,
  });
  t.after(() => w.app.stop());
  return { ...w, clock };
}

const assertNoSecret = (logs) => {
  const text = logs.texts().join('\n');
  assert.ok(!text.includes(PASSWORD), 'never the password');
  assert.ok(!text.includes(BASIC), 'never the authorization header');
};

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => text.includes('connected (firmware 0.98)')),
    'the start is logged',
  );
  await createAll(w);
  logs.clear();

  for (let i = 0; i < 5; i += 1) {
    w.clock.stats.temp += 1;
    w.clock.stats.app = i % 2 ? 'Time' : 'Date';
    await w.hub.cycle();
  }
  assert.deepEqual(logs.texts(), []);
});

test('a clock that stays off is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();

  w.clock.online = false;
  for (let i = 0; i < 6; i += 1) {
    await w.hub.cycle();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');
  assert.match(logs.lines[0].text, /AWTRIX 3c1a2b \(192\.0\.2\.10\): EHOSTUNREACH/);

  logs.clear();
  w.clock.online = true;
  await w.hub.cycle();
  await w.hub.cycle();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /answers again/);
});

test('a refused password is logged once, never the password', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t, {
    config: { hosts: HOST_1, discovery: false, username: 'admin', password: `${PASSWORD}x` },
  });
  for (let i = 0; i < 5; i += 1) {
    await w.hub.cycle();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /credentials refused/);
  assertNoSecret(logs);
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let i = 0; i < 4; i += 1) {
    w.clock.stats.temp += 1;
    await w.hub.cycle();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States of .* refused/);
});

test('one line per user action', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.fake.sceneAction('show_notification', { text: 'Hello' });
  await w.fake.sceneAction('set_indicator', { indicator: '1', color: 'red' });
  assert.deepEqual(
    logs.texts().map((text) => text.replace(/^.*\] /, '')),
    ['AWTRIX 3c1a2b (192.0.2.10): notification sent', 'AWTRIX 3c1a2b (192.0.2.10): indicator 1 on'],
  );
});

test('LOG_LEVEL=debug shows each reading problem; never a secret', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  w.clock.online = false;
  await w.hub.cycle();
  await w.hub.cycle();
  await w.hub.cycle();
  const text = logs.texts().join('\n');
  assert.match(text, /\[DEBUG\].*will retry/);
  assert.match(text, /\[DEBUG\].*still failing/);
  assertNoSecret(logs);
});
