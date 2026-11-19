import { create } from 'zustand'
import { engine, type EngineMode } from '../audio/engine'
import { yt, useYT } from '../audio/ytPlayer'
import { db } from '../lib/db'
import { recordRecent } from '../lib/recent'
import { providerContext } from '../lib/providerCtx'
import { indexAfterMove, isPlayable, moveItem, nextIndex, prevIndex, removeAt, restoreOrder, shuffleUpcoming, type RepeatMode } from '../lib/queueLogic'
import { providerById } from '../providers/registry'
import type { HistoryEntry, Track } from '../types'
import { useSettings } from './settings'
import { useUI } from './ui'

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface PlayerStore {
  queue: Track[]
  index: number
  originalIds: string[] | null
  status: PlayerStatus
  position: number
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  mode: EngineMode | 'embed'
  loadedId?: string
  error?: string
  /** Increments whenever the history table changes (lets pages refresh). */

  current: () => Track | undefined
  playQueue: (tracks: Track[], start?: number, opts?: { shuffle?: boolean }) => Promise<void>
  playTrack: (track: Track) => Promise<void>
  enqueue: (tracks: Track[]) => void
  playNext: (tracks: Track[]) => void
  removeFromQueue: (i: number) => void
  moveInQueue: (from: number, to: number) => void
  clearQueue: () => void
  jumpTo: (i: number) => Promise<void>
  toggle: () => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  seek: (t: number) => void
  seekBy: (d: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  setVolume: (v: number) => void
  toggleMute: () => void
}

// ---------- listening-session accounting (for history + statistics) ----------
interface Session { trackId: string; rowId?: number; started: number; listened: number; lastT: number | null; track: Track; flushedAt: number }
let sess: Session | null = null
let loadSeq = 0
let objectUrl: string | undefined
let lastSave = 0

function counted(listened: number, duration?: number) {
  return listened >= Math.min(30, duration ? duration * 0.5 : 30)
}

async function persistSession(final: boolean, reason?: 'skip' | 'end') {
  const s = sess
  if (!s) return
  if (!useSettings.getState().recordHistory) { if (final) sess = null; return }
  if (s.listened >= 3) {
    const dur = s.track.duration && s.track.duration > 0 ? s.track.duration : undefined
    const skipped = reason === 'skip' && s.listened < (dur ? Math.min(30, dur * 0.3) : 30)
    const row: HistoryEntry = {
      trackId: s.trackId, title: s.track.title, artist: s.track.artist, album: s.track.album, genre: s.track.genre,
      source: s.track.source, startedAt: s.started, listened: Math.round(s.listened * 10) / 10, duration: dur,
      counted: counted(s.listened, dur), skipped,
    }
    try {
      if (s.rowId == null) s.rowId = (await db.history.add(row)) as number
      else await db.history.update(s.rowId, row)
    } catch { /* storage full / blocked: listening still works */ }
    s.flushedAt = Date.now()
  }
  if (final) sess = null
}

function trackTime(t: number) {
  if (!sess) return
  if (sess.lastT != null) {
    const d = t - sess.lastT
    // Only count normal forward progress (ignores seeks).
    if (d > 0 && d < 2.5 * Math.max(1, useSettings.getState().speed)) sess.listened += d
  }
  sess.lastT = t
  if (sess.listened >= 3 && Date.now() - sess.flushedAt > 10_000) void persistSession(false)
}

// ---------- resume support ----------
const SESSION_KEY = 'opensong:session'
function saveSession(get: () => PlayerStore) {
  const { queue, index, position } = get()
  if (!queue.length) { localStorage.removeItem(SESSION_KEY); return }
  const from = Math.max(0, index - 20)
  const slice = queue.slice(from, from + 200)
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ queue: slice, index: index - from, position, at: Date.now() })) } catch { /* quota */ }
}

export const usePlayer = create<PlayerStore>((set, get) => {
  const toast = (m: string, k: 'info' | 'error' = 'info') => useUI.getState().toast(m, k)
  /** YouTube tracks play in YouTube's own embedded player; everything else goes through the Web Audio engine. */
  const be = () => (get().queue[get().index]?.youtubeId ? yt : engine)
  let ytFails = 0

  async function resolveUrl(track: Track): Promise<{ url: string; local: boolean }> {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = undefined }
    if (track.availability === 'local') {
      const row = track.blobKey ? await db.blobs.get(track.blobKey) : undefined
      if (!row) throw new Error('The audio file is no longer stored on this device.')
      objectUrl = URL.createObjectURL(row.blob)
      return { url: objectUrl, local: true }
    }
    let t = track
    if (!t.streamUrl && t.needsResolve) {
      const p = providerById(t.source)
      if (!p?.resolveTrack) throw new Error('No way to resolve this track.')
      t = await p.resolveTrack(t, providerContext())
    }
    if (!t.streamUrl) throw new Error('This track has no playable stream.')
    return { url: t.streamUrl, local: false }
  }

  /** Load queue[index] into the engine. `auto` = triggered by end-of-track (so failures advance rather than stop). */
  async function loadAt(index: number, o: { autoplay?: boolean; startAt?: number; fade?: number; auto?: boolean; attempts?: number } = {}) {
    const { queue } = get()
    const track = queue[index]
    if (!track) return
    const seq = ++loadSeq
    await persistSession(true, o.auto ? 'end' : 'skip')
    set({ index, status: 'loading', error: undefined, position: o.startAt ?? 0, duration: track.duration ?? 0, loadedId: undefined })
    try {
      if (!isPlayable(track)) throw new Error(track.availability === 'metadata' ? 'Metadata only — no playable source.' : 'Not playable here.')
      if (track.youtubeId) {
        engine.pause()
        useYT.setState({ visible: true })
        await new Promise<void>((r) => requestAnimationFrame(() => r())) // let the player area mount at full size
        await yt.load(track.youtubeId, { autoplay: o.autoplay !== false, startAt: o.startAt })
        if (seq !== loadSeq) return
        sess = { trackId: track.id, started: Date.now(), listened: 0, lastT: o.startAt ?? 0, track, flushedAt: Date.now() }
        void recordRecent(track)
        set({ mode: 'embed', loadedId: track.id, status: o.autoplay === false ? 'paused' : 'playing', duration: yt.duration || track.duration || 0 })
        return
      }
      yt.stop(); useYT.setState({ visible: false })
      const { url, local } = await resolveUrl(track)
      if (seq !== loadSeq) return
      const st = useSettings.getState()
      engine.setCrossfade(st.crossfade)
      const mode = await engine.load(url, { local, startAt: o.startAt, autoplay: o.autoplay !== false, fade: o.fade, allowProcessing: !st.bypassProcessing })
      if (seq !== loadSeq) return
      sess = { trackId: track.id, started: Date.now(), listened: 0, lastT: o.startAt ?? 0, track, flushedAt: Date.now() }
      void recordRecent(track)
      set({ mode, loadedId: track.id, status: o.autoplay === false ? 'paused' : 'playing', duration: Number.isFinite(engine.duration) ? engine.duration : track.duration ?? 0 })
      if (mode === 'bypass') toast('This source doesn’t allow audio processing — playing without equaliser/visualiser.')
    } catch (e) {
      if (seq !== loadSeq) return
      const msg = e instanceof Error ? e.message : 'Playback failed'
      set({ status: 'error', error: msg })
      toast(`Can’t play “${track.title}”: ${msg}`, 'error')
      const attempts = (o.attempts ?? 0) + 1
      const n = nextIndex(queue.length, index, get().repeat === 'one' ? 'all' : get().repeat, false)
      if ((o.auto || attempts > 1) && n != null && attempts < 5) void loadAt(n, { autoplay: true, auto: true, attempts })
    }
  }

  async function advance(auto: boolean, fade = 0) {
    const { queue, index, repeat } = get()
    const n = nextIndex(queue.length, index, repeat, auto)
    if (n == null) {
      await persistSession(true, 'end')
      be().pause()
      set({ status: 'paused' })
      be().seek(0)
      return
    }
    if (n === index && auto) { be().seek(0); await be().play().catch(() => undefined); if (sess) { void persistSession(true, 'end'); sess = { trackId: queue[index].id, started: Date.now(), listened: 0, lastT: 0, track: queue[index], flushedAt: Date.now() } } return }
    await loadAt(n, { autoplay: true, auto, fade: auto ? fade : 0 })
  }

  const common = {
    time: (t: number, d: number) => {
      trackTime(t)
      set({ position: t, duration: Number.isFinite(d) && d > 0 ? d : get().duration })
      if (Date.now() - lastSave > 5000) { lastSave = Date.now(); saveSession(get) }
    },
    ended: () => void advance(true),
    play: () => { ytFails = 0; set({ status: 'playing' }) },
    pause: () => { if (get().status !== 'loading') set({ status: 'paused' }); saveSession(get); void persistSession(false) },
  }
  yt.events = {
    ...common,
    error: (m) => {
      set({ status: 'error', error: m })
      toast(`YouTube: ${m}`, 'error')
      // Skip unplayable videos, but never loop forever if everything fails.
      if (++ytFails < 3) void advance(true)
    },
    blocked: () => {
      if (get().status === 'playing') { set({ status: 'paused' }); toast('Your browser blocked autoplay — press play on the YouTube player.') }
    },
  }
  engine.events = {
    ...common,
    nearEnd: () => {
      const { repeat, queue, index } = get()
      if (repeat === 'one') return
      if (nextIndex(queue.length, index, repeat, true) == null) return
      void advance(true, useSettings.getState().crossfade)
    },
    error: (m) => { set({ status: 'error', error: m }); toast(`Playback error: ${m}`, 'error') },
    mode: (m) => set({ mode: m }),
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { saveSession(get); void persistSession(false) })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { saveSession(get); void persistSession(false) } })
  }

  // Restore the previous session (paused) so "Continue Listening" works after a reload.
  let initial: Partial<PlayerStore> = {}
  try {
    const st = useSettings.getState()
    const raw = st.resumeSession ? localStorage.getItem(SESSION_KEY) : null
    if (raw) {
      const j = JSON.parse(raw) as { queue: Track[]; index: number; position: number }
      if (Array.isArray(j.queue) && j.queue[j.index]) initial = { queue: j.queue, index: j.index, position: j.position ?? 0, duration: j.queue[j.index].duration ?? 0 }
    }
  } catch { /* ignore corrupt session */ }

  return {
    queue: [], index: 0, originalIds: null, status: 'idle', position: 0, duration: 0,
    shuffle: false, repeat: 'off', mode: 'processed',
    ...initial,
    current: () => get().queue[get().index],

    playQueue: async (tracks, start = 0, o) => {
      const playable = tracks.filter(isPlayable)
      if (!playable.length) { toast('Nothing playable here — these items are metadata or external links only.', 'error'); return }
      const target = tracks[start]
      let startIdx = Math.max(0, playable.findIndex((t) => t.id === target?.id))
      let queue = playable
      let originalIds: string[] | null = null
      let shuffle = get().shuffle
      if (o?.shuffle != null) shuffle = o.shuffle
      if (shuffle) {
        originalIds = queue.map((t) => t.id)
        if (o?.shuffle) startIdx = Math.floor(Math.random() * queue.length)
        const cur = queue[startIdx]
        const rest = shuffleUpcoming([cur, ...queue.filter((_, i) => i !== startIdx)], 0)
        queue = rest; startIdx = 0
      }
      set({ queue, index: startIdx, originalIds, shuffle })
      engine.ensureContext() // inside the user gesture
      await loadAt(startIdx, { autoplay: true })
    },
    playTrack: async (track) => get().playQueue([track], 0),

    enqueue: (tracks) => {
      const add = tracks.filter(isPlayable)
      if (!add.length) { toast('Nothing playable to add.', 'error'); return }
      const was = get().queue.length === 0
      set({ queue: [...get().queue, ...add], originalIds: get().originalIds ? [...get().originalIds!, ...add.map((t) => t.id)] : null })
      toast(`Added ${add.length} to queue`)
      if (was) void loadAt(0, { autoplay: false })
    },
    playNext: (tracks) => {
      const add = tracks.filter(isPlayable)
      if (!add.length) { toast('Nothing playable to add.', 'error'); return }
      const { queue, index } = get()
      if (!queue.length) { void get().playQueue(add); return }
      const q = [...queue]
      q.splice(index + 1, 0, ...add)
      set({ queue: q })
      toast('Playing next')
    },
    removeFromQueue: (i) => {
      const { queue, index } = get()
      const r = removeAt(queue, index, i)
      set({ queue: r.queue, index: Math.max(0, r.index) })
      if (r.removedCurrent) {
        if (!r.queue.length) { engine.stop(); yt.stop(); useYT.setState({ visible: false }); set({ status: 'idle', loadedId: undefined }) }
        else void loadAt(r.index, { autoplay: get().status === 'playing' })
      }
    },
    moveInQueue: (from, to) => {
      const { queue, index } = get()
      set({ queue: moveItem(queue, from, to), index: indexAfterMove(index, from, to) })
    },
    clearQueue: () => {
      // Keep the current track playing; clear the rest.
      const { queue, index } = get()
      const cur = queue[index]
      set({ queue: cur ? [cur] : [], index: 0, originalIds: null })
    },
    jumpTo: async (i) => { engine.ensureContext(); await loadAt(i, { autoplay: true }) },

    toggle: async () => {
      const { status, queue, index, loadedId, position } = get()
      if (!queue.length) return
      engine.ensureContext()
      if (status === 'playing') { be().pause(); return }
      if (loadedId !== queue[index]?.id) { await loadAt(index, { autoplay: true, startAt: position > 2 ? position : undefined }); return }
      if (queue[index]?.youtubeId) useYT.setState({ visible: true })
      try { await be().play() } catch (e) { toast(e instanceof Error ? e.message : 'Could not start playback', 'error') }
    },
    next: async () => { engine.ensureContext(); await advance(false) },
    prev: async () => {
      const { queue, index, repeat } = get()
      engine.ensureContext()
      if (get().position > 3) { be().seek(0); return }
      const p = prevIndex(queue.length, index, repeat)
      if (p == null) { be().seek(0); return }
      await loadAt(p, { autoplay: true })
    },
    seek: (t) => { be().seek(t); if (sess) sess.lastT = t; set({ position: t }) },
    seekBy: (d) => get().seek(Math.min(Math.max(0, get().position + d), get().duration || Infinity)),

    toggleShuffle: () => {
      const { shuffle, queue, index, originalIds } = get()
      if (!shuffle) {
        set({ shuffle: true, originalIds: queue.map((t) => t.id), queue: shuffleUpcoming(queue, index) })
      } else {
        const cur = queue[index]
        const q = originalIds ? restoreOrder(queue, originalIds) : queue
        set({ shuffle: false, originalIds: null, queue: q, index: Math.max(0, q.findIndex((t) => t.id === cur?.id)) })
      }
    },
    cycleRepeat: () => set({ repeat: ({ off: 'all', all: 'one', one: 'off' } as const)[get().repeat] }),
    setVolume: (v) => { engine.setVolume(v); yt.setVolume(v); useSettings.getState().set({ volume: v, muted: false }) },
    toggleMute: () => {
      const s = useSettings.getState()
      const muted = !s.muted
      engine.setVolume(muted ? 0 : s.volume); yt.setVolume(muted ? 0 : s.volume)
      s.set({ muted })
    },
  }
})

/** Apply persisted volume/speed to the engine on startup. */
export function initEngineFromSettings() {
  const s = useSettings.getState()
  engine.setVolume(s.muted ? 0 : s.volume)
  yt.setVolume(s.muted ? 0 : s.volume)
  engine.setRate(s.speed)
  engine.setCrossfade(s.crossfade)
}
