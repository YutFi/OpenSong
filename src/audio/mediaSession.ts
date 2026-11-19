import { usePlayer } from '../store/player'
import { engine } from './engine'

/** Wire the browser/OS media controls (lock screen, headset buttons, notification shade) to the player. */
export function bindMediaSession() {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  const p = () => usePlayer.getState()
  const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => { try { ms.setActionHandler(a, h) } catch { /* unsupported action */ } }
  set('play', () => { if (p().status !== 'playing') void p().toggle() })
  set('pause', () => { if (p().status === 'playing') void p().toggle() })
  set('previoustrack', () => void p().prev())
  set('nexttrack', () => void p().next())
  set('seekto', (d) => { if (d.seekTime != null) p().seek(d.seekTime) })
  set('seekbackward', (d) => p().seekBy(-(d.seekOffset ?? 10)))
  set('seekforward', (d) => p().seekBy(d.seekOffset ?? 10))
  set('stop', () => { engine.pause() })

  let lastId: string | undefined
  let lastUrl: string | undefined
  const update = () => {
    const s = p()
    const t = s.current()
    ms.playbackState = s.status === 'playing' ? 'playing' : s.status === 'paused' ? 'paused' : 'none'
    if (t && (t.id !== lastId || t.artworkUrl !== lastUrl)) {
      lastId = t.id; lastUrl = t.artworkUrl
      ms.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: t.album ?? '',
        artwork: t.artworkUrl ? [{ src: t.artworkUrl, sizes: '300x300' }] : [{ src: new URL('icons/icon-512.png', document.baseURI).toString(), sizes: '512x512', type: 'image/png' }],
      })
    }
    if (!t) { ms.metadata = null; lastId = undefined }
    if (t && s.duration > 0 && Number.isFinite(s.duration)) {
      try { ms.setPositionState({ duration: s.duration, position: Math.min(s.position, s.duration), playbackRate: engine.element.playbackRate || 1 }) } catch { /* invalid state */ }
    }
  }
  let lastTick = 0
  usePlayer.subscribe((s, prev) => {
    const important = s.queue[s.index]?.id !== prev.queue[prev.index]?.id || s.status !== prev.status
    const now = Date.now()
    if (important || now - lastTick > 1000) { lastTick = now; update() }
  })
  update()
}
