# Testing

| Layer | Tool | Files | What it proves |
|---|---|---|---|
| Unit / logic | Vitest (jsdom, fake-indexeddb) | `src/lib/*.test.ts`, `src/audio/*.test.ts`, `src/catalog/catalog.test.ts`, `src/providers/providers.test.ts` | Queue behaviour (shuffle, repeat, reorder, removal), EQ maths and presets, headroom, soft-clip curve, visualiser band maths, recommender scoring and reasons, statistics ranges / sessions / personality rules, sync windows / merge / dedupe / pruning, HTTP retry / cache / health, provider mapping and availability rules, validation, M3U, library import, backup round trip |
| Component | Vitest + Testing Library | `src/components/components.test.tsx` | Availability labels; metadata-only and external releases get no play button; no invented dates; playable tracks expose accessible controls |
| End to end | Playwright + Chrome | `e2e/app.spec.ts` | See below |

Run: `npm test`, then `npm run build && npm run e2e`.

## End-to-end scenarios (16)

1. Home renders and the app stays usable when every provider is unreachable; Refresh finishes without errors.
2. Every route renders without a crash.
3. A generated WAV is imported (title and artist tags read from the file), plays, position advances, and the analyser shows a clean 1 kHz peak 30+ dB above the noise floor.
4. Equaliser: +12 dB on the 1 kHz band raises the measured 1 kHz level by 9-15 dB and -12 dB lowers it by 9-15 dB; the baseline is stable.
5. Limiter: with +24 dB of requested gain on a loud tone, the output peak stays at or below 1.0.
6. Visualiser: says "Press play" when idle; draws non-background pixels while audio plays.
7. Playlist: create from the add-to-playlist dialog, survives reload, M3U export downloads.
8. Queue: three files, play, next, shuffle toggles (repeat and previous rules are covered by unit tests).
9. Settings: theme change persists across reload.
10. Offline: after the service worker takes control, with the network off the app reloads, the library is visible and a track plays.
11. Phone viewport (390 px): bottom navigation present and six main routes have no horizontal overflow.
12. Security: the production build contains a CSP meta tag, and no `securitypolicyviolation` event fires while importing, playing and visiting eight routes.
13. Performance: first load fetches under 700 KB of uncompressed JavaScript (measured: 524 KB, about 168 KB gzipped) and does not fetch the `music-metadata` parser chunks until files are imported.

14. New releases on a 390 px phone: no element wider than the screen, switch labels visible as text, "Listen now" is the automatic default when something is playable.
15. A YouTube track plays in the visible embed (fake `YT.Player`): at least 200 × 200 px, nothing covering its corners or centre, above the phone's bottom bar, notifications kept clear of it; pause / resume / next go to the embed; closing pauses; a local file hands playback back to the audio engine.
16. YouTube is opt-in: no request to any YouTube or Google host before it is turned on.

## Methodology notes

- The analyser smooths each read against the previous read, so the tests set `smoothingTimeConstant = 0` before sampling; otherwise the reading lags the signal.
- Quiet test tones are used for equaliser measurements so boosts stay below the limiter threshold; a separate test covers the limiter.
- While writing these tests the limiter test exposed a real defect (peaks near 1.1 with large boosts); the soft-clip guard was added as a result. The bundle test exposed that a manual chunk rule pulled the 300 KB tag parser into first load; the rule was removed and parsers now load on demand. Validating the GitHub workflow and issue-template YAML exposed invalid flow-style YAML, which was rewritten.
- GitHub workflow files were checked for YAML validity; they have not been run on GitHub.

## Not covered

Firefox, Safari, real phones, screen readers, live provider APIs, large libraries, long-running sessions, Lighthouse-style audits and CPU profiling on low-end devices (only bundle size and a few timings were measured). See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
