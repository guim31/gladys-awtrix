import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_HOSTS,
  normalizeConfig,
  parseHost,
  parseHosts,
} from '../src/config.js';

test('an address is an IP or a host name, with an optional port, http only', () => {
  assert.equal(parseHost('192.0.2.10'), '192.0.2.10');
  assert.equal(parseHost(' http://192.0.2.10/ '), '192.0.2.10');
  assert.equal(parseHost('http://192.0.2.10:80/screen'), '192.0.2.10');
  assert.equal(parseHost('awtrix_3c1a2b.local:8080'), 'awtrix_3c1a2b.local:8080');
  assert.equal(parseHost('https://192.0.2.10'), null, 'AWTRIX 3 serves plain HTTP only');
  assert.equal(parseHost('http://user:pass@192.0.2.10'), null, 'no credentials in an address');
  assert.equal(parseHost(''), null);
  assert.equal(parseHost(undefined), null);
});

test('the addresses are separated by commas, semicolons or spaces, without duplicates', () => {
  assert.deepEqual(parseHosts('192.0.2.10, 192.0.2.11;192.0.2.10  clock.local'), {
    hosts: ['192.0.2.10', '192.0.2.11', 'clock.local'],
    invalid: [],
  });
  assert.deepEqual(parseHosts('192.0.2.10, ftp://x'), {
    hosts: ['192.0.2.10'],
    invalid: ['ftp://x'],
  });
  const many = Array.from({ length: 15 }, (_, i) => `192.0.2.${i + 1}`).join(',');
  assert.equal(parseHosts(many).hosts.length, MAX_HOSTS);
});

test('the normalized configuration has the defaults of the manifest', () => {
  const config = normalizeConfig({});
  assert.deepEqual(config, {
    hosts: [],
    invalidHosts: [],
    discovery: true,
    username: '',
    password: '',
    pollIntervalMs: 30_000,
    language: 'fr',
  });
  assert.equal(DEFAULT_CONFIG.poll_interval, '30');
});

test('the normalized configuration reads every field', () => {
  const config = normalizeConfig({
    hosts: '192.0.2.10',
    discovery: false,
    username: ' admin ',
    password: ' secret ',
    poll_interval: 300,
    language: 'de',
  });
  assert.deepEqual(config.hosts, ['192.0.2.10']);
  assert.equal(config.discovery, false);
  assert.equal(config.username, 'admin');
  assert.equal(config.password, ' secret ', 'a password is kept as typed');
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ poll_interval: '7', language: 'it' }).pollIntervalMs, 30_000);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
  assert.equal(normalizeConfig({ discovery: 'true' }).discovery, true);
});
