// -----------------------------------------------------------------------------
// What the AWTRIX 3 HTTP API answers, and what it is sent.
//
// Read (blueforcer.github.io/awtrix3, "MQTT / HTTP API", and the firmware's
// DisplayManager::getStats / getSettings, AWTRIX 3 0.98):
//   GET /api/stats    { bat, bat_raw, type, lux, ldr_raw, ram, bri, temp, hum,
//                       uptime, wifi_signal, messages, version, indicator1..3,
//                       app, uid, matrix, ip_address }
//                     `temp` and `hum` only when a sensor is read; `bat` only on
//                     the Ulanzi build (`type` 0). `temp` is always in °C (the
//                     °F setting only changes the display). `uid` is
//                     `awtrix_` + the last three bytes of the MAC: stable.
//   GET /api/settings { BRI, ABRI, MATP, ATRANS, ... }
//
// Written: notifications and custom apps (the same JSON keys), indicators.
// Every builder below only emits keys AWTRIX 3 documents, with bounded values.
// -----------------------------------------------------------------------------

export const BUILTIN_APPS = ['Time', 'Date', 'Temperature', 'Humidity', 'Battery'];

// Named colors offered in the scene actions and the widget (a scene has no
// color picker). `default` keeps the clock's global text color.
export const COLORS = Object.freeze({
  white: '#FFFFFF',
  red: '#FF0000',
  orange: '#FF8000',
  yellow: '#FFFF00',
  green: '#00FF00',
  cyan: '#00FFFF',
  blue: '#0000FF',
  purple: '#8000FF',
  pink: '#FF00FF',
});
export const TEXT_COLORS = ['default', ...Object.keys(COLORS), 'rainbow'];
export const INDICATOR_COLORS = ['off', ...Object.keys(COLORS)];
export const INDICATOR_EFFECTS = ['steady', 'blink', 'fade'];
export const SCROLL_MODES = ['whole_text', 'duration', 'off'];

// Blink and fade periods of the indicators, in milliseconds.
export const BLINK_MS = 500;
export const FADE_MS = 1500;

export const MAX_TEXT_LENGTH = 500;
export const DEFAULT_DURATION_SECONDS = 10;
export const MAX_DURATION_SECONDS = 3600;
export const MAX_LIFETIME_MINUTES = 10080; // one week

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * The clock statistics, or null when the answer is not AWTRIX 3 stats.
 * @param {unknown} raw parsed JSON of /api/stats
 */
export function parseStats(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const uid = typeof raw.uid === 'string' ? raw.uid.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(uid)) {
    return null;
  }
  const bri = finite(raw.bri);
  return {
    uid,
    version: typeof raw.version === 'string' ? raw.version.slice(0, 20) : null,
    app: typeof raw.app === 'string' && raw.app.trim() ? raw.app.trim().slice(0, 64) : null,
    matrix: typeof raw.matrix === 'boolean' ? raw.matrix : null,
    brightness: bri === null ? null : Math.max(0, Math.min(255, Math.round(bri))),
    lux: finite(raw.lux),
    temperature: finite(raw.temp),
    humidity: finite(raw.hum),
    // The DIY build (`type` 1) has no battery: its `bat` is absent.
    battery: raw.type === 0 && finite(raw.bat) !== null ? raw.bat : null,
    wifiSignal: finite(raw.wifi_signal),
    uptimeSeconds: finite(raw.uptime),
    indicators: [raw.indicator1, raw.indicator2, raw.indicator3].map((value) => value === true),
  };
}

/**
 * The settings Gladys follows. Missing keys stay null.
 * @param {unknown} raw parsed JSON of /api/settings
 */
export function parseSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  return {
    autoBrightness: typeof raw.ABRI === 'boolean' ? raw.ABRI : null,
  };
}

/** AWTRIX brightness (0-255) as a percentage. */
export const brightnessPercent = (bri) => Math.round((bri * 100) / 255);
/** A percentage as AWTRIX brightness (0-255). */
export const brightnessValue = (percent) =>
  Math.round((Math.max(0, Math.min(100, percent)) * 255) / 100);

/** A number typed in a scene or a form: a number, or a string ("5", "2,5"). */
export function parseNumber(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const number = Number(raw.trim().replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

const bounded = (raw, min, max, fallback) => {
  const number = parseNumber(raw);
  return number === null ? fallback : Math.min(max, Math.max(min, Math.round(number)));
};

/** Text for the matrix: one line, no control characters, bounded. */
export function cleanText(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return '';
  }
  return (
    String(raw)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT_LENGTH)
  );
}

/**
 * An icon: a LaMetric icon id, or the name of an icon file on the clock
 * (without extension). Null when empty or unusable.
 */
export function cleanIcon(raw) {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  return /^[A-Za-z0-9_-]{1,64}$/.test(text) ? text : null;
}

/**
 * The name of a custom app, as AWTRIX 3 takes it in `?name=`: letters,
 * digits, `_` and `-` (spaces become `_`). Null when empty, or when it would
 * shadow a built-in app.
 */
export function cleanAppName(raw) {
  const text = typeof raw === 'string' ? raw.trim().replace(/\s+/g, '_') : '';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(text)) {
    return null;
  }
  return BUILTIN_APPS.some((name) => name.toLowerCase() === text.toLowerCase()) ? null : text;
}

/** The name of an app to switch to: built-in or custom. */
export function cleanSwitchName(raw) {
  const text = typeof raw === 'string' ? raw.trim().replace(/\s+/g, '_') : '';
  return /^[A-Za-z0-9_-]{1,32}$/.test(text) ? text : null;
}

/**
 * A sound: an RTTTL melody (`name:d=4,o=5,b=100:c,e,g`, played by the
 * buzzer) or the name of a melody file of the clock (MELODIES folder, or the
 * 4-digit number of a DFPlayer MP3). Returns the JSON keys to add.
 */
export function soundKeys(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    return {};
  }
  if (text.includes(':')) {
    return { rtttl: text.slice(0, 1000) };
  }
  return /^[A-Za-z0-9 _-]{1,64}$/.test(text) ? { sound: text } : {};
}

/** The JSON keys of a text color (none for `default`). */
export function colorKeys(color) {
  if (color === 'rainbow') {
    return { rainbow: true };
  }
  return COLORS[color] ? { color: COLORS[color] } : {};
}

/**
 * The body of POST /api/notify.
 * @param {object} fields resolved scene fields (or widget form values)
 * @returns {object|null} null without text
 */
export function buildNotification(fields = {}) {
  const text = cleanText(fields.text);
  if (!text) {
    return null;
  }
  const body = {
    text,
    duration: bounded(fields.duration, 1, MAX_DURATION_SECONDS, DEFAULT_DURATION_SECONDS),
    ...colorKeys(fields.color),
    ...soundKeys(fields.sound),
  };
  const icon = cleanIcon(fields.icon);
  if (icon) {
    body.icon = icon;
    // The icon slides away with a scrolling text and comes back with it.
    body.pushIcon = 2;
  }
  const scroll = SCROLL_MODES.includes(fields.scroll) ? fields.scroll : 'whole_text';
  if (scroll === 'whole_text') {
    // A text too long for the screen scrolls through once, whatever the
    // duration; a short one stays `duration` seconds (AWTRIX ignores
    // `repeat` for a text that does not scroll).
    body.repeat = 1;
  } else if (scroll === 'off') {
    body.noScroll = true;
  }
  if (fields.hold === true) {
    body.hold = true;
  }
  if (fields.wakeup === true) {
    body.wakeup = true;
  }
  return body;
}

/**
 * The body of POST /api/custom?name=…
 * @returns {object|null} null without text
 */
export function buildCustomApp(fields = {}) {
  const text = cleanText(fields.text);
  if (!text) {
    return null;
  }
  const body = { text, ...colorKeys(fields.color) };
  const icon = cleanIcon(fields.icon);
  if (icon) {
    body.icon = icon;
  }
  const progress = parseNumber(fields.progress);
  if (progress !== null && progress >= 0) {
    body.progress = Math.min(100, Math.round(progress));
  }
  const lifetime = bounded(fields.lifetime_minutes, 0, MAX_LIFETIME_MINUTES, 0);
  if (lifetime > 0) {
    // Removed from the clock when Gladys stops updating it for that long:
    // a stale value never stays on screen.
    body.lifetime = lifetime * 60;
  }
  return body;
}

/** The body of POST /api/indicatorN: `{}` turns the indicator off. */
export function buildIndicator(fields = {}) {
  const color = INDICATOR_COLORS.includes(fields.color) ? fields.color : 'off';
  if (color === 'off') {
    return {};
  }
  const body = { color: COLORS[color] };
  if (fields.effect === 'blink') {
    body.blink = BLINK_MS;
  } else if (fields.effect === 'fade') {
    body.fade = FADE_MS;
  }
  return body;
}

/** Indicator number 1 to 3 (top right, right, bottom right), null otherwise. */
export function indicatorNumber(raw) {
  const number = parseNumber(raw);
  return [1, 2, 3].includes(number) ? number : null;
}
