# Architecture

OpenSong is a static single-page app. Everything runs in the browser; the only network traffic is to the music sources the user enabled.

```
┌────────────────────────────── UI (React, Tailwind) ──────────────────────────────┐
│ pages/*  ·  components/*  ·  hash router (works on any static host)               │
└───────────────┬───────────────────────┬───────────────────────┬──────────────────┘
                │ zustand stores         │ Dexie live queries     │ pure logic
        store/player  store/settings     lib/db (IndexedDB)       lib/queueLogic, recommend, stats,
        store/ui      catalog/sync       lib/library, presets      catalog/queries, audio/eq, audio/viz
                │                        │
        ┌───────▼────────┐       ┌───────▼────────┐        ┌───────────────────────┐
        │ audio/engine   │       │ providers/*    │───────▶│ lib/http (fetchJson)   │
        │ Web Audio graph│       │ MusicProvider  │        │ queue · retry · cache  │
        └────────────────┘       └────────────────┘        └───────────────────────┘
```

## Layers and rules

- **Pure logic is separate from UI and from I/O.** `queueLogic`, `recommend`, `stats`, `eq`, `viz` (drawing maths), `catalog/queries`, `m3u`, `validate` take plain data and return plain data, which is why they have direct unit tests.
- **Stores hold UI state, Dexie holds user data.** `settings` is persisted to `localStorage` (`opensong:settings`, deep-merged with defaults so new keys appear after upgrades). Everything else lives in IndexedDB and pages subscribe with `useLive` (Dexie `liveQuery`), so changes in one place appear everywhere.
- **Nothing is trusted from outside.** Provider responses, imported playlists and backups pass through `validate.ts` (`sanitizeTrack`, `sanitizePlaylist`, `safeUrl`): only `http(s)` URLs, bounded string lengths, known availability values.

## Data model (IndexedDB `opensong`, schema v1)

| Table | Purpose |
|---|---|
| `tracks` / `blobs` | Imported local files (metadata and the audio / cover blobs) |
| `catalog` | Discovered releases, deduplicated by `dkey` (normalised artist + title) |
| `playlists`, `favourites`, `favAlbums`, `follows`, `searches` | User collections |
| `history` | One row per listening session of a track (listened seconds, counted-as-play, skipped) |
| `presets` | Saved equaliser and visualiser presets |
| `meta` | Sync timestamps, the "recent tracks" index, misc keys |
| `apiCache` | HTTP response cache with TTL (also used as a stale fallback when a source is down) |

## Audio engine (`src/audio/engine.ts`)

```
deck A ┐
deck B ┴▶ mix ▶ preamp ▶ EQ bands (shelf · peaking… · shelf) ▶ bass ▶ treble ▶ loudness low/high
        ▶ mid/side stereo width ▶ balance ▶ limiter (DynamicsCompressor) ▶ soft-clip guard
        ▶ AnalyserNode ▶ master volume ▶ speakers
```

- **Two processed decks** (`<audio>` elements through `MediaElementAudioSourceNode`) enable crossfade: the idle deck loads the next track and the two gains ramp. A third **bypass** element plays streams that cannot be processed.
- **Persistent elements** are reused rather than recreated, which keeps playback alive in the background and on iOS lock screens (not verified on real devices).
- **CORS fallback.** Remote streams are loaded with `crossOrigin="anonymous"`. If the host does not send CORS headers, the element would be silenced by Web Audio, so the engine falls back to the bypass element: the music plays, but the equaliser and visualiser cannot affect or see it, and the UI says so. Local files (blob URLs) are always processed.
- **Parameter changes** use `setTargetAtTime` (15 ms) to avoid zipper noise. `effectiveParams` applies auto-headroom (0.6 × the largest boost) so boosting bands does not raise the overall level into the limiter.
- **Output guard.** A `DynamicsCompressor` (threshold -2 dB, ratio 20) acts as a limiter, followed by a `WaveShaper` soft clipper that is transparent below 0.8 and never exceeds 0.97. End-to-end testing showed the compressor alone let peaks reach about 1.1 with +24 dB of requested gain, which is why the guard exists. It is a safety device, not a mastering-grade true-peak limiter.
- **Visualiser** reads the `AnalyserNode` (`getByteFrequencyData` / `getByteTimeDomainData`), collapses bins into log-spaced bands and draws with pure functions in `viz.ts`. With no data it draws nothing and explains why.

## Provider adapters (`src/providers`)

Each source implements `MusicProvider` (`search`, `newReleases`, `trending`, `byGenre`, `artistReleases`, `expand`, `resolveTrack`; all optional except identity and `isConfigured`). Mapping from API JSON to `Release` / `Track` is done in exported pure functions so it can be tested with fixtures. All requests go through `fetchJson`:

- one serial queue per provider with a minimum interval (rate-limit friendly),
- retry with backoff on 429 / 5xx / network errors, honouring `Retry-After`,
- IndexedDB cache with TTL and a stale-cache fallback when the source is failing,
- health counters shown in the UI, `credentials: 'omit'`.

See [PROVIDERS.md](PROVIDERS.md).

## Catalogue sync (`src/catalog/sync.ts`)

- Per-provider timestamps (`sync:new:<id>`, `sync:trending:<id>`, `sync:maintenance`). New releases are due every 6 h, trending every 12 h, maintenance every 24 h. First run looks back 14 days; later runs only ask for what is new since that provider's last success (up to 3 pages).
- Triggered when the app opens, every 20 minutes while open, when the tab becomes visible or the network returns, and by the Refresh buttons. **Browsers cannot run a web app's code when it is closed**, so there is no background sync, and the UI never claims otherwise.
- Results are merged by `dkey`, preferring the better availability (full stream over metadata), keeping the earliest `discoveredAt`. Entries not seen for 60 days are pruned (followed artists' releases are kept). One failing provider never blocks the others.
- **Dates are never invented.** `releaseDate` is whatever the source reports (possibly partial). Undated releases are shown as such and ordered by when the source or OpenSong first saw them.

## Recommendations (`src/lib/recommend.ts`)

Affinity per artist and genre = sum over listening history of weight × 0.5^(age / 30 days), with plays and completions positive, skips negative, favourites +3 / +2 and follows +4. A candidate scores affinity + 0.6 × genre affinity + freshness + playability − repeat penalty, and must be relevant to the user's taste. Each result carries human-readable `reasons`. Nothing leaves the device.

## Statistics (`src/lib/stats.ts`)

A track counts as a play after min(30 s, 50 % of its duration). Ranges are calendar-based (weeks start Monday, local time); sessions are separated by 30 minutes of silence. The "listener type" is a fixed set of rules over the same numbers and shows its reason.

## PWA and security

- `vite-plugin-pwa` precaches the app shell. Audio and video requests are `NetworkOnly`: providers have not granted offline caching, so third-party audio is never stored. Cross-origin artwork is cached for 30 days.
- Production builds inject a Content-Security-Policy `<meta>` (GitHub Pages cannot set headers): scripts from self (plus `www.youtube.com` and `s.ytimg.com`, used only when you opt in to the YouTube source and play a YouTube song), `frame-src` limited to `www.youtube.com`, `connect-src` limited to the source hosts, Cover Art Archive and `www.googleapis.com` (YouTube Data API), `object-src 'none'`. `style-src` allows inline styles because React and the charts use style attributes.
- Hash routing (`#/library`) avoids server rewrites on static hosts.
