# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Stored under `/data`**: `awtrix-state.json`, the clocks met so far (their
  identifier, last address, how they were found, the sensors they reported,
  their firmware version). No secret.
- **Secrets**: the optional username and password of the clocks live in the
  Gladys configuration (the password as a `secret` field). They are sent to
  the clocks only, as HTTP Basic credentials, and never written to the logs
  or to `/data`.
- **Network**: plain HTTP to the clocks on the local network (AWTRIX 3 has no
  HTTPS, so the credentials travel in clear on the LAN), and the mDNS scan
  for `_awtrix._tcp`, run by the Gladys core on the integration's behalf.
  Nothing goes to the Internet.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the AWTRIX firmware (report to
[Blueforcer/awtrix3](https://github.com/Blueforcer/awtrix3)), and the clocks
themselves.
