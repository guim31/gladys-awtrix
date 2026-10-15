// -----------------------------------------------------------------------------
// The dashboard widget: its content fits the core vocabulary and budget
// (validateWidgetContent), its tiles point at features that exist, and its
// buttons reach the clocks.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildDevice } from '../src/devices.js';
import { ACTIONS } from '../src/widgets.js';
import { FakeAwtrix, HOST_1, HOST_2, createAll, createWorld, deviceId } from './helpers/world.js';

const get = async (w, settings = {}, language = 'en') => {
  const ack = await w.fake.widgetGet('awtrix', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
};

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('one clock: sensor tiles, status, four buttons — valid in every language', async (t) => {
  const w = await world(t);
  for (const language of ['en', 'fr', 'de', 'es']) {
    const content = await get(w, {}, language);
    assert.deepEqual(validateWidgetContent(content), [], language);
    assert.deepEqual(
      content.components.map((c) => c.type),
      ['value', 'value', 'status', 'button', 'button', 'button', 'button'],
    );
  }
  const content = await get(w);
  assert.deepEqual(
    content.components[2].items.map((item) => [item.label, item.value]),
    [
      ['App', 'Time'],
      ['Display', 'On'],
      ['Brightness', '38 % · auto'],
      ['Wi-Fi', '-61 dBm'],
    ],
  );
  assert.deepEqual(
    content.components.filter((c) => c.type === 'button').map((c) => c.action.key),
    [ACTIONS.MESSAGE, ACTIONS.NEXT_APP, ACTIONS.DISPLAY_OFF, ACTIONS.DISMISS],
  );
  assert.equal(content.components[0].value, 24, 'device not added yet: plain values');
});

test('once the device is added, the tiles follow its features live', async (t) => {
  const w = await world(t);
  await createAll(w);
  const content = await get(w);
  const device = buildDevice(w.gladys, w.hub.activeClocks()[0], 'en');
  const featureIds = new Set(device.features.map((f) => f.external_id));
  const bound = content.components.filter((c) => c.device_feature);
  assert.equal(bound.length, 2);
  for (const tile of bound) {
    assert.ok(featureIds.has(tile.device_feature), `${tile.device_feature} exists`);
  }
  assert.deepEqual(validateWidgetContent(content), []);
});

test('several clocks: one row each; a clock without sensor has no tile', async (t) => {
  const a = new FakeAwtrix();
  const b = new FakeAwtrix({ stats: 'stats-diy-no-sensor-0.97' });
  const w = await world(t, {
    clocks: { [HOST_1]: a, [HOST_2]: b },
    config: { hosts: `${HOST_1},${HOST_2}`, discovery: false },
  });
  a.online = false;
  await w.hub.cycle();
  await w.hub.cycle();
  const content = await get(w);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    content.components[0].items.map((item) => [item.label, item.value]),
    [
      ['AWTRIX 3c1a2b', 'Unreachable'],
      ['AWTRIX 7f00d1', 'Date'],
    ],
  );
  const diy = await get(w, { device: deviceId(w.gladys, 'awtrix_7f00d1') });
  assert.equal(diy.components[0].type, 'status');
});

test('no clock, or a clock that is gone: a message', async (t) => {
  const empty = await world(t, { config: { discovery: false } });
  const content = await get(empty, {}, 'fr');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(content.components[0].text, /saisissez son adresse/);
  const w = await world(t);
  const gone = await get(w, { device: deviceId(w.gladys, 'awtrix_000000') });
  assert.match(gone.components[0].text, /no longer reachable/);
});

test('the message form sends a notification; the other buttons reach the clock', async (t) => {
  const clock = new FakeAwtrix();
  const w = await world(t, { clocks: { [HOST_1]: clock } });
  const settings = {};
  const message = await w.fake.widgetAction(
    'awtrix',
    ACTIONS.MESSAGE,
    {},
    {
      settings,
      values: { text: 'Dinner is ready', color: 'orange', duration: 20 },
    },
  );
  assert.deepEqual(message, { success: true, data: { message: 'Message shown on 1 clock(s).' } });
  assert.deepEqual(clock.notifications, [
    { text: 'Dinner is ready', duration: 20, color: '#FF8000', repeat: 1 },
  ]);

  await w.fake.widgetAction('awtrix', ACTIONS.NEXT_APP, {}, { settings });
  assert.equal(clock.stats.app, 'Date');
  await w.fake.widgetAction('awtrix', ACTIONS.DISPLAY_OFF, {}, { settings });
  assert.equal(clock.stats.matrix, false);
  const content = await get(w);
  assert.equal(
    content.components.filter((c) => c.type === 'button')[2].action.key,
    ACTIONS.DISPLAY_ON,
  );
  await w.fake.widgetAction('awtrix', ACTIONS.DISPLAY_ON, {}, { settings });
  assert.equal(clock.stats.matrix, true);
  await w.fake.widgetAction('awtrix', ACTIONS.DISMISS, {}, { settings });
  assert.equal(clock.dismissed, 1);
});

test('a message without form values (Gladys before 5.2.0) or without text is refused', async (t) => {
  const w = await world(t, { config: { hosts: HOST_1, discovery: false, language: 'es' } });
  const old = await w.fake.widgetAction('awtrix', ACTIONS.MESSAGE, {}, { settings: {} });
  assert.equal(old.success, false);
  assert.match(old.error, /Actualice Gladys/);
  const empty = await w.fake.widgetAction(
    'awtrix',
    ACTIONS.MESSAGE,
    {},
    {
      settings: {},
      values: { text: ' ' },
    },
  );
  assert.equal(empty.error, 'El texto está vacío.');
});

test('the widget is nudged when what it shows changes, not at every reading', async (t) => {
  const clock = new FakeAwtrix();
  const w = await world(t, { clocks: { [HOST_1]: clock } });
  const before = w.fake.widgetRefreshes.length;
  clock.stats.temp = 30;
  await w.hub.cycle();
  assert.equal(w.fake.widgetRefreshes.length, before);
  clock.stats.app = 'Date';
  await w.hub.cycle();
  assert.deepEqual(w.fake.widgetRefreshes.slice(before), ['awtrix']);
});
