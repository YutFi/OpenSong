import { ExternalLink, Info, ListEnd, ListPlus, Play, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { releaseTracks, canPlayRelease, playRelease, queueRelease } from '../lib/playback'
import { toggleFollow } from '../lib/library'
import { cn, formatDate } from '../lib/util'
import { useUI } from '../store/ui'
import type { Release } from '../types'
import { Artwork } from './Artwork'
import { AvailabilityBadge, sourceName } from './Badges'
import { Menu } from './Menu'
import { ReleaseDialog } from './ReleaseDialog'

const KIND: Record<Release['kind'], string> = { single: 'Single', album: 'Album', ep: 'EP', other: 'Release' }

export function ReleaseCard({ release, className, compact, note }: { release: Release; className?: string; compact?: boolean; note?: string }) {
  const [open, setOpen] = useState(false)
  const playable = canPlayRelease(release)
  const openAdd = useUI((s) => s.openAddToPlaylist)
  return (
    <>
      <div className={cn('group w-40 shrink-0 sm:w-44', compact && 'w-full', className)}>
        <div className="relative">
          <button onClick={() => setOpen(true)} className="block w-full text-left" aria-label={`${release.title} by ${release.artist} — details`}>
            <Artwork src={release.artworkUrl} title={release.title} className="w-full" rounded="rounded-2xl" />
          </button>
          {playable ? (
            <button
              aria-label={`Play ${release.title}`} onClick={() => void playRelease(release)}
              className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-lg transition hover:scale-105 focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
            ><Play size={20} fill="currentColor" /></button>
          ) : (
            <button aria-label={`Details for ${release.title}`} onClick={() => setOpen(true)} className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"><Info size={18} /></button>
          )}
          <div className="absolute left-2 top-2"><AvailabilityBadge value={release.availability} className="backdrop-blur bg-black/55 !text-white" /></div>
        </div>
        <div className="mt-2 flex items-start gap-1">
          <button onClick={() => setOpen(true)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-semibold">{release.title}</div>
            <div className="truncate text-xs text-muted">{release.artist}</div>
            <div className="truncate text-[11px] text-muted">{KIND[release.kind]} · {release.releaseDate ? formatDate(release.releaseDate) : 'Date unknown'} · {sourceName(release.source)}</div>
            {note && <div className="mt-0.5 truncate text-[11px] font-medium text-accent" title={note}>{note}</div>}
          </button>
          <Menu label={`More actions for ${release.title}`} items={[
            { label: 'Details', icon: <Info size={16} />, onSelect: () => setOpen(true) },
            { label: 'Add to queue', icon: <ListEnd size={16} />, disabled: !playable, onSelect: () => void queueRelease(release) },
            { label: 'Add to playlist…', icon: <ListPlus size={16} />, disabled: !playable, onSelect: async () => { const t = await releaseTracks(release).catch(() => []); if (t.length) openAdd(t) } },
            { label: `Follow ${release.artist}`, icon: <UserPlus size={16} />, onSelect: async () => useUI.getState().toast((await toggleFollow(release.artist)) ? `Following ${release.artist}` : `Unfollowed ${release.artist}`) },
            ...(release.sourceUrl ? [{ label: 'Open original source', icon: <ExternalLink size={16} />, href: release.sourceUrl }] : []),
          ]} />
        </div>
      </div>
      {open && <ReleaseDialog release={release} onClose={() => setOpen(false)} />}
    </>
  )
}
