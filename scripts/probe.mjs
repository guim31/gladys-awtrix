#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of a real AWTRIX 3 clock, with the integration's own client:
//
//   node scripts/probe.mjs <ip-or-host>
//   AWTRIX_USER=admin AWTRIX_PASSWORD=... node scripts/probe.mjs 192.168.1.50
//
// It reads GET /api/stats and GET /api/settings only — no command, nothing
// written on the clock — and prints what the integration understands of them:
// the parsed statistics, the features the device would get and their values.
// The credentials come from the environment, never from the command line,
// and are never printed. The uid is printed shortened.
// -----------------------------------------------------------------------------

import { AwtrixClient } from '../src/awtrix/client.js';
import { parseHost } from '../src/config.js';
import { buildDevice, capabilitiesOf, clockStates } from '../src/devices.js';

const [raw] = process.argv.slice(2);
const host = parseHost(raw ?? '');
if (!host) {
  console.error(
    'Usage: node scripts/probe.mjs <ip-or-host>   (AWTRIX_USER / AWTRIX_PASSWORD if needed)',
  );
  process.exit(2);
}

const client = new AwtrixClient({
  host,
  username: process.env.AWTRIX_USER ?? '',
  password: process.env.AWTRIX_PASSWORD ?? '',
});

// The SDK's externalIds, without a Gladys: enough to name the features.
const gladys = {
  externalIds: (type, id) => ({
    device: `ext:probe:${type}:${id}`,
    feature: (key) => `ext:probe:${type}:${id}:${key}`,
  }),
};

const short = (uid) => `${uid.slice(0, 9)}…`;

try {
  const stats = await client.getStats();
  console.log(`GET /api/stats: AWTRIX 3, firmware ${stats.version}, uid ${short(stats.uid)}`);
  console.log(JSON.stringify({ ...stats, uid: short(stats.uid) }, null, 2));

  let settings = null;
  try {
    settings = await client.getSettings();
    console.log(`GET /api/settings: ${JSON.stringify(settings)}`);
  } catch (err) {
    console.log(`GET /api/settings failed (${err.kind}: ${err.message})`);
  }

  const clock = {
    uid: stats.uid,
    host,
    version: stats.version,
    capabilities: capabilitiesOf(stats),
    stats,
    settings,
  };
  const device = buildDevice(gladys, clock, 'en');
  const values = new Map(
    clockStates(gladys, clock).map((s) => [s.device_feature_external_id, s.text ?? s.state]),
  );
  console.log(`\nDevice "${device.name}", ${device.features.length} features:`);
  for (const feature of device.features) {
    const value = values.get(feature.external_id);
    console.log(
      `  ${feature.name.padEnd(24)} ${feature.category}/${feature.type}  ${value ?? '-'}`,
    );
  }
} catch (err) {
  console.error(`Probe failed: ${err.kind ?? 'error'}: ${err.message}`);
  process.exit(1);
}
