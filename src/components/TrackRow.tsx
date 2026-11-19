import { Disc3, ExternalLink, Heart, ListEnd, ListPlus, ListStart, Play, Pause, Trash2, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useLive } from '../lib/useLive'
import { db } from '../lib/db'
import { toggleFavourite } from '../lib/library'
import { isPlayable } from '../lib/queueLogic'
import { cn, formatTime } from '../lib/util'
import { usePlayer } from '../store/player'
import { useUI } from '../store/ui'
import type { Track } from '../types'
import { Artwork } from './Artwork'
import { AvailabilityBadge, sourceName } from './Badges'
import { Menu, type MenuItem } from './Menu'
import { IconButton } from './ui'

export function useFavouriteIds(): Set<string> {
  const [ids] = useLive(async () => new Set(await db.favourites.toCollection().primaryKeys() as string[]), [])
  return ids ?? new Set()
}

interface Props {
  track: Track
  /** The list this row belongs to — clicking play queues the whole list starting here. */
  context: Track[]
  index?: number
  showAlbum?: boolean
  onRemove?: () => void
  removeLabel?: string
  favourites?: Set<string>
  extraMenu?: MenuItem[]
  draggable?: { onDragStart: () => void; onDrop: () => void }
  meta?: string
}

export function TrackRow({ track, context, index, showAlbum = true, onRemove, removeLabel = 'Remove', favourites, extraMenu, draggable, meta }: Props) {
  const nav = useNavigate()
  const cur = usePlayer((s) => s.queue[s.index]?.id === track.id ? s.status : undefined)
  const playable = isPlayable(track)
  const isFav = favourites?.has(track.id)
  const openAdd = useUI((s) => s.openAddToPlaylist)
  const p = usePlayer.getState

  const play = () => { if (playable) void p().playQueue(context, Math.max(0, context.findIndex((t) => t.id === track.id))); else useUI.getState().toast('Metadata only — there is no legal stream to play. Use the source link.', 'error') }

  const items: MenuItem[] = [
    { label: 'Play next', icon: <ListStart size={16} />, disabled: !playable, onSelect: () => p().playNext([track]) },
    { label: 'Add to queue', icon: <ListEnd size={16} />, disabled: !playable, onSelect: () => p().enqueue([track]) },
    { label: 'Add to playlist…', icon: <ListPlus size={16} />, onSelect: () => openAdd([track]) },
    { label: 'Go to artist', icon: <User size={16} />, onSelect: () => nav(`/artist/${encodeURIComponent(track.artist)}`) },
    ...(track.sourceUrl ? [{ label: `Open on ${sourceName(track.source)}`, icon: <ExternalLink size={16} />, href: track.sourceUrl }] : []),
    ...(extraMenu ?? []),
    ...(onRemove ? [{ label: removeLabel, icon: <Trash2 size={16} />, danger: true, onSelect: onRemove, divider: false }] : []),
  ]

  return (
    <div
      draggable={!!draggable} onDragStart={draggable?.onDragStart} onDragOver={draggable ? (e) => e.preventDefault() : undefined} onDrop={draggable?.onDrop}
      onDoubleClick={play}
      className={cn('group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface2', cur && 'bg-surface2/70')}
    >
      <div className="relative h-11 w-11 shrink-0">
        <Artwork src={track.artworkUrl} blobKey={track.artworkBlobKey} title={track.title} className="h-11 w-11" rounded="rounded-lg" />
        {playable && (
          <button
            aria-label={cur === 'playing' ? `Pause ${track.title}` : `Play ${track.title}`} onClick={() => (cur ? void p().toggle() : play())}
            className={cn('absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 text-white opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100', cur && 'opacity-100')}
          >
            {cur === 'playing' ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center gap-2 truncate text-sm font-medium', cur && 'text-accent')}>
          {index != null && <span className="w-5 shrink-0 text-xs tabular-nums text-muted">{index + 1}</span>}
          <span className="truncate">{track.title}</span>
          {cur && <span className={cn('os-eq ml-1 hidden sm:inline-block', cur !== 'playing' && 'paused')} aria-hidden><span /><span /><span /></span>}
        </div>
        <div className="flex items-center gap-2 truncate text-xs text-muted">
          <span className="truncate">{track.artist}{meta ? ` · ${meta}` : ''}</span>
          {track.availability !== 'full' && track.availability !== 'local' && <AvailabilityBadge value={track.availability} />}
        </div>
      </div>
      {showAlbum && <div className="hidden w-1/4 min-w-0 truncate text-xs text-muted lg:flex lg:items-center lg:gap-1.5">{track.album && <><Disc3 size={12} className="shrink-0" /><span className="truncate">{track.album}</span></>}</div>}
      <div className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-muted sm:block">{formatTime(track.duration)}</div>
      <IconButton label={isFav ? 'Remove from favourites' : 'Add to favourites'} active={isFav} onClick={() => void toggleFavourite(track)} className={cn(!isFav && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100')}>
        <Heart size={17} fill={isFav ? 'currentColor' : 'none'} />
      </IconButton>
      <Menu items={items} label={`More actions for ${track.title}`} />
    </div>
  )
}

export function TrackList({ tracks, ...rest }: { tracks: Track[] } & Partial<Omit<Props, 'track' | 'context'>>) {
  const fav = useFavouriteIds()
  return <div className="space-y-0.5">{tracks.map((t, i) => <TrackRow key={`${t.id}-${i}`} track={t} context={tracks} index={i} favourites={fav} {...rest} />)}</div>
}
