# Known limitations

An honest list of what is unverified, unfinished or inherently limited. If you find something that belongs here, please open an issue.

## Unverified (built, but not proven in the real world)

| Item | Status |
|---|---|
| Jamendo, Wikimedia Commons and MusicBrainz live responses | Adapters were written from public API documentation and tested with fixtures. The build environment could not reach these hosts. A mismatch would show up as empty results and a red status in Settings → Music sources. |
| ListenBrainz and Internet Archive | Response shapes were compared with real responses, but the adapters have not been run from a browser against the live services (including whether their endpoints answer cross-origin requests from a deployed page). |
| CORS on audio hosts | The equaliser and visualiser need the audio host to send CORS headers. When it does not, OpenSong falls back to plain playback and says so. Which hosts do and do not is unknown until tested live. |
| Lock-screen / background playback | The Media Session API is wired and the engine keeps persistent elements, but this was not tried on real iOS or Android devices. |
| Browsers | Only desktop Chrome (plus a 390 px emulated viewport) was tested. Firefox and Safari are untested. |
| GitHub Actions and Pages | Workflow YAML parses; nothing has run on GitHub. |
| Notifications for followed artists | Implemented behind the browser permission, only fires while the app is open or running; not tested in a real browser prompt flow. |
| Assistive technology | Labels, roles and keyboard support exist. No screen-reader or automated accessibility audit was done. |
| Real-world audio files | Import tests use generated WAV files with RIFF tags plus fixtures. Tag and cover-art parsing for MP3 / FLAC / M4A relies on the `music-metadata` library and has not been exercised with a large collection. |
| Runtime performance | Only bundle size was measured (first load: 524 KB raw, 168 KB gzipped JavaScript). There was no Lighthouse audit, no profiling on low-end phones, and no long-session memory test; the visualiser has a low-power mode that has not been benchmarked. |
| Large libraries | Audio is stored in IndexedDB; quotas and eviction behaviour vary by browser. Not load-tested. |

## By design

- **No background sync.** Catalogue updates happen only while OpenSong is open (on launch, periodically, on focus, on reconnect, or manually). A web app cannot run when closed.
- **No catalogue of commercial music.** Only freely licensed and public-domain music, plus your own files.
- **Metadata-only sources never play.** The **Preview** availability exists in the model for sources that offer short samples, but no current provider returns one.
- **Third-party audio is never cached offline.** Providers have not granted that permission, so offline playback is limited to your own library.
- **M3U import** keeps remote URLs as non-playable external entries, because their rights cannot be verified.
- **Backups exclude audio files** and the Jamendo client ID.
- **Loudness** is an equal-loudness style lift for quiet listening; it is not ReplayGain / loudness normalisation across tracks.

## Audio

- The output guard is a compressor-based limiter plus a soft clipper. It keeps the signal under full scale (tested) but is not a mastering-grade true-peak limiter; extreme boosts will sound compressed or saturated.
- Crossfade works between processed tracks; it is skipped when a stream is playing in bypass mode.
- The equaliser curve drawing is an approximation (sum of bell shapes), not the exact biquad response.
- Browsers differ in codecs: Ogg Vorbis / Opus and FLAC are not decodable everywhere (notably older Safari).
- Playback speed changes pitch together with tempo (no time-stretching).

## Data and statistics

- Statistics use local time and Monday-based weeks. Clearing site data or switching browsers resets history; use backups.
- The "listener type" is a small set of fixed rules, not machine learning.
- The Wrapped-style cards are on-screen only (no image export yet).

## Not implemented

Lyrics, podcasts and radio, multi-device sync, user accounts (intentionally), importing playlists from other services, per-track normalisation, gapless playback beyond what crossfade provides, translations.
