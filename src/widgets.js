// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `awtrix`.
//
// The use case: from the wall tablet, put a word on the clock ("Dinner is
// ready", "Leaving in 5 min"), skip to the next app, turn the screen off for
// the night, clear a notification that waits for the button. So the widget
// shows what the clock is doing (app, screen, brightness, Wi-Fi), its sensors,
// and four buttons: Message… (a form: text, color, duration — the button
// forms of GladysAssistant/Gladys#3168, Gladys 5.2.0), Next app, Display
// on/off, Dismiss.
//
// One clock (the widget setting, or the only one), or every clock: one status
// row each, and the buttons act on all of them.
//
// Budget (8 components, 6 tiles, 1 status, 4 buttons): up to two tiles
// (temperature, humidity — bound to the device features once the device is
// added, so they follow the states live), one status list, four buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  DEFAULT_DURATION_SECONDS,
  TEXT_COLORS,
  brightnessPercent,
  buildNotification,
} from './awtrix/model.js';
import { ERROR_KINDS } from './awtrix/client.js';
import { FEATURE_KEYS, clockName, deviceIds } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ACTION_TEXT, pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique, the core
// drops a button whose key is taken).
export const ACTIONS = Object.freeze({
  MESSAGE: 'message',
  NEXT_APP: 'next_app',
  DISPLAY_ON: 'display_on',
  DISPLAY_OFF: 'display_off',
  DISMISS: 'dismiss',
});

export const MESSAGE_MAX_DURATION = 300;

export const TEXT = {
  pick: {
    en: 'No AWTRIX clock yet: enter its address in the configuration of the integration.',
    fr: "Aucune horloge AWTRIX pour l'instant : saisissez son adresse dans la configuration de l'intégration.",
    de: 'Noch keine AWTRIX-Uhr: Gib ihre Adresse in der Konfiguration der Integration ein.',
    es: 'Todavía no hay ningún reloj AWTRIX: introduzca su dirección en la configuración de la integración.',
  },
  unknown: {
    en: 'This clock is no longer reachable by the integration: choose another one in the widget settings.',
    fr: "Cette horloge n'est plus joignable par l'intégration : choisissez-en une autre dans les réglages du widget.",
    de: 'Diese Uhr ist für die Integration nicht mehr erreichbar: Wähle eine andere in den Widget-Einstellungen.',
    es: 'Este reloj ya no es accesible para la integración: elija otro en la configuración del widget.',
  },
  app: { en: 'App', fr: 'Application', de: 'App', es: 'Aplicación' },
  display: { en: 'Display', fr: 'Écran', de: 'Anzeige', es: 'Pantalla' },
  brightness: { en: 'Brightness', fr: 'Luminosité', de: 'Helligkeit', es: 'Brillo' },
  wifi: { en: 'Wi-Fi', fr: 'Wi-Fi', de: 'WLAN', es: 'Wi-Fi' },
  on: { en: 'On', fr: 'Allumé', de: 'An', es: 'Encendida' },
  off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagada' },
  auto: { en: 'auto', fr: 'auto', de: 'auto', es: 'auto' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  humidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchtigkeit', es: 'Humedad' },
  message: { en: 'Message…', fr: 'Message…', de: 'Nachricht…', es: 'Mensaje…' },
  nextApp: { en: 'Next app', fr: 'App suivante', de: 'Nächste App', es: 'App siguiente' },
  displayOn: { en: 'Display on', fr: 'Allumer', de: 'Anzeige an', es: 'Encender' },
  displayOff: { en: 'Display off', fr: 'Éteindre', de: 'Anzeige aus', es: 'Apagar' },
  dismiss: { en: 'Dismiss', fr: 'Effacer', de: 'Ausblenden', es: 'Descartar' },
  text: { en: 'Text', fr: 'Texte', de: 'Text', es: 'Texto' },
  color: { en: 'Color', fr: 'Couleur', de: 'Farbe', es: 'Color' },
  duration: {
    en: 'Duration (seconds)',
    fr: 'Durée (secondes)',
    de: 'Dauer (Sekunden)',
    es: 'Duración (segundos)',
  },
};

// Color names: the same labels as the scene actions of the manifest
// (test/i18n.test.js compares them).
export const COLOR_LABELS = {
  default: {
    en: 'Clock default',
    fr: "Celle de l'horloge",
    de: 'Standard der Uhr',
    es: 'La del reloj',
  },
  white: { en: 'White', fr: 'Blanc', de: 'Weiß', es: 'Blanco' },
  red: { en: 'Red', fr: 'Rouge', de: 'Rot', es: 'Rojo' },
  orange: { en: 'Orange', fr: 'Orange', de: 'Orange', es: 'Naranja' },
  yellow: { en: 'Yellow', fr: 'Jaune', de: 'Gelb', es: 'Amarillo' },
  green: { en: 'Green', fr: 'Vert', de: 'Grün', es: 'Verde' },
  cyan: { en: 'Cyan', fr: 'Cyan', de: 'Cyan', es: 'Cian' },
  blue: { en: 'Blue', fr: 'Bleu', de: 'Blau', es: 'Azul' },
  purple: { en: 'Purple', fr: 'Violet', de: 'Lila', es: 'Morado' },
  pink: { en: 'Pink', fr: 'Rose', de: 'Pink', es: 'Rosa' },
  rainbow: { en: 'Rainbow', fr: 'Arc-en-ciel', de: 'Regenbogen', es: 'Arcoíris' },
};

// Toasts after a tap (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    message: (count) => `Message shown on ${count} clock(s).`,
    nextApp: (count) => `Next app on ${count} clock(s).`,
    displayOn: (count) => `Display on for ${count} clock(s).`,
    displayOff: (count) => `Display off for ${count} clock(s).`,
    dismiss: (count) => `Notification dismissed on ${count} clock(s).`,
  },
  fr: {
    message: (count) => `Message affiché sur ${count} horloge(s).`,
    nextApp: (count) => `Application suivante sur ${count} horloge(s).`,
    displayOn: (count) => `Écran allumé sur ${count} horloge(s).`,
    displayOff: (count) => `Écran éteint sur ${count} horloge(s).`,
    dismiss: (count) => `Notification effacée sur ${count} horloge(s).`,
  },
  de: {
    message: (count) => `Nachricht auf ${count} Uhr(en) angezeigt.`,
    nextApp: (count) => `Nächste App auf ${count} Uhr(en).`,
    displayOn: (count) => `Anzeige an auf ${count} Uhr(en).`,
    displayOff: (count) => `Anzeige aus auf ${count} Uhr(en).`,
    dismiss: (count) => `Benachrichtigung auf ${count} Uhr(en) ausgeblendet.`,
  },
  es: {
    message: (count) => `Mensaje mostrado en ${count} reloj(es).`,
    nextApp: (count) => `Aplicación siguiente en ${count} reloj(es).`,
    displayOn: (count) => `Pantalla encendida en ${count} reloj(es).`,
    displayOff: (count) => `Pantalla apagada en ${count} reloj(es).`,
    dismiss: (count) => `Notificación descartada en ${count} reloj(es).`,
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** The clocks a widget instance shows. Null when its clock is gone. */
function clocksOf(hub, settings = {}) {
  if (settings.device) {
    const clock = hub.clockByDevice(settings.device);
    return clock ? [clock] : null;
  }
  return hub.activeClocks();
}

/** The state of a clock in one status value. */
function clockState(clock, language) {
  if (clock.reachable === false) {
    const unreachable = clock.error?.kind === ERROR_KINDS.UNREACHABLE;
    return {
      icon: 'alert-triangle',
      value: t(unreachable ? TEXT.unreachable : TEXT.error, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (!clock.stats) {
    return { icon: 'clock', value: t(TEXT.waiting, language), color: WIDGET_COLORS.NEUTRAL };
  }
  if (clock.stats.matrix === false) {
    return { icon: 'moon', value: t(TEXT.off, language), color: WIDGET_COLORS.NEUTRAL };
  }
  return {
    icon: 'monitor',
    value: fit(clock.stats.app ?? t(TEXT.on, language), 40),
    color: WIDGET_COLORS.SUCCESS,
  };
}

/** Status rows of one clock: app, display, brightness, Wi-Fi. */
function singleClockRows(clock, language) {
  const state = clockState(clock, language);
  if (clock.reachable === false || !clock.stats) {
    return [{ label: fit(clockName(clock.uid), 40), ...state }];
  }
  const { stats, settings } = clock;
  const rows = [
    {
      label: t(TEXT.display, language),
      icon: stats.matrix === false ? 'moon' : 'monitor',
      value: t(stats.matrix === false ? TEXT.off : TEXT.on, language),
      color: stats.matrix === false ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.SUCCESS,
    },
  ];
  if (stats.app && stats.matrix !== false) {
    rows.unshift({
      label: t(TEXT.app, language),
      icon: 'grid',
      value: fit(stats.app, 40),
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  if (typeof stats.brightness === 'number') {
    const percent = `${brightnessPercent(stats.brightness)} %`;
    rows.push({
      label: t(TEXT.brightness, language),
      icon: 'sun',
      value: settings?.autoBrightness ? `${percent} · ${t(TEXT.auto, language)}` : percent,
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (typeof stats.wifiSignal === 'number') {
    rows.push({
      label: t(TEXT.wifi, language),
      icon: 'wifi',
      value: `${stats.wifiSignal} dBm`,
      color: stats.wifiSignal >= -75 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    });
  }
  return rows;
}

/** Temperature and humidity tiles of one clock: live when the device is added. */
function sensorTiles(hub, clock, language) {
  const ids = deviceIds(hub.gladys, clock.uid);
  const created = (hub.gladys.devices ?? []).some((device) => device.external_id === ids.device);
  const tiles = [];
  const add = (capability, key, label, icon, value, unit) => {
    if (!clock.capabilities[capability]) {
      return;
    }
    if (created) {
      tiles.push({
        type: 'value',
        label: t(label, language),
        icon,
        device_feature: ids.feature(key),
      });
    } else if (typeof value === 'number') {
      tiles.push({ type: 'value', label: t(label, language), icon, value, unit });
    }
  };
  add(
    'temperature',
    FEATURE_KEYS.TEMPERATURE,
    TEXT.temperature,
    'thermometer',
    clock.stats?.temperature,
    '°C',
  );
  add('humidity', FEATURE_KEYS.HUMIDITY, TEXT.humidity, 'droplet', clock.stats?.humidity, '%');
  return tiles;
}

function buttons(clocks, language) {
  const anyOn = clocks.some((clock) => clock.stats?.matrix !== false);
  // Form labels are multi-language objects: the core picks the language.
  const colorOptions = TEXT_COLORS.map((value) => ({ value, label: COLOR_LABELS[value] }));
  return [
    {
      type: 'button',
      label: t(TEXT.message, language),
      icon: 'message-square',
      style: 'primary',
      action: {
        key: ACTIONS.MESSAGE,
        fields: [
          {
            key: 'text',
            type: 'string',
            required: true,
            label: TEXT.text,
          },
          {
            key: 'color',
            type: 'select',
            required: false,
            default: 'default',
            label: TEXT.color,
            options: colorOptions,
          },
          {
            key: 'duration',
            type: 'number',
            required: false,
            min: 1,
            max: MESSAGE_MAX_DURATION,
            default: DEFAULT_DURATION_SECONDS,
            label: TEXT.duration,
          },
        ],
      },
    },
    {
      type: 'button',
      label: t(TEXT.nextApp, language),
      icon: 'skip-forward',
      style: 'secondary',
      action: { key: ACTIONS.NEXT_APP },
    },
    anyOn
      ? {
          type: 'button',
          label: t(TEXT.displayOff, language),
          icon: 'moon',
          style: 'secondary',
          action: { key: ACTIONS.DISPLAY_OFF },
        }
      : {
          type: 'button',
          label: t(TEXT.displayOn, language),
          icon: 'sun',
          style: 'secondary',
          action: { key: ACTIONS.DISPLAY_ON },
        },
    {
      type: 'button',
      label: t(TEXT.dismiss, language),
      icon: 'x-circle',
      style: 'secondary',
      action: { key: ACTIONS.DISMISS },
    },
  ];
}

/** The content of one widget instance. */
export function widgetContent(hub, { settings = {}, language = 'en' } = {}) {
  const clocks = clocksOf(hub, settings);
  if (clocks === null) {
    return message(TEXT.unknown, language);
  }
  if (clocks.length === 0) {
    return message(TEXT.pick, language);
  }
  const components = [];
  if (clocks.length === 1) {
    components.push(...sensorTiles(hub, clocks[0], language));
    components.push({ type: 'status', items: singleClockRows(clocks[0], language) });
  } else {
    components.push({
      type: 'status',
      items: clocks.slice(0, 10).map((clock) => ({
        label: fit(clockName(clock.uid), 40),
        ...clockState(clock, language),
      })),
    });
  }
  components.push(...buttons(clocks, language));
  return { ttl_seconds: 60, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(hub, request = {}) {
      return widgetContent(hub, request);
    },

    // The tap carries no language: the toasts follow the configuration.
    async action(hub, { actionKey, values, settings = {} }) {
      const lang = hub.config?.language ?? 'en';
      const target = settings.device || null;
      const done = DONE_TEXT[lang] ?? DONE_TEXT.en;
      switch (actionKey) {
        case ACTIONS.MESSAGE: {
          // A Gladys older than 5.2.0 drops the form and sends the tap alone.
          if (!values || typeof values !== 'object') {
            throw new Error(pick(ACTION_TEXT.updateGladys, lang));
          }
          const duration = Math.min(MESSAGE_MAX_DURATION, Number(values.duration) || 0);
          const body = buildNotification({
            text: values.text,
            color: values.color,
            duration: duration > 0 ? duration : DEFAULT_DURATION_SECONDS,
          });
          if (!body) {
            throw new Error(pick(ACTION_TEXT.noText, lang));
          }
          return done.message(await hub.notify(target, body));
        }
        case ACTIONS.NEXT_APP:
          return done.nextApp(await hub.nextApp(target));
        case ACTIONS.DISPLAY_ON:
          return done.displayOn(await hub.setPower(target, true));
        case ACTIONS.DISPLAY_OFF:
          return done.displayOff(await hub.setPower(target, false));
        case ACTIONS.DISMISS:
          return done.dismiss(await hub.dismissNotification(target));
        default:
          throw new Error(`Unknown widget action ${actionKey}`);
      }
    },
  },
};
