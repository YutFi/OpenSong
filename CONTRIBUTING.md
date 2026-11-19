# Contributing to OpenSong

Thank you for helping. OpenSong is small, so the process is light.

## Ground rules (these decide what can be merged)

1. **Free and local-first.** No paid APIs, subscriptions, accounts, mandatory servers, analytics or ads.
2. **Legal playback only.** Audio plays only when its source explicitly permits streaming or the user owns the file. Never scrape YouTube, Spotify, Apple Music or similar; never bypass DRM, paywalls or rate limits.
3. **Metadata is not permission.** A release known only by metadata must be labelled so and must not get a play button.
4. **No fake behaviour.** No buttons that do nothing, no simulated playback, no invented release dates, no visualiser that moves without audio.
5. **No secrets in the repo or the bundle.** Anything prefixed `VITE_` is public.
6. **Be honest in docs and UI.** Do not claim something works unless it was tested; say what was and was not tested in your PR.
7. **Few dependencies.** Each new one needs a reason and a GPL-3.0-compatible licence (`npm run licenses`).

## Setup

```bash
npm install
npm run dev
```

Node.js 22.12 or newer. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run build
npm run e2e        # when you touched playback, audio, routing or the service worker
```

- Add or update tests with behaviour changes. Pure logic belongs in `src/lib`, `src/audio` or `src/catalog` where it can be unit tested.
- Check UI changes with the keyboard and at about 390 px width.
- Update `CHANGELOG.md` (under *Unreleased*) when users would notice.

## Adding a music source

Read [docs/PROVIDERS.md](docs/PROVIDERS.md). In short: link the source's terms, implement the `MusicProvider` interface with pure mapping functions, add fixture-based tests, set honest `playback` / `dataLicense` text, and add the hosts to the Content-Security-Policy in `vite.config.ts`. Only open a provider PR if the source's terms allow third-party apps to do what you implement.

## Commit and PR style

Short imperative subject lines ("Fix crossfade when the next track fails to load"). One logical change per PR. Be kind in review; see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

By contributing you agree your work is released under GPL-3.0-only, the project licence.
