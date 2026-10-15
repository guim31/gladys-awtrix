// -----------------------------------------------------------------------------
// The scene actions, as Gladys runs them (fields resolved, defaults applied):
// what each one sends to the clocks, and how it fails.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAwtrix, HOST_1, HOST_2, createWorld, deviceId } from './helpers/world.js';

async function twoClocks(t, config = {}) {
  const a = new FakeAwtrix();
  const b = new FakeAwtrix({ stats: 'stats-diy-no-sensor-0.97' });
  const w = await createWorld({
    clocks: { [HOST_1]: a, [HOST_2]: b },
    config: { hosts: `${HOST_1},${HOST_2}`, discovery: false, language: 'en', ...config },
  });
  t.after(() => w.app.stop());
  return { ...w, a, b };
}

test('a notification goes to every clock, or to the chosen one', async (t) => {
  const w = await twoClocks(t);
  const all = await w.fake.sceneAction('show_notification', {
    text: 'Washing machine done: {{1.0.value}} min',
    color: 'green',
    icon: '2422',
    duration: 10,
    scroll: 'whole_text',
    sound: 'beep:d=16,o=6,b=120:c,e',
    hold: false,
    wakeup: true,
  });
  assert.deepEqual(all, { success: true, data: { outputs: { clocks: 2 } } });
  const expected = {
    text: 'Washing machine done: {{1.0.value}} min',
    duration: 10,
    color: '#00FF00',
    rtttl: 'beep:d=16,o=6,b=120:c,e',
    icon: '2422',
    pushIcon: 2,
    repeat: 1,
    wakeup: true,
  };
  assert.deepEqual(w.a.notifications, [expected]);
  assert.deepEqual(w.b.notifications, [expected]);

  const one = await w.fake.sceneAction('show_notification', {
    device: deviceId(w.gladys, 'awtrix_7f00d1'),
    text: 'Only here',
  });
  assert.equal(one.data.outputs.clocks, 1);
  assert.equal(w.a.notifications.length, 1);
  assert.equal(w.b.notifications.length, 2);
});

test('a notification without text, or to a clock that is gone, fails in the language set', async (t) => {
  const w = await twoClocks(t, { language: 'de' });
  const empty = await w.fake.sceneAction('show_notification', { text: '  ' });
  assert.deepEqual(empty, { success: false, error: 'Der Text ist leer.' });
  const gone = await w.fake.sceneAction('show_notification', {
    device: deviceId(w.gladys, 'awtrix_000000'),
    text: 'x',
  });
  assert.equal(gone.error, 'Diese Uhr ist für die Integration nicht mehr erreichbar.');
});

test('one clock of two off: the action still succeeds, for the other', async (t) => {
  const w = await twoClocks(t);
  w.b.online = false;
  const ack = await w.fake.sceneAction('show_notification', { text: 'x' });
  assert.deepEqual(ack.data.outputs, { clocks: 1 });
  w.a.online = false;
  const none = await w.fake.sceneAction('show_notification', { text: 'x' });
  assert.deepEqual(none, { success: false, error: 'No clock accepted the command.' });
});

test('a value kept on screen: created, updated, removed', async (t) => {
  const w = await twoClocks(t);
  const device = deviceId(w.gladys);
  await w.fake.sceneAction('set_custom_app', {
    device,
    name: 'outdoor',
    text: '12.5 °C',
    color: 'cyan',
    icon: '2422',
    progress: 40,
    lifetime_minutes: 60,
  });
  assert.deepEqual(w.a.customApps.get('outdoor'), {
    text: '12.5 °C',
    color: '#00FFFF',
    icon: '2422',
    progress: 40,
    lifetime: 3600,
  });
  await w.fake.sceneAction('set_custom_app', {
    device,
    name: 'outdoor',
    text: '13 °C',
    lifetime_minutes: 0,
  });
  assert.deepEqual(w.a.customApps.get('outdoor'), { text: '13 °C' });
  assert.equal(w.b.customApps.size, 0);

  const removed = await w.fake.sceneAction('remove_custom_app', { device, name: 'outdoor' });
  assert.equal(removed.success, true);
  assert.equal(w.a.customApps.size, 0);

  const builtin = await w.fake.sceneAction('set_custom_app', { name: 'Time', text: 'x' });
  assert.equal(builtin.success, false);
  assert.match(builtin.error, /not a built-in app/);
});

test('an indicator: on, blinking, off', async (t) => {
  const w = await twoClocks(t);
  const device = deviceId(w.gladys);
  await w.fake.sceneAction('set_indicator', {
    device,
    indicator: '3',
    color: 'red',
    effect: 'blink',
  });
  assert.deepEqual(w.a.indicators[2], { color: '#FF0000', blink: 500 });
  await w.fake.sceneAction('set_indicator', {
    device,
    indicator: '3',
    color: 'off',
    effect: 'steady',
  });
  assert.equal(w.a.indicators[2], null);
  const bad = await w.fake.sceneAction('set_indicator', { device, indicator: '4', color: 'red' });
  assert.equal(bad.success, false);
});

test('next app, show an app, dismiss a notification', async (t) => {
  const w = await twoClocks(t);
  const device = deviceId(w.gladys);
  assert.equal((await w.fake.sceneAction('next_app', { device })).success, true);
  assert.equal(w.a.stats.app, 'Date');
  assert.equal(
    (await w.fake.sceneAction('switch_app', { device, name: 'Humidity' })).success,
    true,
  );
  assert.equal(w.a.stats.app, 'Humidity');
  const unknown = await w.fake.sceneAction('switch_app', { device, name: 'Nope' });
  assert.deepEqual(unknown, {
    success: false,
    error: 'AWTRIX 3c1a2b: command refused by the clock',
  });
  assert.equal((await w.fake.sceneAction('dismiss_notification', {})).data.outputs.clocks, 2);
  assert.equal(w.a.dismissed, 1);
});

test('a refused command does not make the clock unreachable', async (t) => {
  const w = await twoClocks(t);
  await w.fake.sceneAction('switch_app', { device: deviceId(w.gladys), name: 'Nope' });
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});
