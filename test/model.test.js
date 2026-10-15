import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLINK_MS,
  FADE_MS,
  MAX_TEXT_LENGTH,
  brightnessPercent,
  brightnessValue,
  buildCustomApp,
  buildIndicator,
  buildNotification,
  cleanAppName,
  cleanIcon,
  cleanSwitchName,
  cleanText,
  indicatorNumber,
  parseSettings,
  parseStats,
  soundKeys,
} from '../src/awtrix/model.js';
import { fixture } from './helpers/fakeAwtrix.js';

test('the statistics of an Ulanzi TC001', () => {
  assert.deepEqual(parseStats(fixture('stats-ulanzi-0.98')), {
    uid: 'awtrix_3c1a2b',
    version: '0.98',
    app: 'Time',
    matrix: true,
    brightness: 98,
    lux: 34,
    temperature: 24,
    humidity: 41,
    battery: 82,
    wifiSignal: -61,
    uptimeSeconds: 86512,
    indicators: [false, false, false],
  });
});

test('the statistics of a DIY build without sensor nor battery', () => {
  const stats = parseStats(fixture('stats-diy-no-sensor-0.97'));
  assert.equal(stats.temperature, null);
  assert.equal(stats.humidity, null);
  assert.equal(stats.battery, null, 'type 1: no battery');
  assert.deepEqual(stats.indicators, [true, false, false]);
});

test('an answer without uid is not AWTRIX 3 statistics', () => {
  assert.equal(parseStats({ bri: 10 }), null);
  assert.equal(parseStats({ uid: 'a b' }), null);
  assert.equal(parseStats([]), null);
  assert.equal(parseStats('OK'), null);
});

test('the settings followed by Gladys', () => {
  assert.deepEqual(parseSettings(fixture('settings-0.98')), { autoBrightness: true });
  assert.deepEqual(parseSettings({}), { autoBrightness: null });
  assert.equal(parseSettings(null), null);
});

test('brightness: AWTRIX 0-255 as 0-100 %', () => {
  assert.equal(brightnessPercent(255), 100);
  assert.equal(brightnessPercent(98), 38);
  assert.equal(brightnessValue(100), 255);
  assert.equal(brightnessValue(38), 97);
  assert.equal(brightnessValue(150), 255);
  assert.equal(brightnessValue(-3), 0);
});

test('a notification: text, color, icon, duration, scrolling, sound, hold, wakeup', () => {
  assert.deepEqual(
    buildNotification({
      text: '  Door\nopen  ',
      color: 'red',
      icon: '2422',
      duration: '15',
      scroll: 'whole_text',
      sound: 'beep:d=16,o=6,b=120:c,e',
      hold: true,
      wakeup: true,
    }),
    {
      text: 'Door open',
      duration: 15,
      color: '#FF0000',
      rtttl: 'beep:d=16,o=6,b=120:c,e',
      icon: '2422',
      pushIcon: 2,
      repeat: 1,
      hold: true,
      wakeup: true,
    },
  );
  assert.deepEqual(buildNotification({ text: 'Hi', scroll: 'off', color: 'rainbow' }), {
    text: 'Hi',
    duration: 10,
    rainbow: true,
    noScroll: true,
  });
  assert.deepEqual(buildNotification({ text: 'Hi', scroll: 'duration', color: 'default' }), {
    text: 'Hi',
    duration: 10,
  });
  assert.equal(buildNotification({ text: '   ' }), null);
  assert.equal(buildNotification({}), null);
  assert.equal(buildNotification({ text: 'x', duration: 99999 }).duration, 3600);
  assert.equal(buildNotification({ text: 'x', duration: 0 }).duration, 1);
});

test('texts, icons, sounds and app names are cleaned', () => {
  assert.equal(cleanText('a'.repeat(900)).length, MAX_TEXT_LENGTH);
  assert.equal(cleanText(21.5), '21.5');
  assert.equal(cleanText('a\u0007b'), 'a b');
  assert.equal(cleanIcon(' 2422 '), '2422');
  assert.equal(cleanIcon(2422), '2422');
  assert.equal(cleanIcon('../etc'), null);
  assert.deepEqual(soundKeys('alarm'), { sound: 'alarm' });
  assert.deepEqual(soundKeys('0001'), { sound: '0001' });
  assert.deepEqual(soundKeys('x:d=4,o=5,b=100:c'), { rtttl: 'x:d=4,o=5,b=100:c' });
  assert.deepEqual(soundKeys('a/b'), {});
  assert.deepEqual(soundKeys(''), {});
  assert.equal(cleanAppName(' outdoor temp '), 'outdoor_temp');
  assert.equal(cleanAppName('time'), null, 'never shadow a built-in app');
  assert.equal(cleanAppName('a/b'), null);
  assert.equal(cleanAppName(''), null);
  assert.equal(cleanSwitchName('Time'), 'Time');
  assert.equal(cleanSwitchName('a?b'), null);
});

test('a custom app: text, progress, lifetime', () => {
  assert.deepEqual(
    buildCustomApp({
      text: '21.5 °C',
      icon: '2422',
      color: 'cyan',
      progress: 42.4,
      lifetime_minutes: 30,
    }),
    { text: '21.5 °C', color: '#00FFFF', icon: '2422', progress: 42, lifetime: 1800 },
  );
  assert.deepEqual(buildCustomApp({ text: 'x', progress: 140, lifetime_minutes: 0 }), {
    text: 'x',
    progress: 100,
  });
  assert.deepEqual(buildCustomApp({ text: 'x', progress: '' }), { text: 'x' });
  assert.equal(buildCustomApp({ text: '' }), null);
});

test('an indicator: off, steady, blinking, fading', () => {
  assert.deepEqual(buildIndicator({ color: 'off' }), {});
  assert.deepEqual(buildIndicator({}), {});
  assert.deepEqual(buildIndicator({ color: 'green' }), { color: '#00FF00' });
  assert.deepEqual(buildIndicator({ color: 'red', effect: 'blink' }), {
    color: '#FF0000',
    blink: BLINK_MS,
  });
  assert.deepEqual(buildIndicator({ color: 'blue', effect: 'fade' }), {
    color: '#0000FF',
    fade: FADE_MS,
  });
  assert.equal(indicatorNumber('2'), 2);
  assert.equal(indicatorNumber(4), null);
  assert.equal(indicatorNumber(undefined), null);
});
