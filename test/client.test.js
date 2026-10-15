// -----------------------------------------------------------------------------
// The AWTRIX 3 client against in-memory clocks: what it sends, how it reads
// the errors (credentials, AWTRIX NG, not a clock, no answer), and the one
// request at a time an ESP32 can take.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AwtrixClient, ERROR_KINDS } from '../src/awtrix/client.js';
import { FakeAwtrix } from './helpers/fakeAwtrix.js';

const clientFor = (fake, options = {}) =>
  new AwtrixClient({ host: '192.0.2.10', request: (url, o) => fake.handle(url, o), ...options });

test('reads the statistics and the settings', async () => {
  const fake = new FakeAwtrix();
  const client = clientFor(fake);
  assert.equal((await client.getStats()).uid, 'awtrix_3c1a2b');
  assert.deepEqual(await client.getSettings(), { autoBrightness: true });
  assert.deepEqual(
    fake.requests.map((r) => `${r.method} ${r.path}`),
    ['GET /api/stats', 'GET /api/settings'],
  );
});

test('sends HTTP Basic credentials only when a username is set', async () => {
  const fake = new FakeAwtrix({ username: 'admin', password: 's3cret' });
  const seen = [];
  const request = (url, options) => {
    seen.push(options.headers);
    return fake.handle(url, options);
  };
  await assert.rejects(new AwtrixClient({ host: 'h', request }).getStats(), {
    kind: ERROR_KINDS.AUTH,
  });
  await assert.rejects(
    new AwtrixClient({ host: 'h', username: 'admin', password: 'wrong', request }).getStats(),
    { kind: ERROR_KINDS.AUTH },
  );
  const stats = await new AwtrixClient({
    host: 'h',
    username: 'admin',
    password: 's3cret',
    request,
  }).getStats();
  assert.equal(stats.uid, 'awtrix_3c1a2b');
  assert.deepEqual(seen[0], {});
  assert.match(seen[2].authorization, /^Basic /);
});

test('an error message never carries the password', async () => {
  const fake = new FakeAwtrix({ username: 'admin', password: 'right' });
  const client = clientFor(fake, { username: 'admin', password: 'p4ssw0rd-typo' });
  const err = await client.getStats().catch((e) => e);
  assert.equal(err.kind, ERROR_KINDS.AUTH);
  assert.ok(!JSON.stringify({ ...err, message: err.message }).includes('p4ssw0rd'));
});

test('AWTRIX NG and other answers are told apart', async () => {
  await assert.rejects(clientFor(new FakeAwtrix({ kind: 'ng' })).getStats(), {
    kind: ERROR_KINDS.NG,
  });
  await assert.rejects(clientFor(new FakeAwtrix({ kind: 'other' })).getStats(), {
    kind: ERROR_KINDS.NOT_AWTRIX,
  });
  const notJson = clientFor({
    handle: async () => ({ status: 200, headers: {}, body: '<html>router</html>' }),
  });
  await assert.rejects(notJson.getStats(), { kind: ERROR_KINDS.NOT_AWTRIX });
  const offline = new FakeAwtrix();
  offline.online = false;
  await assert.rejects(clientFor(offline).getStats(), { kind: ERROR_KINDS.UNREACHABLE });
  const failing = new FakeAwtrix();
  failing.failNext = 503;
  await assert.rejects(clientFor(failing).getStats(), { kind: ERROR_KINDS.HTTP, status: 503 });
});

test('every command goes to its documented route', async () => {
  const fake = new FakeAwtrix();
  const client = clientFor(fake);
  await client.setPower(false);
  await client.setSettings({ BRI: 128, ABRI: false });
  await client.notify({ text: 'Hi' });
  await client.dismissNotification();
  await client.setCustomApp('outdoor temp', { text: '12' });
  await client.removeCustomApp('outdoor temp');
  await client.setIndicator(2, { color: '#FF0000' });
  await client.nextApp();
  await client.switchApp('Date');
  assert.deepEqual(
    fake.commands().map((r) => `${r.path} ${r.body}`),
    [
      '/api/power {"power":false}',
      '/api/settings {"BRI":128,"ABRI":false}',
      '/api/notify {"text":"Hi"}',
      '/api/notify/dismiss ',
      '/api/custom?name=outdoor%20temp {"text":"12"}',
      '/api/custom?name=outdoor%20temp ',
      '/api/indicator2 {"color":"#FF0000"}',
      '/api/nextapp ',
      '/api/switch {"name":"Date"}',
    ],
  );
});

test('a command the clock refuses is a REFUSED error', async () => {
  await assert.rejects(clientFor(new FakeAwtrix()).switchApp('Nope'), {
    kind: ERROR_KINDS.REFUSED,
  });
});

test('one request at a time per clock', async () => {
  let running = 0;
  let max = 0;
  const fake = new FakeAwtrix();
  const client = clientFor({
    handle: async (url, options) => {
      running += 1;
      max = Math.max(max, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return fake.handle(url, options);
    },
  });
  await Promise.all([client.getStats(), client.getSettings(), client.nextApp(), client.getStats()]);
  assert.equal(max, 1);
});

test('a failed request does not block the next ones', async () => {
  const fake = new FakeAwtrix();
  const client = clientFor(fake);
  fake.online = false;
  await assert.rejects(client.getStats());
  fake.online = true;
  assert.equal((await client.getStats()).uid, 'awtrix_3c1a2b');
});
