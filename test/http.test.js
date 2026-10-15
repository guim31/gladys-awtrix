// -----------------------------------------------------------------------------
// End to end over real HTTP: the client and src/awtrix/http.js against a fake
// clock served on 127.0.0.1 (no other network).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AwtrixClient, ERROR_KINDS } from '../src/awtrix/client.js';
import { httpRequest } from '../src/awtrix/http.js';
import { FakeAwtrix, serve } from './helpers/fakeAwtrix.js';

test('reads and commands a clock over HTTP, with Basic authentication', async (t) => {
  const fake = new FakeAwtrix({ username: 'admin', password: 'p@ss:word' });
  const server = await serve(fake);
  t.after(() => server.close());

  const client = new AwtrixClient({ host: server.host, username: 'admin', password: 'p@ss:word' });
  const stats = await client.getStats();
  assert.equal(stats.uid, 'awtrix_3c1a2b');
  assert.equal(stats.temperature, 24);

  await client.notify({ text: 'Bonjour à tous', color: '#FF0000' });
  assert.deepEqual(fake.notifications, [{ text: 'Bonjour à tous', color: '#FF0000' }]);

  await client.setCustomApp('outdoor', { text: '12 °C' });
  assert.deepEqual(fake.customApps.get('outdoor'), { text: '12 °C' });
  await client.removeCustomApp('outdoor');
  assert.equal(fake.customApps.size, 0, 'an empty body removes the app');

  await assert.rejects(new AwtrixClient({ host: server.host }).getStats(), {
    kind: ERROR_KINDS.AUTH,
  });
});

test('a closed port is UNREACHABLE', async () => {
  const fake = new FakeAwtrix();
  const server = await serve(fake);
  await server.close();
  await assert.rejects(new AwtrixClient({ host: server.host }).getStats(), {
    kind: ERROR_KINDS.UNREACHABLE,
  });
});

test('a clock that does not answer in time is UNREACHABLE', async (t) => {
  const server = http.createServer(() => {}); // never answers
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const host = `127.0.0.1:${server.address().port}`;
  const client = new AwtrixClient({ host, timeoutMs: 100 });
  const err = await client.getStats().catch((e) => e);
  assert.equal(err.kind, ERROR_KINDS.UNREACHABLE);
  assert.equal(err.message, 'ETIMEDOUT');
});

test('an oversized answer is refused', async (t) => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('x'.repeat(300 * 1024));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(httpRequest(`http://127.0.0.1:${server.address().port}/api/stats`), {
    message: 'Response too large',
  });
});
