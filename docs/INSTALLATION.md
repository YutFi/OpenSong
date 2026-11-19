# Installation and use

## Use the hosted app

If someone hosts OpenSong (for example on GitHub Pages), open the address in a current browser. No sign-up.

**Install it like an app** (optional): Chrome / Edge show an *Install* option in the address bar or in Settings → Appearance; on Android use *Add to Home screen*; on iOS Safari use *Share → Add to Home Screen*. Installed, it opens full screen and works offline for your library.

## Run it yourself

Requirements: Node.js 22.12 or newer and npm.

```bash
git clone https://github.com/YutFi/OpenSong.git
cd opensong
npm install
npm run build
npm run preview        # http://localhost:4173
```

For development use `npm run dev` (http://localhost:5173). The service worker and the Content-Security-Policy only exist in production builds.

## First steps

1. **Add music you own:** Library → *Add files* or *Add folder* (or drag files onto the page). Supported: MP3, WAV, FLAC, OGG / Opus, M4A / AAC (what actually plays depends on your browser; unsupported files are reported, not silently dropped).
2. **Get streaming music:** Home → *Refresh*. For Jamendo, create a free client ID at <https://developer.jamendo.com/v3.0> and paste it into Settings → Music sources. Internet Archive, Wikimedia Commons, ListenBrainz and MusicBrainz need no key.
3. **Make it sound right:** Equaliser page. Boosting bands lowers the level automatically (auto-headroom) so it does not clip.
4. **Back up** your playlists, favourites and history from Settings → Your data. Audio files you imported are *not* in the backup; keep your originals.

## Browser notes

| | |
|---|---|
| Chrome / Edge (desktop and Android) | The tested configuration (desktop Chrome) |
| Firefox, Safari (macOS, iOS) | Not tested yet. Safari cannot decode Ogg in some versions, so Wikimedia Commons audio and `.ogg` imports may fail there |
| Lock-screen controls | Use the Media Session API; not verified on real devices. If playback stops when the screen locks, turn on *Skip audio processing for online streams* in Settings → Playback |
| Storage | Library audio lives in IndexedDB. Browsers may clear it when space is low; Settings → Your data → *Protect storage* asks the browser to keep it |

## Troubleshooting

- **"No releases yet"** – press Refresh. Check Settings → Music sources for a red status; some sources can be temporarily down and the others still work.
- **No sound from the equaliser on an online stream** – that host does not allow audio analysis; the stream plays unprocessed (the Equaliser and Visualiser pages say so).
- **A file will not import** – the import summary lists the reason (unsupported format, unreadable file, or duplicate).
- **Everything looks stale after an update** – the app updates itself; close all tabs of it and reopen.
