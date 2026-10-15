// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake AWTRIX clocks on a fake
// network, a temporary /data and a manual clock, with the integration wired
// on top through registerHandlers. No timer runs unless `timers: true` (with
// node:test mock timers): the tests read the clocks with `world.hub.cycle()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeAwtrix, createNetwork } from './fakeAwtrix.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const HOST_1 = '192.0.2.10';
export const HOST_2 = '192.0.2.11';

/** A manual clock, shared by the hub and the tests. */
export function createClock(start = Date.UTC(2026, 9, 15, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/** The mDNS answer of a clock, as the core relays it (scanNetwork 'mdns'). */
export function mdnsResult(fake, address, { port = 80, type = 'awtrix3' } = {}) {
  return {
    name: `${fake.uid}._awtrix._tcp.local`,
    host: `${fake.uid}.local`,
    addresses: [address],
    port,
    txt: [`id=${fake.uid}`, `name=${fake.uid}`, ...(type ? [`type=${type}`] : [])],
  };
}

/**
 * @param {object} [options]
 * @param {Record<string, FakeAwtrix>} [options.clocks] by host
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {Array} [options.mdns] raw mDNS results relayed by the core
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  clock = createClock(),
  clocks,
  config = { hosts: HOST_1, discovery: false, language: 'en' },
  devices = [],
  mdns = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-awtrix-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork(clocks ?? { [HOST_1]: new FakeAwtrix() });
  const gladys = createFakeGladys({ config, devices, scanResults: { mdns } });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, app, hub: app.hub, clock, dataDir };
}

/** External id of the device of a clock uid. */
export const deviceId = (gladys, uid = 'awtrix_3c1a2b') => gladys.externalIds('clock', uid).device;
export const featureId = (gladys, key, uid = 'awtrix_3c1a2b') =>
  gladys.externalIds('clock', uid).feature(key);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { FakeAwtrix };
