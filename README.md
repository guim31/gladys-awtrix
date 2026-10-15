# AWTRIX 3 for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that drives **AWTRIX 3** pixel clocks — the Ulanzi TC001 "Smart Pixel Clock"
and the DIY ESP32 builds running the free
[AWTRIX 3](https://github.com/Blueforcer/awtrix3) firmware — through their
local HTTP API. No cloud, no account, no MQTT broker.

> **Developed without the hardware: feedback welcome.** The integration is
> built and tested against the AWTRIX 3 API as its firmware (0.98) and its
> documentation describe it, with a simulated clock — not against a real one.
> Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-awtrix/issues).

AWTRIX and this integration are **not affiliated with Ulanzi**.

## Features

- **One device per clock**, known by the clock's own identifier (a new IP
  address keeps the device): **display** on/off, **brightness** (0-100 %,
  turns the automatic brightness off), **automatic brightness**, a **next
  app** button, the **current app**, and the sensors the clock reports:
  **temperature**, **humidity**, **ambient light**, **battery** (Ulanzi
  TC001), **Wi-Fi signal** and **uptime**.
- **Scene actions**: _Show a notification on AWTRIX_ (text, color or rainbow,
  LaMetric icon, duration, scrolling, RTTTL sound or melody file, stay until
  the button is pressed, wake the display), _Show a value on AWTRIX_ (a
  persistent custom app updated by the scene — outdoor temperature, power… —
  with a progress bar and an expiry), _Remove a value from AWTRIX_, _Set an
  AWTRIX indicator_ (the three colored dots: steady, blinking, fading, off),
  _Next AWTRIX app_, _Show an AWTRIX app_, _Dismiss the AWTRIX notification_.
- **Dashboard widget** "AWTRIX clock": the app on screen, display, brightness,
  Wi-Fi, temperature and humidity, and four buttons: **Message…** (a form:
  text, color, duration), **Next app**, **Display off** / **Display on**,
  **Dismiss**. One clock, or all of them.
- **Discovery**: the clocks announcing `_awtrix._tcp` in mDNS are found
  through the Gladys core (the container cannot hear multicast), and a clock
  whose address changes is followed. Typed addresses work too.
- A **Test the connection** button, a connection status that names the clock
  and the problem (no answer, credentials refused, AWTRIX NG), and a
  **transport badge** per device.
- Every text in English, French, German and Spanish.

No scene trigger: AWTRIX 3 reports its button presses over MQTT, or by an HTTP
callback to an address the sandboxed container cannot offer.

## Requirements

- Gladys Assistant **5.2.0** or later (scene actions, widgets, the widget
  button form).
- A clock running **AWTRIX 3** (the API of 0.98, its last release). **AWTRIX
  NG**, the 2026 successor with a new `/api/v1` API, is not supported: it is
  detected and reported.
- Optional: the "Auth Username" / "Auth Password" of the clocks, if set (HTTP
  Basic, the same for all clocks).

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter
   `https://github.com/guim31/gladys-awtrix` (or install **AWTRIX 3** from the
   catalog once it is listed).
2. In **Configuration**, keep **Find the clocks on the network** on, or enter
   the clock addresses (`192.168.1.50, 192.168.1.51`); add the username and
   password only if the clocks ask for one.
3. Click **Test the connection**, then add the clocks from the **Discover**
   tab.

The user documentation, in four languages, is in [`docs/`](docs/en.md) and in
the Gladys Configuration screen.

## How it works

- Every interval (30 s by default, 15 s to 5 min), the container reads
  `GET /api/stats` and `GET /api/settings` of each clock, one request at a
  time per clock (an ESP32 serves one at a time), and publishes the values
  that changed, plus every value at least every 6 hours. It does not rely on
  Gladys polling the devices (GladysAssistant/Gladys#3198).
- Commands use the documented routes: `/api/power`, `/api/settings`,
  `/api/notify`, `/api/notify/dismiss`, `/api/custom?name=`,
  `/api/indicator1..3`, `/api/nextapp`, `/api/switch`.
- `/data/awtrix-state.json` remembers the clocks met (identifier, last
  address, sensors seen), so a restart while a clock is off keeps its device
  unchanged. No secret is stored there.
- `scripts/probe.mjs <ip>` reads a real clock (read only) and prints what the
  integration understands of it; credentials through `AWTRIX_USER` /
  `AWTRIX_PASSWORD`.

## Limits

- Developed without the hardware (see above).
- AWTRIX 3 only, AWTRIX NG not supported.
- No trigger for the physical buttons (MQTT only on the clock side).
- One username and password for all the clocks.
- Plain HTTP, as AWTRIX 3 serves it: keep the clocks on a trusted network.
- Icons must be downloaded on the clock first (web interface, Icons tab).

## Development

```bash
npm install
npm test               # node --test, against the SDK's fake Gladys and simulated clocks
npm run lint
npm run format:check
node scripts/probe.mjs 192.168.1.50
```

## Credits

- [AWTRIX 3](https://github.com/Blueforcer/awtrix3) by Stephan Mühl
  (Blueforcer): the firmware and its API documentation. The API was read from
  its documentation and source (CC BY-NC-SA 4.0); no code of it is copied
  here.
- [homeassistant-custom_components-awtrix](https://github.com/10der/homeassistant-custom_components-awtrix)
  by Oleg Denisenko (MIT), the Home Assistant integration over the same HTTP
  API.
- [Gladys Assistant](https://gladysassistant.com) and its
  [integration SDK](https://github.com/GladysAssistant/integration-sdk-js).

## License

[Apache-2.0](LICENSE). AWTRIX is a project of Blueforcer; Ulanzi and TC001 are
trademarks of their owner. This integration is not affiliated with Ulanzi.
