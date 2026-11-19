import { Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/util'
import { usePlayer } from '../store/player'
import type { Playlist } from '../types'
import { Artwork } from './Artwork'

export function PlaylistCard({ playlist, className }: { playlist: Playlist; className?: string }) {
  const cover = playlist.artwork ?? playlist.tracks.find((t) => t.artworkUrl)?.artworkUrl
  const blob = playlist.artwork ? undefined : playlist.tracks.find((t) => t.artworkBlobKey)?.artworkBlobKey
  return (
    <div className={cn('group w-40 shrink-0 sm:w-44', className)}>
      <div className="relative">
        <Link to={`/playlist/${playlist.id}`} aria-label={`Open playlist ${playlist.name}`}><Artwork src={cover} blobKey={blob} title={playlist.name} className="w-full" rounded="rounded-2xl" /></Link>
        {playlist.tracks.length > 0 && (
          <button aria-label={`Play ${playlist.name}`} onClick={() => void usePlayer.getState().playQueue(playlist.tracks)} className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-lg transition hover:scale-105 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"><Play size={20} fill="currentColor" /></button>
        )}
      </div>
      <Link to={`/playlist/${playlist.id}`} className="mt-2 block truncate text-sm font-semibold hover:underline">{playlist.name}</Link>
      <div className="truncate text-xs text-muted">{playlist.tracks.length} track{playlist.tracks.length === 1 ? '' : 's'}</div>
    </div>
  )
}
