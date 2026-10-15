// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// The clocks are found two ways, which add up: the addresses typed by the
// user, and the AWTRIX clocks that announce themselves in mDNS (`_awtrix._tcp`),
// relayed by the Gladys core (the container cannot hear mDNS itself).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['15', '30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  hosts: '',
  discovery: true,
  username: '',
  password: '',
  poll_interval: '30',
  language: 'fr',
};

// More would be a misconfiguration (a pasted list of something else): each
// clock is read on every cycle.
export const MAX_HOSTS = 10;

/**
 * Parse one address typed by the user: an IP or a host name, with an
 * optional port, or the URL copied from the browser (`http://192.0.2.10/`).
 * AWTRIX 3 only serves plain HTTP.
 * @param {string} raw
 * @returns {string|null} `host` or `host:port` (port only when not 80), null when unusable
 */
export function parseHost(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params:
  // they belong in the username and password fields.
  if (url.username || url.password) {
    return null;
  }
  return url.port ? `${url.hostname}:${url.port}` : url.hostname;
}

/**
 * The list of addresses typed in the configuration: separated by commas,
 * semicolons or spaces.
 * @returns {{ hosts: string[], invalid: string[] }}
 */
export function parseHosts(raw) {
  const hosts = [];
  const invalid = [];
  const parts = typeof raw === 'string' ? raw.split(/[\s,;]+/).filter(Boolean) : [];
  for (const part of parts) {
    const host = parseHost(part);
    if (!host) {
      invalid.push(part.slice(0, 60));
    } else if (!hosts.includes(host) && hosts.length < MAX_HOSTS) {
      hosts.push(host);
    }
  }
  return { hosts, invalid };
}

const truthy = (value) => value === true || value === 'true' || value === 1 || value === '1';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const { hosts, invalid } = parseHosts(source.hosts);
  return {
    hosts,
    invalidHosts: invalid,
    // Unset (an older configuration) means the default: on.
    discovery: source.discovery === undefined ? DEFAULT_CONFIG.discovery : truthy(source.discovery),
    username: typeof source.username === 'string' ? source.username.trim() : '',
    // Passwords are kept as typed: spaces may be part of them.
    password: typeof source.password === 'string' ? source.password : '',
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
