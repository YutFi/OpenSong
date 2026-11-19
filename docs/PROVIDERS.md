# Music sources (providers)

OpenSong only plays what a source explicitly allows. This page lists what each adapter does, what is verified, and how to add one.

| Source | Provides | Playback | Key | Min. spacing | Cache TTL |
|---|---|---|---|---|---|
| **Jamendo** (`jamendo.ts`) | Search, new releases, trending, genres, artist releases, track lists | Full stream | Your own free client ID (`keyRequired`) | 0.4 s | 1-6 h |
| **Internet Archive** (`archive.ts`) | Search, new items, trending, genres, track resolution | Full stream **only** when the item declares a Creative Commons / public-domain licence; otherwise `external` | None | 0.5 s | 6 h |
| **Wikimedia Commons** (`commons.ts`) | Search, new files, genres | Full stream of the original file | None | 0.5 s | 1 h |
| **ListenBrainz** (`listenbrainz.ts`) | Fresh releases (project-wide), community trends | Metadata only | None | 1.1 s | 30 min / 6 h |
| **MusicBrainz** (`musicbrainz.ts`) | Search, artist discographies | Metadata only | None | 1.1 s | 24 h |
| **YouTube** (`youtube.ts`, opt-in, off by default) | Most-popular music chart for a region; search | Plays **inside YouTube's official embedded player** (not an audio file). `ytPlayer.ts` uses only documented IFrame Player API methods | Your own free Google API key (`keyRequired`) | 0.5 s | 1-3 h |

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
| YouTube (Data API v3 + IFrame Player) | No: built from Google's documentation and a hand-written fixture | No. Tests use a fake `YT.Player` that follows the documented method and event names |

The build environment could not reach these hosts, so the adapters are covered by fixture-based tests (`src/providers/providers.test.ts`) that assert the mapping, the availability rules and the failure behaviour. If a live API differs from the fixture, the symptom is an empty or partial result and a red status in Settings → Music sources; please open an issue with the status text.

## The YouTube source, in detail

- **Opt-in.** Off by default. Nothing is requested from Google or YouTube until you turn it on, add your own key and play a YouTube song (a browser test checks this).
- **Cost.** Free, using Google's default free quota. The chart uses `videos.list` (1 quota unit per call); search uses `search.list`, which Google charges more for, so it only runs when you search, and results are cached. If the free quota runs out, YouTube results pause until it resets. OpenSong never uses a paid plan or a shared key.
- **Player rules followed:** the player stays visible (at least 200 × 200 px) while a song plays; nothing is drawn over it (notifications move to the top of the screen while it shows); no player controls or branding are altered; only documented methods are called. Videos the owner has blocked from embedding are never offered, and ones that turn out unplayable are skipped.
- **What does not apply to YouTube songs:** the equaliser, visualiser, crossfade and speed (the audio never enters the Web Audio graph), and background / lock-screen playback.
- **Data kept on this device:** catalogue entries from YouTube are removed after 30 days without being refreshed (my reading of the YouTube API rules, which I have not had checked; please read the [API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service) yourself). Favourites and playlists keep the titles you saved, and those are not auto-expired.
- **Dates.** `releaseDate` is the day the video was published on YouTube, not necessarily the song's original release date.
- **Not verified:** the live Data API and the live player have not been tried. The key must be created by you and restricted to your site; an unrestricted key in a browser can be copied by anyone who opens developer tools.

## Adding a source

1. Open a "Propose a music source" issue and link the exact terms that allow third-party apps to stream or display the content. No clear permission means no adapter.
2. Create `src/providers/<id>.ts` implementing `MusicProvider`; export pure `mapX` functions and keep network calls in the provider object.
3. Register it in `registry.ts` and add the id to the defaults in `store/settings.ts`.
4. Add the hosts to `connect-src` (and `media-src` / `img-src` if they are not already `https:`) in `vite.config.ts`.
5. Add fixture tests for mapping, availability, and error handling. Include a test that a record without a stream URL or licence is **not** `full`.
6. Add the source to the tables in this file and the README.

## Things OpenSong will not do

Scrape or reverse-engineer YouTube, Spotify, Apple Music or any service without a public API that permits this use; bypass DRM, geo-blocks, paywalls or rate limits; ship shared API secrets; treat metadata as permission to play.
