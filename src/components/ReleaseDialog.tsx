import { ExternalLink, Heart, ListPlus, Play, Shuffle, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import { toggleFavouriteAlbum, toggleFollow, albumKey } from '../lib/library'
import { releaseTracks, canPlayRelease, playRelease } from '../lib/playback'
import { useLive } from '../lib/useLive'
import { formatDate } from '../lib/util'
import { useUI } from '../store/ui'
import type { Release, Track } from '../types'
import { Artwork } from './Artwork'
import { AvailabilityBadge, sourceName } from './Badges'
import { TrackList } from './TrackRow'
import { Button, Modal, Skeleton } from './ui'

const Fact = ({ k, v, hint }: { k: string; v: React.ReactNode; hint?: string }) => (
  <div title={hint} className="min-w-0"><dt className="text-[11px] uppercase tracking-wider text-muted">{k}</dt><dd className="truncate text-sm">{v}</dd></div>
)

export function ReleaseDialog({ release: r, onClose }: { release: Release; onClose: () => void }) {
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [err, setErr] = useState<string>()
  const openAdd = useUI((s) => s.openAddToPlaylist)
  const playable = canPlayRelease(r)
  const [following] = useLive(async () => !!(await db.follows.get(r.artist)), [r.artist])
  const [faved] = useLive(async () => !!(await db.favAlbums.get(albumKey(r.artist, r.title))), [r.id])

  useEffect(() => {
    if (!playable) { setTracks([]); return }
    let alive = true
    releaseTracks(r).then((t) => alive && setTracks(t)).catch((e) => { if (alive) { setErr(e instanceof Error ? e.message : 'Failed'); setTracks([]) } })
    return () => { alive = false }
  }, [r, playable])

  return (
    <Modal open onClose={onClose} title={r.title} wide>
      <div className="flex flex-col gap-5 sm:flex-row">
        <Artwork src={r.artworkUrl} title={r.title} className="mx-auto w-48 shrink-0 sm:mx-0 sm:w-56" rounded="rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <Link to={`/artist/${encodeURIComponent(r.artist)}`} onClick={onClose} className="text-lg font-semibold hover:underline">{r.artist}</Link>
            <div className="mt-1 flex flex-wrap items-center gap-2"><AvailabilityBadge value={r.availability} />{r.license && <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-semibold">{r.license}</span>}</div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Fact k="Original release" v={r.releaseDate ? formatDate(r.releaseDate) : 'Not provided by source'} hint="The release date as stated by the source. OpenSong never guesses." />
            {r.sourceAddedAt && <Fact k="Added to source" v={formatDate(r.sourceAddedAt.slice(0, 10))} hint="When the provider says the item was uploaded/added." />}
            <Fact k="Discovered by OpenSong" v={formatDate(r.discoveredAt)} hint="The first time an OpenSong sync on this device saw it." />
            <Fact k="Added to local catalogue" v={formatDate(r.catalogAddedAt)} hint="When it was stored in your on-device catalogue." />
            <Fact k="Type" v={r.kind === 'ep' ? 'EP' : r.kind[0].toUpperCase() + r.kind.slice(1)} />
            <Fact k="Genre" v={r.genre ?? '—'} />
            <Fact k="Source" v={sourceName(r.source)} />
            {r.country && <Fact k="Country" v={r.country} />}
            {r.listenCount != null && r.listenCount > 0 && <Fact k="Listens" v={r.listenCount.toLocaleString()} />}
          </dl>
          <div className="flex flex-wrap gap-2">
            {playable && <><Button variant="primary" onClick={() => void playRelease(r)}><Play size={16} fill="currentColor" />Play</Button><Button onClick={() => void playRelease(r, { shuffle: true })}><Shuffle size={16} />Shuffle</Button></>}
            {playable && tracks && tracks.length > 0 && <Button onClick={() => openAdd(tracks)}><ListPlus size={16} />Add to playlist</Button>}
            <Button onClick={async () => useUI.getState().toast((await toggleFollow(r.artist)) ? `Following ${r.artist}` : `Unfollowed ${r.artist}`)}><UserPlus size={16} />{following ? 'Following' : 'Follow artist'}</Button>
            <Button variant="ghost" onClick={() => void toggleFavouriteAlbum(r.title, r.artist, r.artworkUrl)} aria-pressed={!!faved}><Heart size={16} fill={faved ? 'currentColor' : 'none'} />{faved ? 'Favourited' : 'Favourite'}</Button>
            {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm hover:bg-surface2"><ExternalLink size={16} />Open original source</a>}
          </div>
        </div>
      </div>
      {!playable && (
        <p className="mt-5 rounded-xl bg-surface2 p-3 text-sm text-muted">
          {r.availability === 'metadata' ? 'OpenSong found this release in an open music database. Databases tell us that music exists — not that it is legal to stream here — so there is no play button. You can open the original source to listen where the artist or label publishes it.' : 'This item is hosted by its source and isn’t licensed for third-party playback, so OpenSong links to it instead of playing it.'}
        </p>
      )}
      {playable && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">Tracks</h3>
          {tracks === null ? <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            : tracks.length ? <TrackList tracks={tracks} showAlbum={false} />
            : <p className="text-sm text-muted">{err ?? 'No playable audio files were found for this item.'}</p>}
        </div>
      )}
    </Modal>
  )
}
