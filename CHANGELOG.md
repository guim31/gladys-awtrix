# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- AWTRIX 3 clocks (Ulanzi TC001, DIY builds) over their local HTTP API: one
  device per clock with the display, the brightness, the automatic
  brightness, a "next app" button, the current app, and the temperature,
  humidity, ambient light, battery, Wi-Fi signal and uptime the clock
  reports.
- The clocks are found on the network (mDNS, through Gladys) or by their
  addresses, with an optional username and password, and followed when their
  address changes.
- Scene actions: show a notification, show a value (custom app), remove a
  value, set an indicator, next app, show an app, dismiss the notification.
- Dashboard widget with the app on screen, the sensors and the Message…, Next
  app, Display on/off and Dismiss buttons.
- A "Test the connection" button and a connection status naming the clock and
  the problem; AWTRIX NG is recognized and reported as not supported.
- English, French, German and Spanish everywhere, documentation included.

[Unreleased]: https://github.com/guim31/gladys-awtrix/commits/main
