# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Fixed
- New releases on phones: the four filter dropdowns no longer run off the right edge (2×2 grid), and switches now show visible labels (also the Equaliser "on" switch).

### Changed
- New releases opens on "Listen now" (only releases with a legal stream) when the catalogue has any; "Everything" shows info-only releases too.

### Tests
- New browser test checks that no element on New releases is wider than a 390 px screen and that switch labels are visible text.

## [0.1.0]

First public version.

### Added
- Local-first PWA: playback with queue, shuffle, repeat, crossfade, speed, session resume, Media Session controls.
- Equaliser (5 / 10 / 15 bands, presets, saved presets, preamp with auto-headroom, bass / treble, loudness, balance, stereo width), output limiter with soft-clip guard.
- Real-time visualiser with 9 styles and immersive mode.
- Provider adapters: Jamendo, Internet Archive, Wikimedia Commons, ListenBrainz, MusicBrainz.
- Automatic catalogue sync, New releases and Trending pages, availability labels, follow artists.
- Library import with tag and cover-art reading, playlists with JSON / M3U import and export.
- Local recommendations with visible reasons, listening statistics with Wrapped-style summary.
- Unified search, settings, privacy controls, backup and restore, offline support.

### Known limitations
See `docs/KNOWN_LIMITATIONS.md`. Notably: live Jamendo, Wikimedia Commons and MusicBrainz responses, real-device background playback, Firefox / Safari, and the GitHub workflows were not verified.
