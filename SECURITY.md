# Security policy

## Reporting a vulnerability

Please report security problems **privately** through GitHub's *Report a vulnerability* button (Security tab → Advisories), not in a public issue. Include steps to reproduce and the browser and version. You will get an acknowledgement as soon as a maintainer sees it; this is a volunteer project and no response time is guaranteed.

## Scope

OpenSong is a static web app with no server. Relevant issues include cross-site scripting, unsafe handling of imported files (audio, playlists, backups), content-security-policy bypasses, leaking of the user's stored data or Jamendo client ID, and supply-chain problems in dependencies.

## How the app limits risk

- Strict Content-Security-Policy in production builds (no inline script, connections only to the enabled sources).
- All remote and imported data (provider responses, playlists, backups) is validated; only `http(s)` URLs are accepted.
- Requests use `credentials: 'omit'`. No cookies, no analytics.
- The Jamendo client ID entered in Settings stays in the browser's localStorage and is excluded from backups. Treat it as a low-value, revocable key: **do not** put secrets in `VITE_` variables, because they are embedded in the public bundle.
- `npm audit --omit=dev` and a licence check run weekly in CI.

## Supported versions

Only the latest release receives fixes.
