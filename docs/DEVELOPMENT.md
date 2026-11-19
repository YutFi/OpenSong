# Development

## Setup

```bash
npm install
npm run dev
```

Node.js 22.12+. The optional `.env.example` shows `VITE_JAMENDO_CLIENT_ID`; anything with a `VITE_` prefix is compiled into the public bundle, so only use a key you are happy to expose, or paste it in Settings instead.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run typecheck` | `tsc` over `src/` (strict mode) |
| `npm test` | Vitest: unit and component tests (jsdom, `fake-indexeddb`) |
| `npm run build` | Type-check and production build to `dist/` (CSP, service worker, manifest) |
| `npm run preview` | Serve `dist/` on port 4173 |
| `npm run e2e` | Playwright end-to-end tests against `npm run preview` |
| `npm run licenses` | Check production dependency licences; add `-- --write` to regenerate `docs/DEPENDENCY_LICENSES.md` |
| `npm run audit:prod` | `npm audit --omit=dev` |

### End-to-end tests

`playwright.config.ts` starts `npm run preview` and runs Chrome with the autoplay restriction relaxed. Build first (`npm run build`). Locally it uses `/usr/bin/google-chrome`; set `CHROME_PATH` for another binary, or run `npx playwright install chromium` and unset the path (CI does this). The tests generate real WAV audio (`e2e/wav.ts`), enable the debug handle with `localStorage['opensong:debug'] = '1'` (exposes `engine`, `usePlayer`, `useSettings` as `window.__opensong`; it is inert unless that key is set) and measure the Web Audio analyser rather than mocking it.

Provider hosts are intentionally not mocked in e2e: the tests assert the app stays usable when they fail. Provider mapping is covered by fixtures in `src/providers/providers.test.ts`.

## Layout

```
src/
  audio/      engine (Web Audio graph), eq (maths + presets), viz (drawing), mediaSession
  catalog/    sync (scheduling, merge, dedupe, prune), queries (filters, date windows)
  components/ shared UI; ui/ has the small design-system primitives
  lib/        db, http, library import/export, stats, recommend, validate, m3u, util
  pages/      one file per route (lazy-loaded except Home)
  providers/  one file per source + registry
  store/      zustand: settings (persisted), player, ui
  types.ts    shared data types
e2e/          Playwright tests and the WAV generator
docs/         architecture, providers, deployment, limitations, licences
```

## Conventions

- Put logic in pure functions first, then wire to UI. If you can't unit test it, it probably belongs in a smaller function.
- Strict TypeScript, `erasableSyntaxOnly` (no enums or constructor parameter properties).
- Don't read audio data in React render; the visualiser works from a `requestAnimationFrame` loop with refs.
- Don't add network calls outside `providers/` and `lib/http.ts`; add hosts to the CSP.
- Accessibility: every icon button needs `aria-label`; interactive things must be reachable by keyboard; don't rely on colour alone (availability badges have text).
- Keep the user-facing text honest: say what happened, not what we hoped would.

## Release

1. Update `CHANGELOG.md` and the version in `package.json`.
2. `npm run typecheck && npm test && npm run build && npm run e2e && npm run licenses`.
3. Tag `vX.Y.Z`; pushing `main` deploys Pages if enabled.
