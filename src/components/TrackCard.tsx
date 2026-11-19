import { Play } from 'lucide-react'
import { isPlayable } from '../lib/queueLogic'
import { cn } from '../lib/util'
import { usePlayer } from '../store/player'
import type { Track } from '../types'
import { Artwork } from './Artwork'

/** Square card for a single track (Recently played, mixes, etc.). `context` is the queue it plays within. */
export function TrackCard({ track, context, note, className }: { track: Track; context: Track[]; note?: string; className?: string }) {
  const playable = isPlayable(track)
  return (
    <div className={cn('group w-40 shrink-0 sm:w-44', className)}>
      <div className="relative">
        <Artwork src={track.artworkUrl} blobKey={track.artworkBlobKey} title={track.title} className="w-full" rounded="rounded-2xl" />
        {playable && (
          <button aria-label={`Play ${track.title}`} onClick={() => void usePlayer.getState().playQueue(context, Math.max(0, context.findIndex((t) => t.id === track.id)))}
            className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-lg transition hover:scale-105 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"><Play size={20} fill="currentColor" /></button>
        )}
      </div>
      <div className="mt-2 truncate text-sm font-semibold">{track.title}</div>
      <div className="truncate text-xs text-muted">{track.artist}</div>
      {note && <div className="truncate text-[11px] font-medium text-accent">{note}</div>}
    </div>
  )
}
