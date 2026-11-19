# Build report (version 0.1.0)

Reported against the nine phases of the project brief. "Tested" means an automated test or a measurement ran and passed; "built, not tested" means the code exists but nothing verified it.

## Phase 1 — Research and architecture
- **Done:** stack chosen (React, TypeScript, Vite, Tailwind v4, Dexie, zustand, Web Audio); provider adapter architecture; repository structure; decisions recorded in `docs/ARCHITECTURE.md` and `docs/PROVIDERS.md`.
- **Verified:** ListenBrainz fresh-releases and Internet Archive search / metadata response shapes were compared with real responses. **Not verified:** live Jamendo, Wikimedia Commons and MusicBrainz responses (the sandbox could not reach them). Pricing, rate limits and terms are summarised in `docs/PROVIDERS.md` from each source's published documentation; terms change, so re-read them before you publish.
- **Finding:** Jamendo is the only source needing a key; it is optional and entered by each user.

## Phase 2 — Design system
- **Done:** dark-first theme with light mode and runtime accent colour, typography, UI primitives (button, input, switch, slider, modal, menu, chips, skeletons), sidebar and mobile bottom navigation, responsive layouts.
- **Tested:** every route renders (e2e); no horizontal overflow at 390 px on six routes (e2e); screenshots reviewed at desktop and phone width; component tests for labelling and accessible names. **Not tested:** screen readers, automated accessibility audit.

## Phase 3 — Core application
- **Done:** Home (all 11 sections), Search, Library with import, persistent player bar, Now Playing, queue drawer, keyboard shortcuts, Favourites, Recently played, Artists, Playlists.
- **Tested:** queue logic (unit); import + tags + playback + persistence (e2e); playlists across reload and M3U export (e2e).

## Phase 4 — Audio engine
- **Done:** two-deck Web Audio graph with crossfade, 5 / 10 / 15-band EQ, presets, effects (preamp, bass / treble, loudness, balance, width), limiter with soft clip, speed, visualiser (9 styles, immersive), Media Session, bypass fallback for streams without CORS.
- **Tested in real Chrome:** analyser sees a clean 1 kHz tone; EQ changes the level by the requested ±12 dB (measured 9-15 dB window); limiter keeps +24 dB of requested gain under full scale; visualiser draws pixels from live audio and states honestly when idle.
- **Defect found and fixed:** the compressor-only limiter allowed peaks of about 1.1; a soft-clip guard was added.
- **Not tested:** real iOS / Android background playback, Firefox, Safari, real remote-stream CORS behaviour.

## Phase 5 — Music discovery
- **Done:** five provider adapters, shared HTTP layer (queue, spacing, retry, cache, health), catalogue sync (6 h / 12 h / daily, on open and manual, incremental, deduplicated), New releases page with filters and per-date grouping, Trending page, availability labels, follow artists.
- **Tested:** mapping, availability rules and failure behaviour with fixtures; sync windows, merge, dedupe and prune (unit); the app stays functional when every provider fails (e2e). **Not tested:** live provider calls from a browser.

## Phase 6 — Personalisation
- **Done:** local recommender with visible reasons, history with play-counting rules, favourites, playlists (JSON / M3U), statistics with Wrapped-style cards and CSV export.
- **Tested:** recommender, statistics and history accounting (unit); playlist persistence (e2e).

## Phase 7 — PWA
- **Done:** manifest and icons, service worker (precache, audio never cached), install prompt in Settings, local storage with a persistence request.
- **Tested:** the app reloads offline after the service worker takes control and plays a local track (e2e). **Not tested:** installation on real devices.

## Phase 8 — Testing
- **Functional:** 111 unit and component tests, 13 Playwright tests, all passing.
- **Browser compatibility:** desktop Chrome only (plus a 390 px emulated viewport). Firefox and Safari untested.
- **Performance:** first load 524 KB raw / 168 KB gzipped JavaScript; tag parser loads lazily. No Lighthouse or profiling.
- **Security:** CSP present and no violations in a full usage run; input validation tests (hostile `javascript:` URLs, bad backups); `npm audit --omit=dev` reported 0 vulnerabilities; no secrets, analytics or tracking found by scan.
- **Production build:** `npm run build` succeeds.

## Phase 9 — GitHub release
- **Done:** README, GPL-3.0 `LICENSE`, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, issue and PR templates, three workflows (CI, Pages deploy, weekly audit), docs (architecture, providers, installation, development, deployment, testing, known limitations, dependency licences).
- **Tested:** all YAML parses (this caught and fixed two invalid files). The workflows have not run on GitHub.
- **Release checklist:** push; enable Pages (Actions); confirm CI is green; try Jamendo with your own client ID; test one real phone; tag `v0.1.0`.

## Strict rules check
No paid APIs, ads, accounts, backend or analytics (scan clean); no hardcoded credentials (`.env.example` is empty); no scraping of YouTube / Spotify / Apple (scan clean); metadata-only releases get no play button (component tests); release dates are never invented (component and unit tests); the app works when every source fails (e2e); untested items are listed in `KNOWN_LIMITATIONS.md` rather than claimed.
