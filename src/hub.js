// -----------------------------------------------------------------------------
// The AWTRIX hub: the clocks, read on a timer of the container (the interval
// chosen in the configuration), their states published to Gladys when they
// change, and the commands of the devices, the widget and the scene actions.
//
// Where the clocks come from:
//   - the addresses typed in the configuration;
//   - the clocks announcing `_awtrix._tcp` in mDNS, when discovery is on: the
//     Gladys core scans for the container (bridge network, no multicast),
//     at startup, on "Search" in the Discovery tab, and when a clock found
//     that way stops answering (a new DHCP address), at most every 10 minutes.
// A clock is known by its uid (/api/stats): two addresses of the same clock
// make one device, and a typed address wins over the mDNS one.
//
// Gladys never polls these devices (should_poll: false, see src/devices.js):
// the core cannot be trusted to (GladysAssistant/Gladys#3198), and the
// intervals offered go up to 5 minutes, beyond its fixed list. onPoll stays
// as a fallback (src/app.js).
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger, parseMdnsTxt } from '@gladysassistant/integration-sdk';
import { AwtrixClient, ERROR_KINDS } from './awtrix/client.js';
import { brightnessValue } from './awtrix/model.js';
import {
  FEATURE_KEYS,
  buildDevice,
  capabilitiesOf,
  clockName,
  clockStates,
  deviceIds,
  featureKeyOf,
} from './devices.js';
import { createIssueLog } from './issues.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'awtrix-hub' });

export const WIDGET_KEY = 'awtrix';
export const MDNS_SERVICE = '_awtrix._tcp';

export const HUB_TIMINGS = {
  // A clock that fails once is read again this soon, to tell a blip from an outage.
  retryMs: 15_000,
  // Failures in a row before a clock counts as unreachable (badge, status, logs).
  downAfterFailures: 2,
  // A clock found by mDNS that stops answering: scan again, at most this often.
  rescanMs: 10 * 60_000,
  // mDNS scan length (the core caps it at 30 s).
  scanSeconds: 5,
  // Read the current app again this long after "next app": the transition
  // between two apps takes about half a second.
  afterNextAppMs: 1500,
  // Unchanged values are sent again this often: Gladys shows "no recent
  // value" past 48 h, the integration rules ask for 12 h at most.
  heartbeatMs: 6 * 60 * 60_000,
  // The core's onPoll (fallback) skips a clock read this recently.
  pollGap: 0.9,
};

const SOURCES = Object.freeze({ CONFIG: 'config', MDNS: 'mdns' });

const credentials = (config) => JSON.stringify([config.username, config.password]);

export class AwtrixHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/awtrix/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    /** Every clock met, by uid: { uid, host, source, capabilities, version, stats, settings, ... } */
    this.clocks = new Map();
    /** Clocks announced in mDNS: uid → host. */
    this.discovered = new Map();
    /** Errors of typed addresses that never answered as a clock: host → error. */
    this.hostErrors = new Map();
    /** HTTP clients, by host (one request at a time per clock). */
    this.clients = new Map();
    this.credentials = null;
    this.transports = new Map();
    this.connection = null;
    this.widgetSignature = null;
    this.issues = createIssueLog(logger);
    this.pollTimer = null;
    this.cycling = null;
    this.lastScanAt = null;
    this.scanning = null;
    this.mdnsStatus = null;
    this.stopped = false;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    for (const [uid, entry] of Object.entries(saved.clocks ?? {})) {
      if (!entry || typeof entry.host !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(uid)) {
        continue;
      }
      const source = entry.source === SOURCES.MDNS ? SOURCES.MDNS : SOURCES.CONFIG;
      this.clocks.set(uid, this.newClock(uid, entry.host, source, entry));
      if (source === SOURCES.MDNS) {
        this.discovered.set(uid, entry.host);
      }
    }
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.transports.clear();
    this.connection = null;
    this.gladys.forgetPublishedStates();
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    if (this.credentials !== credentials(config)) {
      // New credentials: new clients (the old ones keep the old header).
      this.credentials = credentials(config);
      this.clients.clear();
    }
    for (const host of [...this.hostErrors.keys()]) {
      if (!config.hosts.includes(host)) {
        this.hostErrors.delete(host);
      }
    }
    await this.publishDevices();
    if (config.discovery) {
      await this.scan();
    }
    await this.cycle({ force: true });
    this.schedulePoll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    for (const clock of this.clocks.values()) {
      clearTimeout(clock.retryTimer);
      clearTimeout(clock.refreshTimer);
    }
    await this.store.flush();
  }

  newClock(uid, host, source, saved = {}) {
    return {
      uid,
      host,
      source,
      capabilities: {
        temperature: saved.capabilities?.temperature === true,
        humidity: saved.capabilities?.humidity === true,
        battery: saved.capabilities?.battery === true,
      },
      version: typeof saved.version === 'string' ? saved.version : null,
      stats: null,
      settings: null,
      reachable: null,
      error: null,
      failures: 0,
      readAt: null,
      retryTimer: null,
      refreshTimer: null,
    };
  }

  saveClocks() {
    const clocks = {};
    for (const clock of this.clocks.values()) {
      clocks[clock.uid] = {
        host: clock.host,
        source: clock.source,
        capabilities: clock.capabilities,
        version: clock.version,
      };
    }
    return this.store.save({ clocks });
  }

  client(host) {
    let client = this.clients.get(host);
    if (!client) {
      client = new AwtrixClient({
        host,
        username: this.config.username,
        password: this.config.password,
        request: this.request,
      });
      this.clients.set(host, client);
    }
    return client;
  }

  // --- Which clocks are read -----------------------------------------------------

  /**
   * The addresses to read: the typed ones, then the mDNS ones of the clocks
   * not already reached through a typed address.
   * @returns {Array<{ host: string, source: string }>}
   */
  targets() {
    const typed = this.config.hosts;
    const list = typed.map((host) => ({ host, source: SOURCES.CONFIG }));
    if (!this.config.discovery) {
      return list;
    }
    // A clock that answers on a typed address is read there. One that does
    // not (its address changed) is read where mDNS last saw it.
    const reachedByTyped = new Set(
      [...this.clocks.values()]
        .filter((clock) => typed.includes(clock.host) && clock.reachable !== false)
        .map((clock) => clock.uid),
    );
    for (const [uid, host] of this.discovered) {
      if (!reachedByTyped.has(uid) && !list.some((target) => target.host === host)) {
        list.push({ host, source: SOURCES.MDNS });
      }
    }
    return list;
  }

  /** The clocks read now, with a known uid. */
  activeClocks() {
    const hosts = new Set(this.targets().map((target) => target.host));
    return [...this.clocks.values()].filter((clock) => hosts.has(clock.host));
  }

  clockByDevice(deviceExternalId) {
    return (
      this.activeClocks().find(
        (clock) => deviceIds(this.gladys, clock.uid).device === deviceExternalId,
      ) ?? null
    );
  }

  label(clock) {
    return `${clockName(clock.uid)} (${clock.host})`;
  }

  // --- mDNS discovery (mediated by the core) ------------------------------------

  /** Ask the core for the clocks announced in mDNS. Never throws. */
  scan() {
    this.scanning ??= this.runScan().finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  async runScan() {
    this.lastScanAt = this.now();
    let results;
    try {
      results = await this.gladys.scanNetwork('mdns', {
        timeoutSeconds: this.timings.scanSeconds,
      });
    } catch (err) {
      // A Gladys without mediated discovery, a scan already running (429)...
      this.mdnsStatus = 'failed';
      this.issues.fail('mdns', `mDNS scan failed (${err.message}): use the addresses instead`);
      return 0;
    }
    this.mdnsStatus = 'ok';
    this.issues.ok('mdns', 'mDNS scan works again');
    let found = 0;
    for (const service of Array.isArray(results) ? results : []) {
      const announced = this.parseAnnouncement(service);
      if (!announced) {
        continue;
      }
      found += 1;
      const known = this.discovered.get(announced.uid);
      if (known !== announced.host) {
        logger.debug(`mDNS: ${announced.uid} at ${announced.host}`);
        this.discovered.set(announced.uid, announced.host);
      }
    }
    logger.debug(`mDNS scan: ${found} AWTRIX 3 clock(s)`);
    return found;
  }

  /** One mDNS result as `{ uid, host }`, null when it is not an AWTRIX 3 clock. */
  parseAnnouncement(service) {
    if (!service || typeof service !== 'object') {
      return null;
    }
    const txt = parseMdnsTxt(Array.isArray(service.txt) ? service.txt : []);
    // AWTRIX 3 announces `type=awtrix3`; anything else (AWTRIX NG...) is not
    // this integration's.
    if (txt.type !== undefined && txt.type !== 'awtrix3') {
      return null;
    }
    const uid = typeof txt.id === 'string' ? txt.id : '';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(uid)) {
      return null;
    }
    const addresses = Array.isArray(service.addresses) ? service.addresses : [];
    const address = addresses.find((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a));
    if (!address) {
      return null;
    }
    const port = Number(service.port);
    return {
      uid,
      host: Number.isInteger(port) && port > 0 && port !== 80 ? `${address}:${port}` : address,
    };
  }

  // --- Reading the clocks ----------------------------------------------------------

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.cycle();
        this.issues.ok('cycle');
      } catch (err) {
        this.issues.fail('cycle', `Reading cycle failed (${err.message})`);
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  /**
   * Read every clock once. Concurrent calls share the cycle in progress
   * (a forced one runs again after it).
   */
  async cycle({ force = false } = {}) {
    while (this.cycling && force) {
      await this.cycling.catch(() => {});
    }
    if (this.cycling) {
      return this.cycling;
    }
    this.cycling = this.runCycle().finally(() => {
      this.cycling = null;
    });
    return this.cycling;
  }

  async runCycle() {
    await Promise.all(this.targets().map((target) => this.readHost(target)));
    await this.rescanIfLost();
    await this.afterChanges();
  }

  /** Read one address and apply what it answers. */
  async readHost({ host, source }) {
    const client = this.client(host);
    let stats;
    let settings;
    try {
      stats = await client.getStats();
      settings = await client.getSettings().catch((err) => {
        logger.debug(`${host}: settings not read (${err.message})`);
        return null;
      });
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      const clock = [...this.clocks.values()].find((c) => c.host === host);
      if (clock) {
        await this.applyFailure(clock, err);
      } else {
        this.hostFailure(host, err);
      }
      return;
    }
    await this.applySuccess(host, source, stats, settings);
  }

  hostFailure(host, err) {
    const previous = this.hostErrors.get(host);
    this.hostErrors.set(host, { kind: err.kind, message: err.message });
    if (previous?.kind !== err.kind) {
      this.issues.drop(`host:${host}`);
    }
    this.issues.fail(`host:${host}`, `${host}: ${err.message}`);
  }

  async applySuccess(host, source, stats, settings) {
    let devicesChanged = false;
    let clock = this.clocks.get(stats.uid);
    if (!clock) {
      clock = this.newClock(stats.uid, host, source);
      this.clocks.set(stats.uid, clock);
      devicesChanged = true;
    }
    if (clock.host !== host || clock.source !== source) {
      if (clock.reachable !== null) {
        logger.info(`${clockName(clock.uid)}: now at ${host}`);
      }
      clock.host = host;
      clock.source = source;
      devicesChanged = true;
    }
    if (source === SOURCES.MDNS) {
      this.discovered.set(clock.uid, host);
    }
    if (this.hostErrors.delete(host)) {
      this.issues.ok(`host:${host}`);
    }
    const seen = capabilitiesOf(stats);
    for (const [key, present] of Object.entries(seen)) {
      if (present && !clock.capabilities[key]) {
        clock.capabilities[key] = true;
        devicesChanged = true;
      }
    }
    if (stats.version && stats.version !== clock.version) {
      clock.version = stats.version;
      devicesChanged = true;
    }

    const issue = `clock:${clock.uid}`;
    if (clock.reachable === null && !this.issues.isFailing(issue)) {
      logger.info(`${this.label(clock)}: connected (firmware ${stats.version ?? '?'})`);
    } else if (this.issues.isFailing(issue)) {
      this.issues.ok(issue, `${this.label(clock)}: answers again`);
    } else if (clock.error) {
      logger.debug(`${this.label(clock)}: answers again after a blip`);
    }
    clearTimeout(clock.retryTimer);
    clock.retryTimer = null;
    clock.reachable = true;
    clock.error = null;
    clock.failures = 0;
    clock.readAt = this.now();
    clock.stats = stats;
    clock.settings = settings ?? clock.settings;

    if (devicesChanged) {
      // The new features must exist (in the discovered device) before states.
      await this.publishDevices();
      this.saveClocks();
    }
    await this.publishStates(clock);
  }

  async applyFailure(clock, err) {
    clock.failures += 1;
    clock.readAt = this.now();
    const down = clock.failures >= this.timings.downAfterFailures;
    const changedKind = clock.error?.kind !== err.kind;
    clock.error = { kind: err.kind, message: err.message };
    // Only silence may be a blip: a refused password is not.
    if (err.kind !== ERROR_KINDS.UNREACHABLE || down) {
      clock.reachable = false;
      if (changedKind) {
        this.issues.drop(`clock:${clock.uid}`);
      }
      this.issues.fail(`clock:${clock.uid}`, `${this.label(clock)}: ${err.message}`);
    } else {
      logger.debug(`${this.label(clock)}: ${err.message} (will retry)`);
      this.scheduleRetry(clock);
    }
  }

  scheduleRetry(clock) {
    clearTimeout(clock.retryTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    clock.retryTimer = setTimeout(() => {
      clock.retryTimer = null;
      this.readClock(clock).catch((err) =>
        this.issues.fail('retry', `Retry failed (${err.message})`),
      );
    }, this.timings.retryMs);
    clock.retryTimer.unref?.();
  }

  /** Read one clock now (after a command, a retry, onPoll). */
  async readClock(clock) {
    const target = this.targets().find((t) => t.host === clock.host);
    if (!target) {
      return;
    }
    await this.readHost(target);
    await this.afterChanges();
  }

  /** A clock found by mDNS no longer answers: its address may have changed. */
  async rescanIfLost() {
    if (!this.config.discovery) {
      return;
    }
    const lost = this.activeClocks().some(
      (clock) => clock.source === SOURCES.MDNS && clock.reachable === false,
    );
    if (
      lost &&
      (this.lastScanAt === null || this.now() - this.lastScanAt >= this.timings.rescanMs)
    ) {
      const before = new Map(this.discovered);
      await this.scan();
      const moved = [...this.discovered].filter(([uid, host]) => before.get(uid) !== host);
      for (const [uid] of moved) {
        const clock = this.clocks.get(uid);
        if (clock) {
          await this.readHost({ host: this.discovered.get(uid), source: SOURCES.MDNS });
        }
      }
    }
  }

  /** The core's onPoll (fallback): reads the clock unless the timer just did. */
  async pollDevice(device) {
    const clock = this.clockByDevice(device.external_id);
    if (!clock) {
      return;
    }
    const gap = this.config.pollIntervalMs * this.timings.pollGap;
    if (clock.readAt !== null && this.now() - clock.readAt < gap) {
      logger.debug(`${this.label(clock)}: onPoll skipped, read recently`);
      return;
    }
    await this.readClock(clock);
  }

  // --- Publishing to Gladys --------------------------------------------------------------

  async publishDevices() {
    const devices = this.activeClocks().map((clock) =>
      buildDevice(this.gladys, clock, this.config.language),
    );
    try {
      // Even an empty list: the Discovery tab then shows no stale clock.
      await this.gladys.publishDiscoveredDevices(devices);
      this.issues.ok('devices', 'Devices published again');
    } catch (err) {
      this.issues.fail('devices', `Devices refused by Gladys (${err.message})`);
    }
  }

  /** "Search" in the Discovery tab: scan, publish, read. */
  async rediscover() {
    if (this.config.discovery) {
      await this.scan();
    }
    await this.cycle({ force: true });
    await this.publishDevices();
  }

  /** The user added a device: send its states now (the SDK forgot them). */
  async onDeviceCreated(device) {
    const clock = this.clockByDevice(device.external_id);
    if (!clock) {
      return;
    }
    if (clock.stats) {
      await this.publishStates(clock);
    } else {
      await this.readClock(clock);
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async publishStates(clock) {
    try {
      await this.gladys.publishChangedStates(clockStates(this.gladys, clock), {
        heartbeat: this.timings.heartbeatMs,
      });
      this.issues.ok('states', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('states', `States of ${this.label(clock)} refused (${err.message})`);
    }
  }

  async afterChanges() {
    await this.publishTransports();
    await this.publishConnectionStatus();
    const signature = JSON.stringify(
      this.activeClocks().map((clock) => [
        clock.uid,
        clock.reachable,
        clock.error?.kind ?? null,
        clock.stats?.app ?? null,
        clock.stats?.matrix ?? null,
        clock.settings?.autoBrightness ?? null,
      ]),
    );
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async publishTransports() {
    const entries = [];
    for (const clock of this.activeClocks()) {
      if (clock.reachable === null) {
        continue;
      }
      const externalId = deviceIds(this.gladys, clock.uid).device;
      const transport = clock.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
      if (this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.issues.ok('transports');
    } catch (err) {
      this.issues.fail('transports', `Transports refused by Gladys (${err.message})`);
    }
  }

  /** The problems to show: failing clocks, typed addresses that are no clock. */
  problems() {
    const list = this.activeClocks()
      .filter((clock) => clock.reachable === false && clock.error)
      .map((clock) => ({ name: clockName(clock.uid), kind: clock.error.kind }));
    // In the order of the configuration, whatever answered first.
    for (const host of this.config.hosts) {
      const error = this.hostErrors.get(host);
      if (error) {
        list.push({ name: host, kind: error.kind });
      }
    }
    return list;
  }

  /** The status under the integration name: connected while one clock answers. */
  connectionStatus() {
    const { invalidHosts } = this.config;
    const clocks = this.activeClocks();
    const problems = this.problems();
    if (clocks.length === 0 && problems.length === 0) {
      return {
        connected: false,
        message: invalidHosts.length ? CONNECTION_TEXT.invalidHost : CONNECTION_TEXT.noClock,
      };
    }
    if (problems.length === 0 && invalidHosts.length === 0) {
      return { connected: true };
    }
    const message = {};
    for (const language of Object.keys(CONNECTION_TEXT.noClock)) {
      const parts = problems.map((problem) =>
        labelled(problem.name, pick(ERROR_TEXT[problem.kind], language), language),
      );
      if (invalidHosts.length) {
        parts.push(pick(CONNECTION_TEXT.invalidHost, language));
      }
      message[language] = parts.join(' · ').slice(0, 200);
    }
    return { connected: clocks.some((clock) => clock.reachable === true), message };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.issues.ok('connection-status');
    } catch (err) {
      this.issues.fail('connection-status', `Connection status refused (${err.message})`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  /**
   * The clocks a command targets: one device, or every clock read now.
   * @param {string|null|undefined} deviceExternalId
   */
  targetClocks(deviceExternalId) {
    const clocks = this.activeClocks();
    if (clocks.length === 0) {
      throw new Error(pick(ACTION_TEXT.noClock, this.config?.language));
    }
    if (!deviceExternalId) {
      return clocks;
    }
    const clock = this.clockByDevice(deviceExternalId);
    if (!clock) {
      throw new Error(pick(ACTION_TEXT.unknownClock, this.config.language));
    }
    return [clock];
  }

  /**
   * Run a command on the targeted clocks. Resolves with the number of clocks
   * that accepted it; throws a localized message when none did.
   * @param {string|null|undefined} deviceExternalId
   * @param {string} what for the log line ("notification", "next app"...)
   * @param {(client: AwtrixClient, clock: object) => Promise} command
   */
  async run(deviceExternalId, what, command) {
    const clocks = this.targetClocks(deviceExternalId);
    const results = await Promise.all(
      clocks.map(async (clock) => {
        try {
          await command(this.client(clock.host), clock);
          logger.info(`${this.label(clock)}: ${what}`);
          return null;
        } catch (err) {
          if (!err.kind) {
            throw err;
          }
          logger.warn(`${this.label(clock)}: ${what} failed (${err.message})`);
          if (err.kind !== ERROR_KINDS.REFUSED) {
            await this.applyFailure(clock, err);
          }
          return { clock, kind: err.kind };
        }
      }),
    );
    const failures = results.filter(Boolean);
    const done = clocks.length - failures.length;
    if (failures.length) {
      await this.afterChanges();
    }
    if (done === 0) {
      const language = this.config.language;
      const [first] = failures;
      throw new Error(
        clocks.length === 1
          ? labelled(clockName(first.clock.uid), pick(ERROR_TEXT[first.kind], language), language)
          : pick(ACTION_TEXT.failed, language),
      );
    }
    return done;
  }

  /** A command that changes what the clock reports: read it again right after. */
  async runAndRead(deviceExternalId, what, command) {
    const done = await this.run(deviceExternalId, what, command);
    const clocks = this.targetClocks(deviceExternalId);
    await Promise.all(clocks.map((clock) => this.readClock(clock).catch(() => {})));
    return done;
  }

  /** Read a clock again a moment later (the app transition takes a while). */
  refreshSoon(clock, delayMs) {
    clearTimeout(clock.refreshTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    clock.refreshTimer = setTimeout(() => {
      clock.refreshTimer = null;
      this.readClock(clock).catch(() => {});
    }, delayMs);
    clock.refreshTimer.unref?.();
  }

  setPower(deviceExternalId, on) {
    return this.runAndRead(deviceExternalId, `display ${on ? 'on' : 'off'}`, (client) =>
      client.setPower(on),
    );
  }

  setBrightness(deviceExternalId, percent) {
    // A fixed brightness turns the automatic one off, or the clock overrides it.
    return this.runAndRead(deviceExternalId, `brightness ${percent} %`, (client) =>
      client.setSettings({ BRI: brightnessValue(percent), ABRI: false }),
    );
  }

  setAutoBrightness(deviceExternalId, on) {
    return this.runAndRead(
      deviceExternalId,
      `automatic brightness ${on ? 'on' : 'off'}`,
      (client) => client.setSettings({ ABRI: on }),
    );
  }

  async nextApp(deviceExternalId) {
    const done = await this.run(deviceExternalId, 'next app', (client) => client.nextApp());
    for (const clock of this.targetClocks(deviceExternalId)) {
      this.refreshSoon(clock, this.timings.afterNextAppMs);
    }
    return done;
  }

  async switchApp(deviceExternalId, name) {
    const done = await this.run(deviceExternalId, `switch to app ${name}`, (client) =>
      client.switchApp(name),
    );
    for (const clock of this.targetClocks(deviceExternalId)) {
      this.refreshSoon(clock, this.timings.afterNextAppMs);
    }
    return done;
  }

  notify(deviceExternalId, body) {
    return this.run(deviceExternalId, 'notification sent', (client) => client.notify(body));
  }

  dismissNotification(deviceExternalId) {
    return this.run(deviceExternalId, 'notification dismissed', (client) =>
      client.dismissNotification(),
    );
  }

  setCustomApp(deviceExternalId, name, body) {
    return this.run(deviceExternalId, `custom app ${name} updated`, (client) =>
      client.setCustomApp(name, body),
    );
  }

  removeCustomApp(deviceExternalId, name) {
    return this.run(deviceExternalId, `custom app ${name} removed`, (client) =>
      client.removeCustomApp(name),
    );
  }

  setIndicator(deviceExternalId, number, body) {
    const what = `indicator ${number} ${body.color ? 'on' : 'off'}`;
    return this.run(deviceExternalId, what, (client) => client.setIndicator(number, body));
  }

  /** A feature of a device controlled from Gladys. */
  async setValue(device, feature, value) {
    const clock = this.clockByDevice(device.external_id);
    const key = clock ? featureKeyOf(this.gladys, clock.uid, feature.external_id) : null;
    const number = Number(value);
    if (key === FEATURE_KEYS.DISPLAY) {
      await this.setPower(device.external_id, number === 1);
    } else if (key === FEATURE_KEYS.BRIGHTNESS && Number.isFinite(number)) {
      await this.setBrightness(device.external_id, Math.round(number));
    } else if (key === FEATURE_KEYS.AUTO_BRIGHTNESS) {
      await this.setAutoBrightness(device.external_id, number === 1);
    } else if (key === FEATURE_KEYS.NEXT_APP) {
      await this.nextApp(device.external_id);
    } else {
      throw new Error(`Feature ${feature.external_id} cannot be set to ${value}`);
    }
  }

  // --- Reports -------------------------------------------------------------------------------

  /** "Test the connection": scan, read every clock now, one line each. */
  async testConnection() {
    let found = null;
    if (this.config.discovery) {
      found = await this.scan();
    }
    await this.cycle({ force: true });
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const lines = this.activeClocks().map((clock) => {
        const name = this.label(clock);
        if (clock.reachable === false && clock.error) {
          return labelled(name, pick(ERROR_TEXT[clock.error.kind], language), language);
        }
        const parts = [text.ok];
        if (clock.version) {
          parts.push(text.firmware(clock.version));
        }
        if (clock.stats?.matrix === false) {
          parts.push(text.off);
        } else if (clock.stats?.app) {
          parts.push(text.app(clock.stats.app));
        }
        return labelled(name, parts.join(', '), language);
      });
      for (const host of this.config.hosts) {
        const error = this.hostErrors.get(host);
        if (error) {
          lines.push(labelled(host, pick(ERROR_TEXT[error.kind], language), language));
        }
      }
      if (this.config.invalidHosts.length) {
        lines.push(pick(CONNECTION_TEXT.invalidHost, language));
      }
      if (found !== null && this.mdnsStatus === 'ok') {
        lines.push(text.found(found));
      }
      if (lines.length === 0) {
        lines.push(pick(CONNECTION_TEXT.noClock, language));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }
}
