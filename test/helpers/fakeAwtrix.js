// -----------------------------------------------------------------------------
// In-memory AWTRIX 3 clocks, behind the `request` seam of the client
// (src/awtrix/http.js) — or behind a real local HTTP server (`serve`), for
// the end-to-end tests of the HTTP layer.
//
// Behaviors follow the AWTRIX 3 firmware (ServerManager.cpp, DisplayManager.cpp,
// 0.98): Basic authentication on every /api route when a username is set,
// `OK` on success, 500 on a payload it cannot parse or an unknown app, an
// empty body that deletes a custom app or turns an indicator off. Also: an
// AWTRIX NG clock (new /api/v1 API), something that is not a clock, a clock
// that does not answer.
// -----------------------------------------------------------------------------

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { BUILTIN_APPS } from '../../src/awtrix/model.js';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/awtrix/${name}.json`, import.meta.url), 'utf8'));

const ok = () => ({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'OK' });
const json = (body) => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const status = (code, text) => ({
  status: code,
  headers: { 'content-type': 'text/plain' },
  body: text,
});

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export class FakeAwtrix {
  /**
   * @param {object} [options]
   * @param {string} [options.stats] fixture name of /api/stats
   * @param {string} [options.username] '' (default): no authentication
   * @param {string} [options.password]
   * @param {'awtrix3'|'ng'|'other'} [options.kind]
   */
  constructor({
    stats = 'stats-ulanzi-0.98',
    username = '',
    password = '',
    kind = 'awtrix3',
  } = {}) {
    this.stats = fixture(stats);
    this.settings = fixture('settings-0.98');
    this.username = username;
    this.password = password;
    this.kind = kind;
    this.online = true;
    this.requests = [];
    this.notifications = [];
    this.customApps = new Map();
    this.indicators = [null, null, null];
    this.failNext = null; // e.g. 500
  }

  get uid() {
    return this.stats.uid;
  }

  loop() {
    return [...BUILTIN_APPS, ...this.customApps.keys()];
  }

  authorized(headers = {}) {
    if (!this.username) {
      return true;
    }
    const expected = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    return (headers.authorization ?? headers.Authorization) === expected;
  }

  /** The `request` function given to the client. */
  async handle(url, { method = 'GET', headers = {}, json: body, body: raw } = {}) {
    if (!this.online) {
      const error = new Error('connect EHOSTUNREACH');
      error.code = 'EHOSTUNREACH';
      throw error;
    }
    const { pathname, search } = new URL(url);
    const text = body !== undefined ? JSON.stringify(body) : (raw ?? '');
    return this.handleRaw(method, pathname + search, headers, text);
  }

  /** One HTTP request, as the clock sees it. */
  handleRaw(method, path, headers, text) {
    const { pathname, searchParams } = new URL(path, 'http://clock.invalid');
    this.requests.push({ method, path, body: text });
    if (this.failNext) {
      const code = this.failNext;
      this.failNext = null;
      return status(code, 'Error');
    }
    if (this.kind === 'other') {
      return status(404, 'Not Found');
    }
    if (!this.authorized(headers)) {
      return {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="Login Required"' },
        body: '',
      };
    }
    if (this.kind === 'ng') {
      if (pathname === '/api/v1/version') {
        return json({ version: '1.2.2' });
      }
      return status(404, 'Not Found');
    }

    const route = `${method} ${pathname}`;
    switch (route) {
      case 'GET /api/stats':
        return json(this.stats);
      case 'GET /api/settings':
        return json({ ...this.settings, MATP: this.stats.matrix, BRI: this.stats.bri });
      case 'GET /api/loop':
        return json(Object.fromEntries(this.loop().map((name, index) => [name, index])));
      case 'POST /api/power': {
        const payload = parse(text);
        this.stats.matrix = payload?.power === true || text === 'true' || text === '1';
        return ok();
      }
      case 'POST /api/settings': {
        const payload = parse(text) ?? {};
        if ('BRI' in payload) {
          this.stats.bri = payload.BRI;
        }
        if ('ABRI' in payload) {
          this.settings.ABRI = payload.ABRI;
        }
        if ('MATP' in payload) {
          this.stats.matrix = payload.MATP;
        }
        return ok();
      }
      case 'POST /api/notify': {
        const payload = parse(text);
        if (!payload) {
          return status(500, 'ErrorParsingJson');
        }
        this.notifications.push(payload);
        return ok();
      }
      case 'POST /api/notify/dismiss':
        this.dismissed = (this.dismissed ?? 0) + 1;
        return ok();
      case 'POST /api/custom': {
        const name = searchParams.get('name') ?? '';
        if (text === '' || text === '{}') {
          for (const key of [...this.customApps.keys()]) {
            if (key.startsWith(name)) {
              this.customApps.delete(key);
            }
          }
          return ok();
        }
        const payload = parse(text);
        if (!payload) {
          return status(500, 'ErrorParsingJson');
        }
        this.customApps.set(name, payload);
        return ok();
      }
      case 'POST /api/indicator1':
      case 'POST /api/indicator2':
      case 'POST /api/indicator3': {
        const index = Number(pathname.slice(-1)) - 1;
        if (text === '' || text === '{}') {
          this.indicators[index] = null;
          this.stats[`indicator${index + 1}`] = false;
          return ok();
        }
        const payload = parse(text);
        if (!payload) {
          return status(500, 'ErrorParsingJson');
        }
        this.indicators[index] = payload;
        this.stats[`indicator${index + 1}`] = Boolean(payload.color);
        return ok();
      }
      case 'POST /api/nextapp':
      case 'GET /api/nextapp': {
        const loop = this.loop();
        this.stats.app = loop[(loop.indexOf(this.stats.app) + 1) % loop.length];
        return ok();
      }
      case 'POST /api/switch': {
        const name = parse(text)?.name;
        if (!this.loop().includes(name)) {
          return status(500, 'FAILED');
        }
        this.stats.app = name;
        return ok();
      }
      default:
        return status(404, 'Not Found');
    }
  }

  /** The commands received (everything but the readings). */
  commands() {
    return this.requests.filter((r) => r.method !== 'GET');
  }
}

/**
 * A network of fake clocks, by host: the `request` seam of the hub. An
 * address without a clock does not answer.
 */
export function createNetwork(clocks = {}) {
  const byHost = new Map(Object.entries(clocks));
  return {
    clocks: byHost,
    async request(url, options) {
      const clock = byHost.get(new URL(url).host);
      if (!clock) {
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      return clock.handle(url, options);
    },
  };
}

/**
 * Serve a fake clock on a real HTTP server (127.0.0.1, random port).
 * @returns {Promise<{ host: string, close: () => Promise<void> }>}
 */
export async function serve(clock) {
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const answer = clock.handleRaw(
        request.method,
        request.url,
        request.headers,
        Buffer.concat(chunks).toString('utf8'),
      );
      response.writeHead(answer.status, answer.headers);
      response.end(answer.body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    host: `127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
