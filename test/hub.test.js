// -----------------------------------------------------------------------------
// The hub with the SDK's fake Gladys and fake clocks: where the clocks come
// from (typed addresses, mDNS), what is published, the device commands, the
// failures and how they show.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  FakeAwtrix,
  HOST_1,
  HOST_2,
  createAll,
  createClock,
  createWorld,
  deviceId,
  featureId,
  mdnsResult,
} from './helpers/world.js';

const UID_1 = 'awtrix_3c1a2b';
const UID_2 = 'awtrix_7f00d1';
const HOST_3 = '192.0.2.12';

const feature = (world, key, uid = UID_1) => {
  const device = world.gladys.devices.find((d) => d.external_id === deviceId(world.gladys, uid));
  return [device, device.features.find((f) => f.external_id === featureId(world.gladys, key, uid))];
};

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('a typed address: one device, its states, a local transport, connected', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.name, 'AWTRIX 3c1a2b');
  assert.equal(device.external_id, deviceId(w.gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [
    { name: 'AWTRIX_HOST', value: HOST_1 },
    { name: 'AWTRIX_FIRMWARE', value: '0.98' },
  ]);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'display')), 1);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'brightness')), 38);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'auto_brightness')), 1);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'current_app')), 'Time');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'temperature')), 24);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'humidity')), 41);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'illuminance')), 34);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'battery')), 82);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'wifi_signal')), -61);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'uptime')), 24);
  assert.deepEqual(w.fake.transports, [
    { device_external_id: deviceId(w.gladys), transport: 'local' },
  ]);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(w.fake.scans, [], 'discovery off: no mDNS scan');
});

test('only the values that changed are published again', async (t) => {
  const clock = new FakeAwtrix();
  const w = await world(t, { clocks: { [HOST_1]: clock } });
  const before = w.fake.states.length;
  await w.hub.cycle();
  assert.equal(w.fake.states.length, before, 'nothing changed, nothing sent');
  clock.stats.temp = 25;
  clock.stats.app = 'Date';
  await w.hub.cycle();
  assert.deepEqual(
    w.fake.states
      .slice(before)
      .map((s) => [s.device_feature_external_id.split(':').pop(), s.state ?? s.text]),
    [
      ['current_app', 'Date'],
      ['temperature', 25],
    ],
  );
});

test('a clock found by mDNS, and the same clock typed: one device, at the typed address', async (t) => {
  const a = new FakeAwtrix();
  const b = new FakeAwtrix({ stats: 'stats-diy-no-sensor-0.97' });
  const w = await world(t, {
    clocks: { [HOST_1]: a, [HOST_2]: b },
    config: { hosts: HOST_1, discovery: true, language: 'en' },
    mdns: [mdnsResult(a, HOST_1), mdnsResult(b, HOST_2), { name: 'printer', txt: ['ty=laser'] }],
  });
  assert.deepEqual(w.fake.scans, [{ type: 'mdns', timeout_seconds: 5 }]);
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.params[0].value]),
    [
      ['AWTRIX 3c1a2b', HOST_1],
      ['AWTRIX 7f00d1', HOST_2],
    ],
  );
  const diy = devices[1];
  assert.ok(!diy.features.some((f) => /temperature|humidity|battery/.test(f.external_id)));
});

test('an mDNS announcement of another firmware, or without IPv4, is ignored', async (t) => {
  const a = new FakeAwtrix();
  const w = await world(t, {
    clocks: { [HOST_1]: a },
    config: { hosts: '', discovery: true },
    mdns: [
      mdnsResult(a, HOST_1, { type: 'awtrixng' }),
      { ...mdnsResult(a, HOST_1), addresses: ['fe80::1'] },
    ],
  });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.equal(w.fake.connectionStatus.connected, false);
});

test('an mDNS clock on another port is read there', async (t) => {
  const a = new FakeAwtrix();
  const w = await world(t, {
    clocks: { [`${HOST_1}:8080`]: a },
    config: { hosts: '', discovery: true },
    mdns: [mdnsResult(a, HOST_1, { port: 8080 })],
  });
  assert.equal(w.fake.discoveredDevices[0].params[0].value, `${HOST_1}:8080`);
});

test('a clock found by mDNS that changes address is followed, same device', async (t) => {
  const clock = createClock();
  const b = new FakeAwtrix({ stats: 'stats-diy-no-sensor-0.97' });
  const w = await world(t, {
    clock,
    clocks: { [HOST_2]: b },
    config: { hosts: '', discovery: true, language: 'en' },
    mdns: [mdnsResult(b, HOST_2)],
  });
  await createAll(w);
  const id = deviceId(w.gladys, UID_2);

  // New DHCP lease: the clock moves to HOST_3, mDNS announces it there.
  w.network.clocks.delete(HOST_2);
  w.network.clocks.set(HOST_3, b);
  w.fake.scanResults = { mdns: [mdnsResult(b, HOST_3)] };

  await w.hub.cycle(); // blip
  await w.hub.cycle(); // down; scanned less than 10 minutes ago
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(w.fake.scans.length, 1);

  clock.advance(10 * 60_000);
  await w.hub.cycle(); // scans again, reads the new address
  assert.equal(w.fake.scans.length, 2);
  assert.deepEqual(w.fake.transports.at(-1), { device_external_id: id, transport: 'local' });
  const device = w.fake.discoveredDevices.find((d) => d.external_id === id);
  assert.equal(device.params[0].value, HOST_3);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a typed address that does not answer: the status says so, no device', async (t) => {
  const w = await world(t, { config: { hosts: `${HOST_1}, ${HOST_3}`, language: 'fr' } });
  assert.equal(w.fake.discoveredDevices.length, 1);
  assert.deepEqual(w.fake.connectionStatus, {
    connected: true,
    message: {
      en: '192.0.2.12: does not answer',
      fr: '192.0.2.12 : ne répond pas',
      de: '192.0.2.12: antwortet nicht',
      es: '192.0.2.12: no responde',
    },
  });
});

test('AWTRIX NG and wrong credentials are named in the status', async (t) => {
  const w = await world(t, {
    clocks: {
      [HOST_1]: new FakeAwtrix({ kind: 'ng' }),
      [HOST_2]: new FakeAwtrix({ username: 'admin', password: 'right' }),
    },
    config: { hosts: `${HOST_1},${HOST_2}`, username: 'admin', password: 'wrong' },
  });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(
    w.fake.connectionStatus.message.en,
    '192.0.2.10: AWTRIX NG firmware: not supported, AWTRIX 3 only · 192.0.2.11: username or password refused',
  );

  // The right password typed in the configuration: new clients, it works.
  await w.fake.configUpdated({ hosts: HOST_2, username: 'admin', password: 'right' });
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(w.fake.discoveredDevices[0].external_id, deviceId(w.gladys, UID_1));
});

test('nothing configured, an address not understood', async (t) => {
  const empty = await world(t, { config: { discovery: false } });
  assert.deepEqual(
    empty.fake.connectionStatus.message.en,
    'No AWTRIX clock found: enter its address in the configuration.',
  );
  const invalid = await world(t, { config: { hosts: 'https://192.0.2.10', discovery: false } });
  assert.equal(
    invalid.fake.connectionStatus.message.en,
    'Address not understood, e.g. 192.168.1.50',
  );
});

test('a clock that stops answering: unreachable after two readings, then back', async (t) => {
  const clock = new FakeAwtrix();
  const w = await world(t, { clocks: { [HOST_1]: clock } });
  clock.online = false;
  await w.hub.cycle();
  assert.equal(w.fake.transports.length, 1, 'one failure is a blip');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  await w.hub.cycle();
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.connectionStatus.message.en, 'AWTRIX 3c1a2b: does not answer');
  clock.online = true;
  await w.hub.cycle();
  assert.equal(w.fake.transports.at(-1).transport, 'local');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('the features seen once stay, across a restart while the clock is off', async (t) => {
  const clock = new FakeAwtrix();
  const first = await createWorld({ clocks: { [HOST_1]: clock } });
  await first.app.stop();
  const saved = JSON.parse(await readFile(join(first.dataDir, 'awtrix-state.json'), 'utf8'));
  assert.deepEqual(saved, {
    clocks: {
      [UID_1]: {
        host: HOST_1,
        source: 'config',
        capabilities: { temperature: true, humidity: true, battery: true },
        version: '0.98',
      },
    },
  });
  assert.ok(!JSON.stringify(saved).includes('password'));

  clock.online = false;
  const second = await world(t, { clocks: { [HOST_1]: clock }, dataDir: first.dataDir });
  const [device] = second.fake.discoveredDevices;
  assert.equal(device.features.length, 11, 'same structure as before the restart');

  // The sensor reading turned off: the features stay (no "Update" proposal).
  clock.online = true;
  delete clock.stats.temp;
  delete clock.stats.hum;
  await second.hub.cycle();
  assert.equal(second.fake.discoveredDevices[0].features.length, 11);
});

test('a sensor that appears adds its feature', async (t) => {
  const clock = new FakeAwtrix({ stats: 'stats-diy-no-sensor-0.97' });
  const w = await world(t, { clocks: { [HOST_1]: clock } });
  assert.equal(w.fake.discoveredDevices[0].features.length, 8);
  clock.stats.temp = 21;
  await w.hub.cycle();
  const features = w.fake.discoveredDevices[0].features;
  assert.equal(features.length, 9);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'temperature', UID_2)), 21);
});

test('the display, the brightness and the automatic brightness are controlled', async (t) => {
  const clock = new FakeAwtrix();
  const w = await world(t, { clocks: { [HOST_1]: clock } });
  await createAll(w);

  assert.equal((await w.fake.setValue(...feature(w, 'display'), 0)).success, true);
  assert.equal(clock.stats.matrix, false);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'display')), 0);

  assert.equal((await w.fake.setValue(...feature(w, 'brightness'), 50)).success, true);
  assert.equal(clock.stats.bri, 128);
  assert.equal(clock.settings.ABRI, false, 'a fixed brightness turns the automatic one off');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'brightness')), 50);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'auto_brightness')), 0);

  assert.equal((await w.fake.setValue(...feature(w, 'auto_brightness'), 1)).success, true);
  assert.equal(clock.settings.ABRI, true);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'auto_brightness')), 1);

  assert.equal((await w.fake.setValue(...feature(w, 'next_app'), 1)).success, true);
  assert.equal(clock.stats.app, 'Date');
  await w.hub.cycle();
  assert.equal(w.fake.lastState(featureId(w.gladys, 'current_app')), 'Date');

  const sensor = await w.fake.setValue(...feature(w, 'temperature'), 1);
  assert.equal(sensor.success, false);
});

test('a command to a clock that does not answer fails with its name and reason', async (t) => {
  const clock = new FakeAwtrix();
  const w = await world(t, {
    clocks: { [HOST_1]: clock },
    config: { hosts: HOST_1, language: 'fr' },
  });
  await createAll(w);
  clock.online = false;
  const ack = await w.fake.setValue(...feature(w, 'display'), 0);
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'AWTRIX 3c1a2b : ne répond pas');
});

test('a device added later receives every state at once', async (t) => {
  const w = await world(t);
  const id = deviceId(w.gladys);
  const before = w.fake.states.length;
  await w.hub.cycle();
  assert.equal(w.fake.states.length, before);
  const refreshes = w.fake.widgetRefreshes.length;
  await createAll(w);
  const sent = w.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.equal(sent.length, 10, 'every feature but the push button');
  assert.ok(sent.every((externalId) => externalId.startsWith(`${id}:`)));
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);
});

test('Gladys reconnecting gets every state again', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.equal(w.fake.states.length, before + 10);
});

test('the onPoll of Gladys is a fallback: skipped right after a reading', async (t) => {
  const clock = createClock();
  const fake = new FakeAwtrix();
  const w = await world(t, { clock, clocks: { [HOST_1]: fake } });
  await createAll(w);
  const reads = () => fake.requests.filter((r) => r.path === '/api/stats').length;
  const before = reads();
  assert.equal((await w.fake.poll(w.gladys.devices[0])).success, true);
  assert.equal(reads(), before, 'read less than an interval ago');
  clock.advance(60_000);
  await w.fake.poll(w.gladys.devices[0]);
  assert.equal(reads(), before + 1);
});

test('an unchanged value is sent again after the heartbeat', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 15, 10) });
  const w = await world(t);
  const before = w.fake.states.length;
  await w.hub.cycle();
  assert.equal(w.fake.states.length, before);
  t.mock.timers.tick(6 * 60 * 60_000);
  await w.hub.cycle();
  assert.equal(w.fake.states.length, before + 10, 'every value re-sent');
});

test('Search in the Discovery tab scans and publishes', async (t) => {
  const a = new FakeAwtrix();
  const w = await world(t, {
    clocks: { [HOST_1]: a },
    config: { hosts: '', discovery: true },
  });
  assert.deepEqual(w.fake.discoveredDevices, []);
  w.fake.scanResults = { mdns: [mdnsResult(a, HOST_1)] };
  await w.fake.scanRequest();
  assert.equal(w.fake.discoveredDevices.length, 1);
  assert.equal(w.fake.scans.length, 2);
});

test('an mDNS scan refused by Gladys leaves the typed addresses working', async (t) => {
  const w = await createWorld({ connect: false, config: { hosts: HOST_1, discovery: true } });
  t.after(() => w.app.stop());
  w.gladys.scanNetwork = async () => {
    throw new Error('403 network_discovery not declared');
  };
  await w.gladys.connect();
  await w.app.ready;
  assert.equal(w.fake.discoveredDevices.length, 1);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('Test the connection reports every clock', async (t) => {
  const w = await world(t, { config: { hosts: `${HOST_1}, ${HOST_3}, ftp://x`, language: 'en' } });
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.en,
    [
      'AWTRIX 3c1a2b (192.0.2.10): OK, firmware 0.98, app Time',
      '192.0.2.12: does not answer',
      'Address not understood, e.g. 192.168.1.50',
      '0 clock(s) found on the network (mDNS)',
    ].join('\n'),
  );
  assert.match(ack.data.message.de, /Firmware 0\.98, App Time/);
});
