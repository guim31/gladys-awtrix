// -----------------------------------------------------------------------------
// One Gladys device per AWTRIX 3 clock.
//
// Identity: the `uid` of the clock (`awtrix_` + the end of its MAC address,
// /api/stats), never its address: a new IP (DHCP) or a host name typed instead
// of the IP keeps the device and its history.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - display: switch/binary, writable — the matrix on or off (/api/power);
//   - brightness: switch/dimmer, writable, 0-100 % of the AWTRIX 0-255
//     scale. Setting it turns the automatic brightness off, or the clock would
//     override it at once (what the Home Assistant integrations do too);
//   - automatic brightness: switch/binary, writable (setting ABRI);
//   - next app: button/push, writable — the right button of the clock;
//   - current app: text/text, read-only (Time, Date, a custom app...);
//   - ambient light (lux), Wi-Fi signal (dBm, no unit in Gladys), uptime
//     (hours: a value in seconds would change at every reading);
//   - temperature, humidity: only when the clock reports them (the sensor
//     reading can be turned off), battery: Ulanzi TC001 only.
//
// A feature seen once stays in the device (src/hub.js remembers the
// capabilities under /data): the structure never shrinks on its own, which
// would make Gladys offer an "Update" for nothing.
//
// Published with should_poll: false: the integration reads the clocks on its
// own timer (src/hub.js), Gladys never needs to poll them.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { brightnessPercent } from './awtrix/model.js';

export const DEVICE_TYPE = 'clock';
export const HOST_PARAM = 'AWTRIX_HOST';
export const VERSION_PARAM = 'AWTRIX_FIRMWARE';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  DISPLAY: 'display',
  BRIGHTNESS: 'brightness',
  AUTO_BRIGHTNESS: 'auto_brightness',
  NEXT_APP: 'next_app',
  CURRENT_APP: 'current_app',
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  ILLUMINANCE: 'illuminance',
  BATTERY: 'battery',
  WIFI_SIGNAL: 'wifi_signal',
  UPTIME: 'uptime',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.DISPLAY]: 'Display',
    [FEATURE_KEYS.BRIGHTNESS]: 'Brightness',
    [FEATURE_KEYS.AUTO_BRIGHTNESS]: 'Automatic brightness',
    [FEATURE_KEYS.NEXT_APP]: 'Next app',
    [FEATURE_KEYS.CURRENT_APP]: 'Current app',
    [FEATURE_KEYS.TEMPERATURE]: 'Temperature',
    [FEATURE_KEYS.HUMIDITY]: 'Humidity',
    [FEATURE_KEYS.ILLUMINANCE]: 'Ambient light',
    [FEATURE_KEYS.BATTERY]: 'Battery',
    [FEATURE_KEYS.WIFI_SIGNAL]: 'Wi-Fi signal (dBm)',
    [FEATURE_KEYS.UPTIME]: 'Uptime',
  },
  fr: {
    [FEATURE_KEYS.DISPLAY]: 'Écran',
    [FEATURE_KEYS.BRIGHTNESS]: 'Luminosité',
    [FEATURE_KEYS.AUTO_BRIGHTNESS]: 'Luminosité automatique',
    [FEATURE_KEYS.NEXT_APP]: 'Application suivante',
    [FEATURE_KEYS.CURRENT_APP]: 'Application en cours',
    [FEATURE_KEYS.TEMPERATURE]: 'Température',
    [FEATURE_KEYS.HUMIDITY]: 'Humidité',
    [FEATURE_KEYS.ILLUMINANCE]: 'Luminosité ambiante',
    [FEATURE_KEYS.BATTERY]: 'Batterie',
    [FEATURE_KEYS.WIFI_SIGNAL]: 'Signal Wi-Fi (dBm)',
    [FEATURE_KEYS.UPTIME]: 'Durée de fonctionnement',
  },
  de: {
    [FEATURE_KEYS.DISPLAY]: 'Anzeige',
    [FEATURE_KEYS.BRIGHTNESS]: 'Helligkeit',
    [FEATURE_KEYS.AUTO_BRIGHTNESS]: 'Automatische Helligkeit',
    [FEATURE_KEYS.NEXT_APP]: 'Nächste App',
    [FEATURE_KEYS.CURRENT_APP]: 'Aktuelle App',
    [FEATURE_KEYS.TEMPERATURE]: 'Temperatur',
    [FEATURE_KEYS.HUMIDITY]: 'Luftfeuchtigkeit',
    [FEATURE_KEYS.ILLUMINANCE]: 'Umgebungshelligkeit',
    [FEATURE_KEYS.BATTERY]: 'Batterie',
    [FEATURE_KEYS.WIFI_SIGNAL]: 'WLAN-Signal (dBm)',
    [FEATURE_KEYS.UPTIME]: 'Betriebszeit',
  },
  es: {
    [FEATURE_KEYS.DISPLAY]: 'Pantalla',
    [FEATURE_KEYS.BRIGHTNESS]: 'Brillo',
    [FEATURE_KEYS.AUTO_BRIGHTNESS]: 'Brillo automático',
    [FEATURE_KEYS.NEXT_APP]: 'Aplicación siguiente',
    [FEATURE_KEYS.CURRENT_APP]: 'Aplicación actual',
    [FEATURE_KEYS.TEMPERATURE]: 'Temperatura',
    [FEATURE_KEYS.HUMIDITY]: 'Humedad',
    [FEATURE_KEYS.ILLUMINANCE]: 'Luz ambiental',
    [FEATURE_KEYS.BATTERY]: 'Batería',
    [FEATURE_KEYS.WIFI_SIGNAL]: 'Señal Wi-Fi (dBm)',
    [FEATURE_KEYS.UPTIME]: 'Tiempo de funcionamiento',
  },
};

const sensor = (category, type, extra) => ({
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

const onOff = (value) => (value === true ? 1 : value === false ? 0 : null);
const text = (value) => (typeof value === 'string' && value ? { text: value } : null);
const rounded = (value, digits = 0) =>
  typeof value === 'number' ? Math.round(value * 10 ** digits) / 10 ** digits : null;

// Order = display order in Gladys. `when`: the capability the feature needs.
// `value(state)`: a number, `{ text }`, or null (nothing to publish).
const FEATURES = [
  {
    key: FEATURE_KEYS.DISPLAY,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    },
    value: ({ stats }) => onOff(stats?.matrix),
  },
  {
    key: FEATURE_KEYS.BRIGHTNESS,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.DIMMER,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 100,
    },
    value: ({ stats }) =>
      typeof stats?.brightness === 'number' ? brightnessPercent(stats.brightness) : null,
  },
  {
    key: FEATURE_KEYS.AUTO_BRIGHTNESS,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 1,
    },
    value: ({ settings }) => onOff(settings?.autoBrightness),
  },
  {
    key: FEATURE_KEYS.NEXT_APP,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.BUTTON,
      type: DEVICE_FEATURE_TYPES.BUTTON.PUSH,
      read_only: false,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: 1,
    },
    // A command, no state.
    value: () => null,
  },
  {
    key: FEATURE_KEYS.CURRENT_APP,
    definition: sensor(DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
      keep_history: false,
      min: 0,
      max: 0,
    }),
    value: ({ stats }) => text(stats?.app),
  },
  {
    key: FEATURE_KEYS.TEMPERATURE,
    when: 'temperature',
    definition: sensor(
      DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
      DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
      { unit: DEVICE_FEATURE_UNITS.CELSIUS, min: -40, max: 85 },
    ),
    value: ({ stats }) => rounded(stats?.temperature, 1),
  },
  {
    key: FEATURE_KEYS.HUMIDITY,
    when: 'humidity',
    definition: sensor(
      DEVICE_FEATURE_CATEGORIES.HUMIDITY_SENSOR,
      DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
      { unit: DEVICE_FEATURE_UNITS.PERCENT, min: 0, max: 100 },
    ),
    value: ({ stats }) => rounded(stats?.humidity),
  },
  {
    key: FEATURE_KEYS.ILLUMINANCE,
    definition: sensor(
      DEVICE_FEATURE_CATEGORIES.LIGHT_SENSOR,
      DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
      { unit: DEVICE_FEATURE_UNITS.LUX, min: 0, max: 100000 },
    ),
    value: ({ stats }) => rounded(stats?.lux),
  },
  {
    key: FEATURE_KEYS.BATTERY,
    when: 'battery',
    definition: sensor(DEVICE_FEATURE_CATEGORIES.BATTERY, DEVICE_FEATURE_TYPES.BATTERY.INTEGER, {
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      min: 0,
      max: 100,
    }),
    value: ({ stats }) => rounded(stats?.battery),
  },
  {
    key: FEATURE_KEYS.WIFI_SIGNAL,
    definition: sensor(DEVICE_FEATURE_CATEGORIES.SIGNAL, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, {
      keep_history: false,
      min: -100,
      max: 0,
    }),
    value: ({ stats }) => rounded(stats?.wifiSignal),
  },
  {
    key: FEATURE_KEYS.UPTIME,
    definition: sensor(DEVICE_FEATURE_CATEGORIES.DURATION, DEVICE_FEATURE_TYPES.DURATION.INTEGER, {
      unit: DEVICE_FEATURE_UNITS.HOURS,
      keep_history: false,
      min: 0,
      max: 1000000,
    }),
    value: ({ stats }) =>
      typeof stats?.uptimeSeconds === 'number' ? Math.floor(stats.uptimeSeconds / 3600) : null,
  },
];

/** The capabilities a statistics answer shows (sensor present, battery). */
export function capabilitiesOf(stats) {
  return {
    temperature: typeof stats?.temperature === 'number',
    humidity: typeof stats?.humidity === 'number',
    battery: typeof stats?.battery === 'number',
  };
}

/** External ids of a clock's device and features. */
export const deviceIds = (gladys, uid) => gladys.externalIds(DEVICE_TYPE, uid);

/** The name shown for a clock: "AWTRIX a1b2c3". */
export function clockName(uid) {
  return `AWTRIX ${uid.replace(/^awtrix_/i, '')}`;
}

const activeFeatures = (capabilities = {}) =>
  FEATURES.filter((feature) => !feature.when || capabilities[feature.when]);

/**
 * The discovery payload of a clock.
 * @param {object} gladys SDK client
 * @param {{ uid: string, host: string, version?: string|null, capabilities: object }} clock
 * @param {string} language feature names language
 */
export function buildDevice(gladys, clock, language = 'en') {
  const ids = deviceIds(gladys, clock.uid);
  const names = NAMES[language] ?? NAMES.en;
  const params = [{ name: HOST_PARAM, value: clock.host }];
  if (clock.version) {
    params.push({ name: VERSION_PARAM, value: clock.version });
  }
  return {
    name: clockName(clock.uid),
    external_id: ids.device,
    should_poll: false,
    params,
    features: activeFeatures(clock.capabilities).map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The states of a clock, in the format of publishChangedStates. Only the
 * features of the device, and only the values the clock gave.
 * @param {{ uid: string, capabilities: object, stats: object|null, settings: object|null }} clock
 */
export function clockStates(gladys, clock) {
  const ids = deviceIds(gladys, clock.uid);
  const states = [];
  for (const { key, value } of activeFeatures(clock.capabilities)) {
    const current = value(clock);
    if (current === null) {
      continue;
    }
    const externalId = ids.feature(key);
    states.push(
      typeof current === 'object'
        ? { device_feature_external_id: externalId, text: current.text }
        : { device_feature_external_id: externalId, state: current },
    );
  }
  return states;
}

/** The feature key of a feature external id of a clock, or null. */
export function featureKeyOf(gladys, uid, featureExternalId) {
  const ids = deviceIds(gladys, uid);
  return Object.values(FEATURE_KEYS).find((key) => ids.feature(key) === featureExternalId) ?? null;
}
