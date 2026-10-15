// -----------------------------------------------------------------------------
// AWTRIX 3 HTTP API client (http://<clock>/api/..., documented on
// blueforcer.github.io/awtrix3, "MQTT / HTTP API"). MQTT is not needed.
//
// Authentication: when "Auth Username" is set in the clock's web interface,
// every /api route asks for HTTP Basic credentials; with an empty username
// (the default) the API is open.
//
// The clock is an ESP32 serving one request at a time: the client sends its
// requests one after the other, never in parallel.
//
// AWTRIX NG (the successor firmware, a new /api/v1 API) is not AWTRIX 3: it is
// detected and reported as such.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';
import { parseSettings, parseStats } from './model.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: off, wrong address, other network
  AUTH: 'auth', // credentials refused or missing
  NG: 'ng', // AWTRIX NG firmware: another API
  NOT_AWTRIX: 'not_awtrix', // something answers, not AWTRIX 3
  REFUSED: 'refused', // the clock refused a command (unknown app, bad payload)
  HTTP: 'http', // any other HTTP error
});

export class AwtrixError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'AwtrixError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export class AwtrixClient {
  /**
   * @param {object} options
   * @param {string} options.host `host` or `host:port`
   * @param {string} [options.username] empty: no authentication
   * @param {string} [options.password]
   * @param {Function} [options.request] HTTP seam (src/awtrix/http.js)
   * @param {number} [options.timeoutMs]
   */
  constructor({ host, username = '', password = '', request = httpRequest, timeoutMs = 5000 }) {
    this.host = host;
    this.request = request;
    this.timeoutMs = timeoutMs;
    // Built once; never logged.
    this.authorization = username
      ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      : null;
    this.queue = Promise.resolve();
  }

  /** One request at a time per clock. */
  send(method, path, options = {}) {
    const run = this.queue.then(() => this.sendNow(method, path, options));
    this.queue = run.catch(() => {});
    return run;
  }

  async sendNow(method, path, { json, body } = {}) {
    let response;
    try {
      response = await this.request(`http://${this.host}${path}`, {
        method,
        headers: this.authorization ? { authorization: this.authorization } : {},
        json,
        body,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      throw new AwtrixError(ERROR_KINDS.UNREACHABLE, err.code ? String(err.code) : err.message);
    }
    if (response.status === 401 || response.status === 403) {
      throw new AwtrixError(ERROR_KINDS.AUTH, `HTTP ${response.status}: credentials refused`, {
        status: response.status,
      });
    }
    return response;
  }

  async get(path) {
    const response = await this.send('GET', path);
    if (response.status !== 200) {
      throw new AwtrixError(ERROR_KINDS.HTTP, `GET ${path}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    return parseJson(response.body);
  }

  /**
   * A command. The clock answers `OK`, or 500/404 when it refuses the payload
   * or does not know the app.
   */
  async post(path, options) {
    const response = await this.send('POST', path, options);
    if (response.status === 200) {
      return;
    }
    if (response.status === 500 || response.status === 404) {
      throw new AwtrixError(ERROR_KINDS.REFUSED, `POST ${path}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    throw new AwtrixError(ERROR_KINDS.HTTP, `POST ${path}: HTTP ${response.status}`, {
      status: response.status,
    });
  }

  /** The statistics of the clock (src/awtrix/model.js parseStats). */
  async getStats() {
    let raw;
    try {
      raw = await this.get('/api/stats');
    } catch (err) {
      if (err.kind === ERROR_KINDS.HTTP && err.status === 404) {
        throw await this.identifyOther();
      }
      throw err;
    }
    const stats = parseStats(raw);
    if (!stats) {
      throw new AwtrixError(ERROR_KINDS.NOT_AWTRIX, 'The answer of /api/stats is not AWTRIX 3');
    }
    return stats;
  }

  /** No /api/stats: AWTRIX NG (it has /api/v1/version), or something else. */
  async identifyOther() {
    try {
      const response = await this.send('GET', '/api/v1/version');
      if (response.status === 200) {
        return new AwtrixError(ERROR_KINDS.NG, 'AWTRIX NG firmware (/api/v1), not AWTRIX 3');
      }
    } catch (err) {
      if (err.kind === ERROR_KINDS.AUTH) {
        return new AwtrixError(ERROR_KINDS.NG, 'AWTRIX NG firmware (/api/v1), not AWTRIX 3');
      }
    }
    return new AwtrixError(ERROR_KINDS.NOT_AWTRIX, 'No /api/stats at this address');
  }

  async getSettings() {
    return parseSettings(await this.get('/api/settings'));
  }

  setPower(on) {
    return this.post('/api/power', { json: { power: Boolean(on) } });
  }

  setSettings(settings) {
    return this.post('/api/settings', { json: settings });
  }

  notify(body) {
    return this.post('/api/notify', { json: body });
  }

  dismissNotification() {
    return this.post('/api/notify/dismiss');
  }

  setCustomApp(name, body) {
    return this.post(`/api/custom?name=${encodeURIComponent(name)}`, { json: body });
  }

  /** An empty body removes the custom app (and every `name0`, `name1`… of a multi-page app). */
  removeCustomApp(name) {
    return this.post(`/api/custom?name=${encodeURIComponent(name)}`, { body: '' });
  }

  setIndicator(number, body) {
    return this.post(`/api/indicator${number}`, { json: body });
  }

  nextApp() {
    return this.post('/api/nextapp');
  }

  switchApp(name) {
    return this.post('/api/switch', { json: { name } });
  }
}
