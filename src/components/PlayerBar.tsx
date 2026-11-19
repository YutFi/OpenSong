import { ChevronUp, Heart, ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Volume1, Volume2, VolumeX, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import { toggleFavourite } from '../lib/library'
import { useLive } from '../lib/useLive'
import { cn, formatTime } from '../lib/util'
import { usePlayer } from '../store/player'
import { useSettings } from '../store/settings'
import { useUI } from '../store/ui'
import { Artwork } from './Artwork'
import { IconButton, Slider } from './ui'

export function useCurrentFav() {
  const id = usePlayer((s) => s.queue[s.index]?.id)
  const [fav] = useLive(async () => (id ? !!(await db.favourites.get(id)) : false), [id])
  return !!fav
}

export function ProgressBar({ className }: { className?: string }) {
  const pos = usePlayer((s) => s.position)
  const dur = usePlayer((s) => s.duration)
  const seek = usePlayer((s) => s.seek)
  const [drag, setDrag] = useState<number | null>(null)
  useEffect(() => setDrag(null), [dur])
  const max = dur > 0 && Number.isFinite(dur) ? dur : 0
  return (
    <div className={cn('flex w-full items-center gap-2 text-[11px] tabular-nums text-muted', className)}>
      <span className="w-10 text-right">{formatTime(drag ?? pos)}</span>
      <Slider label="Seek" min={0} max={max || 1} step={0.1} value={max ? drag ?? pos : 0} onChange={setDrag} onCommit={(v) => { seek(v); setDrag(null) }} />
      <span className="w-10">{formatTime(max || undefined)}</span>
    </div>
  )
}

export function TransportControls({ big, compact }: { big?: boolean; compact?: boolean }) {
  const status = usePlayer((s) => s.status)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const has = usePlayer((s) => s.queue.length > 0)
  const p = usePlayer.getState
  const playing = status === 'playing'
  return (
    <div className={cn('flex items-center justify-center', big ? 'gap-3' : 'gap-1')}>
      {!compact && <IconButton label={shuffle ? 'Shuffle on' : 'Shuffle off'} active={shuffle} onClick={() => p().toggleShuffle()}><Shuffle size={big ? 22 : 17} /></IconButton>}
      <IconButton label="Previous" disabled={!has} onClick={() => void p().prev()} className={big ? 'h-12 w-12' : ''}><SkipBack size={big ? 26 : 19} fill="currentColor" /></IconButton>
      <button aria-label={playing ? 'Pause' : 'Play'} disabled={!has} onClick={() => void p().toggle()}
        className={cn('flex items-center justify-center rounded-full bg-fg text-bg transition hover:scale-105 disabled:opacity-40', big ? 'h-16 w-16' : 'h-10 w-10')}>
        {status === 'loading' ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-bg/30 border-t-bg" /> : playing ? <Pause size={big ? 28 : 20} fill="currentColor" /> : <Play size={big ? 28 : 20} fill="currentColor" className="ml-0.5" />}
      </button>
      <IconButton label="Next" disabled={!has} onClick={() => void p().next()} className={big ? 'h-12 w-12' : ''}><SkipForward size={big ? 26 : 19} fill="currentColor" /></IconButton>
      {!compact && <IconButton label={`Repeat: ${repeat}`} active={repeat !== 'off'} onClick={() => p().cycleRepeat()}>{repeat === 'one' ? <Repeat1 size={big ? 22 : 17} /> : <Repeat size={big ? 22 : 17} />}</IconButton>}
    </div>
  )
}

export function VolumeControl() {
  const volume = useSettings((s) => s.volume)
  const muted = useSettings((s) => s.muted)
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  return (
    <div className="flex w-36 items-center gap-1">
      <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={() => usePlayer.getState().toggleMute()}><Icon size={18} /></IconButton>
      <Slider label="Volume" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(v) => usePlayer.getState().setVolume(v)} />
    </div>
  )
}

export function PlayerBar() {
  const track = usePlayer((s) => s.queue[s.index])
  const status = usePlayer((s) => s.status)
  const mode = usePlayer((s) => s.mode)
  const pos = usePlayer((s) => s.position)
  const dur = usePlayer((s) => s.duration)
  const fav = useCurrentFav()
  const ui = useUI.getState
  if (!track) {
    return <div className="hidden h-[88px] shrink-0 items-center justify-center border-t border-line bg-surface text-sm text-muted md:flex">Pick something to play — nothing is queued yet.</div>
  }
  return (
    <>
      {/* Desktop / tablet */}
      <div role="region" aria-label="Player" className="hidden h-[88px] shrink-0 grid-cols-[1fr_minmax(320px,640px)_1fr] items-center gap-4 border-t border-line bg-surface px-4 md:grid">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => ui().setNowPlaying(true)} aria-label="Open now playing"><Artwork src={track.artworkUrl} blobKey={track.artworkBlobKey} title={track.title} className="h-14 w-14" rounded="rounded-lg" /></button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" data-testid="player-title">{track.title}</div>
            <Link to={`/artist/${encodeURIComponent(track.artist)}`} className="block truncate text-xs text-muted hover:text-fg hover:underline">{track.artist}</Link>
            {mode === 'embed' && <div className="truncate text-[10px] text-amber-500" title="Plays in YouTube’s own player, so the equaliser and visualiser can’t be applied.">YouTube player · no EQ</div>}
            {mode === 'bypass' && <div className="truncate text-[10px] text-amber-500" title="This source blocks audio analysis, so the equaliser and visualiser can’t be applied.">No EQ for this source</div>}
          </div>
          <IconButton label={fav ? 'Remove from favourites' : 'Add to favourites'} active={fav} onClick={() => void toggleFavourite(track)}><Heart size={18} fill={fav ? 'currentColor' : 'none'} /></IconButton>
        </div>
        <div className="space-y-1">
          <TransportControls />
          <ProgressBar />
        </div>
        <div className="flex items-center justify-end gap-0.5">
          <Link to="/equaliser" aria-label="Equaliser" title="Equaliser" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2 hover:text-fg"><SlidersHorizontal size={18} /></Link>
          <Link to="/visualiser" aria-label="Visualiser" title="Visualiser" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2 hover:text-fg"><Waves size={18} /></Link>
          <IconButton label="Queue" onClick={() => ui().setQueue(!useUI.getState().queueOpen)}><ListMusic size={18} /></IconButton>
          <VolumeControl />
        </div>
      </div>
      {/* Phone mini player */}
      <div className="fixed inset-x-2 z-30 overflow-hidden rounded-2xl border border-line bg-surface2/95 shadow-xl backdrop-blur md:hidden" style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + 0.5rem)' }}>
        <div className="flex items-center gap-3 p-2 pr-3">
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => ui().setNowPlaying(true)} aria-label="Open now playing">
            <Artwork src={track.artworkUrl} blobKey={track.artworkBlobKey} title={track.title} className="h-11 w-11" rounded="rounded-lg" />
            <div className="min-w-0"><div className="truncate text-sm font-semibold">{track.title}</div><div className="truncate text-xs text-muted">{track.artist}</div></div>
            <ChevronUp size={16} className="ml-auto shrink-0 text-muted" />
          </button>
          <TransportControls compact />
        </div>
        <div className="h-0.5 bg-line"><div className="h-full bg-accent" style={{ width: `${dur > 0 ? Math.min(100, (pos / dur) * 100) : 0}%` }} /></div>
        {status === 'error' && <div className="bg-danger/15 px-3 py-1 text-[11px] text-danger">Playback problem — try the next track.</div>}
      </div>
    </>
  )
}
