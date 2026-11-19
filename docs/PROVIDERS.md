# Music sources (providers)

OpenSong only plays what a source explicitly allows. This page lists what each adapter does, what is verified, and how to add one.

| Source | Provides | Playback | Key | Min. spacing | Cache TTL |
|---|---|---|---|---|---|
| **Jamendo** (`jamendo.ts`) | Search, new releases, trending, genres, artist releases, track lists | Full stream | Your own free client ID (`keyRequired`) | 0.4 s | 1-6 h |
| **Internet Archive** (`archive.ts`) | Search, new items, trending, genres, track resolution | Full stream **only** when the item declares a Creative Commons / public-domain licence; otherwise `external` | None | 0.5 s | 6 h |
| **Wikimedia Commons** (`commons.ts`) | Search, new files, genres | Full stream of the original file | None | 0.5 s | 1 h |
| **ListenBrainz** (`listenbrainz.ts`) | Fresh releases (project-wide), community trends | Metadata only | None | 1.1 s | 30 min / 6 h |
| **MusicBrainz** (`musicbrainz.ts`) | Search, artist discographies | Metadata only | None | 1.1 s | 24 h |

## Rules every adapter follows

1. **Availability is conservative.** `full` only when the source gives a stream URL *and* permits streaming. A licence label that cannot be determined means `external`, never `full`. Metadata sources always return `metadata`.
2. **Never invent data.** Release dates are the source's own (possibly partial); missing stays missing.
3. **Be polite.** Use the shared `fetchJson` (serial queue, minimum spacing, retries with backoff, caching). Do not bypass the limits.
4. **Attribute.** Set `sourceUrl` (human page) and `license` / `licenseUrl` on every playable track; the UI shows them.
5. **Validate.** URLs go through `safeUrl`; strings are bounded.
6. **Disclose.** Fill in `playback`, `dataLicense`, `rateLimit`, `hosts`, `homepage`, `termsUrl`. Settings → Music sources renders them verbatim, and `hosts` feeds the "servers contacted" list.

## Verification status

| Source | Response shape checked against a real response | Run end to end against the live service from a browser |
|---|---|---|
| ListenBrainz (fresh releases) | Yes | No |
| Internet Archive (search, item metadata) | Yes | No |
| Jamendo | No, built from the public API documentation | No |
| Wikimedia Commons | No, built from the MediaWiki API documentation | No |
| MusicBrainz | No, built from the public API documentation | No |

The build environment could not reach these hosts, so the adapters are covered by fixture-based tests (`src/providers/providers.test.ts`) that assert the mapping, the availability rules and the failure behaviour. If a live API differs from the fixture, the symptom is an empty or partial result and a red status in Settings → Music sources; please open an issue with the status text.

## Adding a source

1. Open a "Propose a music source" issue and link the exact terms that allow third-party apps to stream or display the content. No clear permission means no adapter.
2. Create `src/providers/<id>.ts` implementing `MusicProvider`; export pure `mapX` functions and keep network calls in the provider object.
3. Register it in `registry.ts` and add the id to the defaults in `store/settings.ts`.
4. Add the hosts to `connect-src` (and `media-src` / `img-src` if they are not already `https:`) in `vite.config.ts`.
5. Add fixture tests for mapping, availability, and error handling. Include a test that a record without a stream URL or licence is **not** `full`.
6. Add the source to the tables in this file and the README.

## Things OpenSong will not do

Scrape or reverse-engineer YouTube, Spotify, Apple Music or any service without a public API that permits this use; bypass DRM, geo-blocks, paywalls or rate limits; ship shared API secrets; treat metadata as permission to play.
