# OpenSong

**Free, open-source music streaming and discovery that lives in your browser.**
No accounts. No ads. No subscription. No servers of ours. Your library, playlists and listening history never leave your device.

OpenSong plays music that is *legally free to stream*: Creative Commons and public-domain recordings from [Jamendo](https://www.jamendo.com), the [Internet Archive](https://archive.org) and [Wikimedia Commons](https://commons.wikimedia.org), plus any audio files you own. Optionally, you can add your own free YouTube key to hear today's popular songs in YouTube's official player. Those songs are free to listen to, not openly licensed, and come with limits (see below). It discovers new releases through the open [MusicBrainz](https://musicbrainz.org) and [ListenBrainz](https://listenbrainz.org) projects, and gives you a serious equaliser, a real-time visualiser, playlists, recommendations and listening statistics, all computed locally.

> **What OpenSong is not.** It is not a way to listen to Spotify, YouTube, Apple Music or other commercial catalogues, and it never will be: it does not scrape them, bypass DRM, or rip audio. If a release is only known as metadata, OpenSong says so and shows no play button. *Knowing a release exists never implies the right to stream it.*

---

## Features

| Area | What you get |
|---|---|
| **Playback** | Queue (play next, add, reorder, remove), shuffle, repeat (off / all / one), crossfade, playback speed, resume where you left off, keyboard shortcuts, lock-screen controls through the Media Session API |
| **Equaliser** | 5, 10 or 15 bands (±12 dB), 11 presets, your own saved presets, preamp with auto-headroom, bass / treble, loudness lift, balance, stereo width, live response curve, output limiter plus soft clip so boosts cannot clip |
| **Visualiser** | 9 styles driven by the *real* audio signal (`AnalyserNode`), colour / glow / sensitivity / speed controls, presets, immersive fullscreen, low-power mode. If a source cannot be analysed it says so; it never fakes motion |
| **New releases** | Catalogue sync while the app is open (new releases every 6 h, trending every 12 h, daily clean-up) and on demand; filters by date window, type, genre, country, source, independent artists, followed artists, playable-only; grouped by the exact release date each source reports |
| **Availability labels** | Every release is **Full stream**, **Preview**, **External**, **Metadata only** or **Local file** |
| **Home** | Recently played, continue listening, recommended for you, new releases, trending, independent artists, discover something new, "because you listen to...", favourite genres, your playlists |
| **Library** | Import MP3, WAV, FLAC, OGG/Opus, M4A/AAC from files or folders; tags and cover art read automatically; duplicate detection; stored in the browser (IndexedDB) |
| **Playlists** | Create, edit, reorder (drag or menu), cover image, export and import as JSON or M3U/M3U8 |
| **Recommendations** | A transparent local model (artist and genre affinity with time decay, favourites, follows). Every pick shows *why* it was chosen. Can be turned off |
| **Statistics** | Wrapped-style summary: time listened, top songs / artists / albums / genres, listening by hour, sessions, "on repeat", busiest month, a rule-based listener type that always shows its reason, CSV export |
| **Search** | One box across your library, playlists, the local catalogue and every enabled source |
| **Privacy and data** | Backup / restore (JSON), erase everything, list of servers contacted, no analytics, no cookies |
| **PWA** | Installable; the app shell, your library, playlists and statistics work offline |

## Verified and not yet verified

OpenSong is early software. This is what has actually been checked, and how.

| Checked | How |
|---|---|
| Logic layer: queue, EQ maths, recommender, statistics, sync merge / dedupe / windows, input validation, M3U, backup, HTTP retry and cache, availability labelling | 111 automated unit and component tests (`npm test`) |
| Type safety and the production build | `npm run typecheck`, `npm run build` |
| Real audio in a real browser | 13 Playwright end-to-end tests in desktop Chrome: imports a generated WAV and reads its tags; plays it; measures the live analyser; confirms the equaliser changes a 1 kHz tone by about +12 dB and -12 dB; confirms the limiter keeps a heavily boosted signal under full scale; confirms the visualiser canvas draws from live audio; playlist persistence across reload; offline reload with the service worker; 390 px phone viewport without horizontal overflow; every route renders; no Content-Security-Policy violations in the production build; first load is about 168 KB of gzipped JavaScript and does not load the tag parser until you import files |
| The app keeps working when every music source is unreachable | End-to-end test (the build environment could not reach the provider hosts) |
| Dependencies | 26 production packages, all permissive-licensed and GPL-3.0-compatible ([list](docs/DEPENDENCY_LICENSES.md)); `npm audit --omit=dev` reported 0 known vulnerabilities |

**Not verified.** Please read [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) before relying on these:

- **Live responses from Jamendo, Wikimedia Commons and MusicBrainz.** Those adapters are tested against fixtures built from the documented response shapes. The ListenBrainz and Internet Archive shapes were compared with real responses, but none of the five has been run end to end from a browser against the live service.
- **YouTube.** Not run against the live API or the live player; tests use a fixture and a fake player. See [docs/PROVIDERS.md](docs/PROVIDERS.md).
- Whether each remote audio host sends the CORS headers the equaliser and visualiser need. When one does not, OpenSong plays the stream unprocessed and says so.
- Lock-screen and background playback on real iOS and Android devices.
- Firefox and Safari (only Chrome was tested).
- The GitHub Actions workflows and the GitHub Pages deployment (their YAML parses; they have not run).
- Screen-reader behaviour. Labels and keyboard support are in place; there has been no assistive-technology testing.

No source currently returns preview-only streams, so the **Preview** label exists in the data model but you should not expect to see it yet.

## Quick start

Requires Node.js 22.12 or newer.

```bash
git clone https://github.com/YutFi/OpenSong.git
cd opensong
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # type-check + production build into dist/
npm run preview      # serve the build on :4173
npm test             # unit and component tests
npm run e2e          # Playwright tests (build first; see docs/DEVELOPMENT.md)
npm run licenses     # check production dependency licences
```

### Optional: full-length Jamendo streaming

Jamendo requires a client ID. Create a free one at <https://developer.jamendo.com/v3.0>, then paste it into **Settings → Music sources**. It is stored only in your browser and is never added to backups. Without it, OpenSong still plays Internet Archive and Wikimedia Commons music and your own files.

### Deploy

Fork the repo, set **Settings → Pages → Source** to **GitHub Actions**, and push to `main`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), which also covers Netlify, Cloudflare Pages and any static host.

## Music sources

| Source | Role | Playback | Key |
|---|---|---|---|
| Jamendo | Independent music, Creative Commons | Full streams | Your own free client ID |
| Internet Archive | Netlabels, live and historical audio | Full streams, only for items declaring an open licence | None |
| Wikimedia Commons | Freely licensed recordings | Full streams | None |
| ListenBrainz | Fresh releases, community trends | Metadata only | None |
| MusicBrainz | Artist and album encyclopedia | Metadata only | None |
| YouTube (optional, off by default) | Popular music chart for your region | Plays in YouTube's own visible player: no equaliser, visualiser or background play | Your own free Google API key |

Each track shows its licence and a link back to its source. Rate limits and the rules for adding a source are in [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Privacy

- No accounts, analytics, ads, cookies or telemetry in OpenSong itself, and no backend. (YouTube's player, if you opt in, is separate; see below.)
- Your history, favourites, playlists, library and settings live in your browser (IndexedDB and localStorage).
- Search words and artist names you look up are sent to the sources you have enabled. Settings → Privacy lists exactly which hosts are contacted.
- Only if you turn on the optional YouTube source and play a YouTube song: YouTube's own player loads from Google servers and may set its own cookies. OpenSong itself sets none.
- A strict Content-Security-Policy limits the production build to those hosts.

## Tech

React 19, TypeScript, Vite, Tailwind CSS v4, Web Audio API, Dexie (IndexedDB), zustand, music-metadata, Lucide, Vitest, Playwright. Architecture overview: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Contributing

Bug reports, fixes and new sources are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md).

## Licence

[GNU General Public License v3.0 only](LICENSE). Music remains the property of its artists and is played only under the terms each source publishes.
