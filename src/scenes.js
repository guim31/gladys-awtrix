// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// What a scene does with a pixel clock: show a notification, keep a value of
// Gladys on screen (a custom app updated by the scene), light the three
// colored indicators, change the app on screen. The display, the brightness
// and the automatic brightness are device features: the core's "control a
// device" action already sets them.
//
// Every action targets one clock (`device`) or, left empty, every clock.
// Gladys applies the field defaults and substitutes the scene variables in
// the `string` fields before the action arrives here. Each resolves with the
// number of clocks that accepted it (`clocks` output); none → it fails.
// -----------------------------------------------------------------------------

import {
  buildCustomApp,
  buildIndicator,
  buildNotification,
  cleanAppName,
  cleanSwitchName,
  indicatorNumber,
} from './awtrix/model.js';
import { ACTION_TEXT, pick } from './texts.js';

const fail = (hub, text) => {
  throw new Error(pick(text, hub.config?.language));
};

export const SCENE_ACTIONS = {
  async show_notification(hub, { fields = {} }) {
    const body = buildNotification(fields);
    if (!body) {
      fail(hub, ACTION_TEXT.noText);
    }
    return { clocks: await hub.notify(fields.device || null, body) };
  },

  async dismiss_notification(hub, { fields = {} }) {
    return { clocks: await hub.dismissNotification(fields.device || null) };
  },

  async set_custom_app(hub, { fields = {} }) {
    const name = cleanAppName(fields.name);
    if (!name) {
      fail(hub, ACTION_TEXT.badAppName);
    }
    const body = buildCustomApp(fields);
    if (!body) {
      fail(hub, ACTION_TEXT.noText);
    }
    return { clocks: await hub.setCustomApp(fields.device || null, name, body) };
  },

  async remove_custom_app(hub, { fields = {} }) {
    const name = cleanAppName(fields.name);
    if (!name) {
      fail(hub, ACTION_TEXT.badAppName);
    }
    return { clocks: await hub.removeCustomApp(fields.device || null, name) };
  },

  async set_indicator(hub, { fields = {} }) {
    const number = indicatorNumber(fields.indicator);
    if (number === null) {
      fail(hub, ACTION_TEXT.badIndicator);
    }
    return {
      clocks: await hub.setIndicator(fields.device || null, number, buildIndicator(fields)),
    };
  },

  async next_app(hub, { fields = {} }) {
    return { clocks: await hub.nextApp(fields.device || null) };
  },

  async switch_app(hub, { fields = {} }) {
    const name = cleanSwitchName(fields.name);
    if (!name) {
      fail(hub, ACTION_TEXT.badSwitchName);
    }
    return { clocks: await hub.switchApp(fields.device || null, name) };
  },
};
