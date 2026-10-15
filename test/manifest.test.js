// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  INDICATOR_COLORS,
  INDICATOR_EFFECTS,
  MAX_DURATION_SECONDS,
  MAX_LIFETIME_MINUTES,
  SCROLL_MODES,
  TEXT_COLORS,
} from '../src/awtrix/model.js';
import { DEFAULT_CONFIG, LANGUAGES, POLL_INTERVALS } from '../src/config.js';
import { MDNS_SERVICE, WIDGET_KEY } from '../src/hub.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { createWorld, deviceId } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[...(manifest.actions ?? []), ...(manifest.scene_actions ?? [])].flatMap(
    (item) => item.fields ?? [],
  ),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Manifest fields older Gladys releases reject as unknown, with the first
// release accepting them. The store validator refuses a manifest whose
// `gladys_version` minimum is lower: these tests catch it before a release.
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
// The widget button form (GladysAssistant/Gladys#3168) shipped in 5.2.0.
const WIDGET_FORM_MIN_GLADYS_VERSION = [5, 2, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionsOf = (field) => field.options.map((option) => option.value);
const sceneAction = (key) => manifest.scene_actions.find((action) => action.key === key);
const fieldOf = (action, key) => sceneAction(action).fields.find((field) => field.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, cover, local transport, notifications category, mDNS', () => {
  assert.equal(manifest.name, 'AWTRIX 3');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-awtrix:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-awtrix/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['notifications']);
  assert.deepEqual(manifest.network_discovery, [{ type: 'mdns', service: MDNS_SERVICE }]);
});

test('every manifest action has a handler', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const action of manifest.actions) {
    const ack = await world.fake.action(action.key, {});
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
  }
  assert.deepEqual(keysOf(manifest.actions), ['test_connection']);
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION));
});

test('scene actions and widgets require Gladys >= 5.1.0, the widget form 5.2.0', () => {
  assert.ok(manifest.scene_actions.length > 0);
  assert.ok(manifest.widgets.length > 0);
  assert.ok(isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION));
  assert.ok(isAtLeast(minGladysVersion(), WIDGET_FORM_MIN_GLADYS_VERSION));
});

test('no scene trigger: the buttons of the clock only reach MQTT', () => {
  // AWTRIX 3 reports its button presses over MQTT, or by an HTTP callback to
  // an address the container cannot offer. Promising a trigger would be a lie.
  assert.equal(manifest.scene_triggers, undefined);
});

test('every scene_actions key has a handler, and returns the declared outputs', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
  const world = await createWorld();
  t.after(() => world.app.stop());
  const required = {
    show_notification: { text: 'x' },
    set_custom_app: { name: 'test', text: 'x' },
    remove_custom_app: { name: 'test' },
    set_indicator: { indicator: '1', color: 'red' },
    switch_app: { name: 'Time' },
  };
  for (const action of manifest.scene_actions) {
    const defaults = Object.fromEntries(
      action.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default]),
    );
    const fields = { ...defaults, device: deviceId(world.gladys), ...required[action.key] };
    const ack = await world.fake.sceneAction(action.key, fields);
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
    assert.deepEqual(Object.keys(ack.data.outputs).sort(), keysOf(action.outputs).sort());
  }
});

test('the options of the scene fields are the ones the code knows', () => {
  for (const action of ['show_notification', 'set_custom_app']) {
    assert.deepEqual(optionsOf(fieldOf(action, 'color')), TEXT_COLORS, action);
  }
  assert.deepEqual(optionsOf(fieldOf('show_notification', 'scroll')), SCROLL_MODES);
  assert.deepEqual(optionsOf(fieldOf('set_indicator', 'color')), INDICATOR_COLORS);
  assert.deepEqual(optionsOf(fieldOf('set_indicator', 'effect')), INDICATOR_EFFECTS);
  assert.deepEqual(optionsOf(fieldOf('set_indicator', 'indicator')), ['1', '2', '3']);
  assert.equal(fieldOf('show_notification', 'duration').max, MAX_DURATION_SECONDS);
  assert.equal(fieldOf('set_custom_app', 'lifetime_minutes').max, MAX_LIFETIME_MINUTES);
});

test('no required action field without a default, except the ones a scene must fill', () => {
  // Adding a required field without default later breaks every scene: the
  // ones published now are the text and the names, which the action needs.
  for (const action of manifest.scene_actions) {
    for (const field of action.fields) {
      if (field.required && field.default === undefined) {
        assert.ok(['text', 'name'].includes(field.key), `${action.key}.${field.key}`);
      }
    }
  }
});

test('every widgets key has a handler', () => {
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
  const poll = manifest.config_schema.find((f) => f.key === 'poll_interval');
  assert.deepEqual(optionsOf(poll), POLL_INTERVALS);
  const language = manifest.config_schema.find((f) => f.key === 'language');
  assert.deepEqual(optionsOf(language), LANGUAGES);
  assert.equal(language.default, 'fr');
  const password = manifest.config_schema.find((f) => f.key === 'password');
  assert.equal(password.type, 'secret');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined, `section "${section.key}": no placeholder`);
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(!(section.key in DEFAULT_CONFIG), `section "${section.key}" stores no value`);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('no secret field in an action, a scene action or a widget', () => {
  // Gladys cannot fill a secret action field (GladysAssistant/Gladys#3154),
  // and a scene is readable by every user.
  const outsideConfig = allFields.filter((f) => !manifest.config_schema.includes(f));
  assert.ok(outsideConfig.every((f) => f.type !== 'secret'));
});

test('number fields: integer bounds and defaults (the form has no step)', () => {
  for (const field of allFields.filter((f) => f.type === 'number')) {
    for (const key of ['min', 'max', 'default']) {
      if (field[key] !== undefined) {
        assert.ok(Number.isInteger(field[key]), `${field.key}.${key}`);
      }
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('the name is short and the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});
