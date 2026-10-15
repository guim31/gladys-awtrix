# AWTRIX 3 fixtures

Answers of the AWTRIX 3 HTTP API, built key by key from the firmware that
produces them (`DisplayManager::getStats` and `DisplayManager::getSettings` in
[Blueforcer/awtrix3](https://github.com/Blueforcer/awtrix3), version 0.98) and
the API documentation (blueforcer.github.io/awtrix3). Not captured on a real
clock: the integration was developed without the hardware.

- `stats-ulanzi-0.98.json`: an Ulanzi TC001 (`type` 0: battery, temperature
  and humidity sensor).
- `stats-diy-no-sensor-0.97.json`: a DIY build (`type` 1: no battery), sensor
  reading off (no `temp`, no `hum`), indicator 1 lit.
- `settings-0.98.json`: `GET /api/settings`, automatic brightness on.

Anonymized: the `uid` values are invented, the addresses are in 192.0.2.0/24
(TEST-NET-1).
