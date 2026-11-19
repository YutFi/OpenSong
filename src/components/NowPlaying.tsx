import { ChevronDown, ExternalLink, Heart, ListMusic, ListPlus, SlidersHorizontal, Waves } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { toggleFavourite } from '../lib/library'
import { usePlayer } from '../store/player'
import { useUI } from '../store/ui'
import { formatDate } from '../lib/util'
import { Artwork } from './Artwork'
import { AvailabilityBadge, sourceName } from './Badges'
import { ProgressBar, TransportControls, VolumeControl, useCurrentFav } from './PlayerBar'
import { Visualizer } from './Visualizer'
import { IconButton } from './ui'

/** Full-screen "now playing" view (Apple-Music-style): big artwork, live visualiser, transport, source & licence info. */
export function NowPlaying() {
  const open = useUI((s) => s.nowPlayingOpen)
  const track = usePlayer((s) => s.queue[s.index])
  const mode = usePlayer((s) => s.mode)
  const fav = useCurrentFav()
  const close = () => useUI.getState().setNowPlaying(false)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [open])
  if (!open || !track) return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Now playing" className="fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-bg safe-t">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {track.artworkUrl && <img src={track.artworkUrl} alt="" className="h-full w-full scale-125 object-cover opacity-25 blur-3xl" />}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg/70 to-bg" />
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-6 pb-8 pt-3">
        <div className="flex items-center justify-between">
          <IconButton label="Close now playing" onClick={close}><ChevronDown size={24} /></IconButton>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Now playing</span>
          <IconButton label="Queue" onClick={() => { close(); useUI.getState().setQueue(true) }}><ListMusic size={20} /></IconButton>
        </div>
        <Artwork src={track.artworkUrl} blobKey={track.artworkBlobKey} title={track.title} className="mx-auto w-full max-w-sm shadow-2xl" rounded="rounded-3xl" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{track.title}</h2>
            <Link to={`/artist/${encodeURIComponent(track.artist)}`} onClick={close} className="block truncate text-muted hover:underline">{track.artist}{track.album ? ` — ${track.album}` : ''}</Link>
          </div>
          <div className="flex shrink-0 items-center">
            <IconButton label="Add to playlist" onClick={() => useUI.getState().openAddToPlaylist([track])}><ListPlus size={20} /></IconButton>
            <IconButton label={fav ? 'Remove from favourites' : 'Add to favourites'} active={fav} onClick={() => void toggleFavourite(track)}><Heart size={22} fill={fav ? 'currentColor' : 'none'} /></IconButton>
          </div>
        </div>
        <ProgressBar />
        <TransportControls big />
        <div className="flex items-center justify-between"><VolumeControl />
          <div className="flex gap-1"><Link to="/equaliser" onClick={close} aria-label="Equaliser" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2"><SlidersHorizontal size={18} /></Link>
            <Link to="/visualiser" onClick={close} aria-label="Visualiser" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2"><Waves size={18} /></Link></div>
        </div>
        <Visualizer className="h-28 rounded-2xl border border-line" settings={{ mode: 'minimal', backgroundEffect: 'none' }} />
        <div className="space-y-2 rounded-2xl border border-line bg-surface/70 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2"><AvailabilityBadge value={track.availability} /><span className="text-muted">via {sourceName(track.source)}</span></div>
          {track.license && <div className="text-muted">Licence: {track.licenseUrl ? <a className="underline" href={track.licenseUrl} target="_blank" rel="noopener noreferrer">{track.license}</a> : track.license}</div>}
          {track.releaseDate && <div className="text-muted">Released: {formatDate(track.releaseDate)}</div>}
          {mode === 'embed' && <div className="text-amber-500">This song plays in YouTube’s own player (shown on screen). The equaliser, visualiser, crossfade and speed can’t be applied to it.</div>}
          {mode === 'bypass' && <div className="text-amber-500">This source doesn’t permit audio analysis, so EQ and the visualiser can’t be applied.</div>}
          {track.sourceUrl && <a href={track.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline"><ExternalLink size={14} />Open original source</a>}
        </div>
      </div>
    </div>, document.body)
}
