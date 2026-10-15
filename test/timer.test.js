// -----------------------------------------------------------------------------
// The reading timer of the container. Gladys never polls a device published
// with should_poll: false (and Gladys 5.2.x never polls the devices created
// without should_poll, GladysAssistant/Gladys#3198): the clocks must be read
// by the hub's own timer, with no onPoll at all.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FakeAwtrix,
  HOST_1,
  createAll,
  createClock,
  createWorld,
  featureId,
} from './helpers/world.js';

/** Let the timer callback and the fake network settle. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

async function timedWorld(t, fake, config = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const w = await createWorld({
    clock,
    clocks: { [HOST_1]: fake },
    config: { hosts: HOST_1, discovery: false, poll_interval: '60', ...config },
    timers: true,
  });
  t.after(() => w.app.stop());
  return { ...w, clock };
}

test('the internal timer reads the clocks without any onPoll from Gladys', async (t) => {
  const fake = new FakeAwtrix();
  const w = await timedWorld(t, fake);
  const polled = t.mock.method(w.hub, 'pollDevice');
  await createAll(w);

  const device = w.fake.discoveredDevices[0];
  assert.equal(device.should_poll, false, 'Gladys is not asked to poll');
  const reads = () => fake.requests.filter((r) => r.path === '/api/stats').length;
  const before = reads();

  for (const temp of [21, 22, 23]) {
    fake.stats.temp = temp;
    w.clock.advance(60_000);
    t.mock.timers.tick(60_000);
    await settle();
    assert.equal(w.fake.lastState(featureId(w.gladys, 'temperature')), temp);
  }
  assert.equal(reads() - before, 3, 'one reading per interval');
  assert.equal(polled.mock.callCount(), 0, 'no onPoll involved');
});

test('a failed reading is retried 15 s later, before the next interval', async (t) => {
  const fake = new FakeAwtrix();
  const w = await timedWorld(t, fake, { poll_interval: '300' });
  fake.online = false;
  t.mock.timers.tick(300_000);
  await settle();
  const failures = fake.requests.length;
  fake.online = true;
  fake.stats.app = 'Date';
  t.mock.timers.tick(15_000);
  await settle();
  assert.ok(fake.requests.length > failures, 'read again');
  assert.equal(w.fake.lastState(featureId(w.gladys, 'current_app')), 'Date');
  assert.equal(w.fake.transports.at(-1).transport, 'local', 'a blip never showed as unreachable');
});

test('the current app is read again after "next app"', async (t) => {
  const fake = new FakeAwtrix();
  const w = await timedWorld(t, fake, { poll_interval: '300' });
  await createAll(w);
  await w.fake.sceneAction('next_app', {});
  t.mock.timers.tick(1500);
  await settle();
  assert.equal(w.fake.lastState(featureId(w.gladys, 'current_app')), 'Date');
});

test('the timer stops with the integration', async (t) => {
  const fake = new FakeAwtrix();
  const w = await timedWorld(t, fake);
  await w.app.stop();
  const before = fake.requests.length;
  t.mock.timers.tick(10 * 60_000);
  await settle();
  assert.equal(fake.requests.length, before);
});
