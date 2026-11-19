import { ExternalLink, Play, Shuffle, UserCheck, UserPlus } from 'lucide-react'
import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { mergeIntoCatalog } from '../catalog/sync'
import { Artwork } from '../components/Artwork'
import { ReleaseCard } from '../components/ReleaseCard'
import { Section, Shelf, ShelfSkeleton } from '../components/Section'
import { TrackList, useFavouriteIds } from '../components/TrackRow'
import { Button, EmptyState } from '../components/ui'
import { useCatalog, useLibrary } from '../lib/data'
import { useAsync, useOnline } from '../lib/hooks'
import { db } from '../lib/db'
import { toggleFollow } from '../lib/library'
import { activeProviders, providerContext } from '../lib/providerCtx'
import { similarArtists } from '../lib/recommend'
import { useLive } from '../lib/useLive'
import { isPlayable } from '../lib/queueLogic'
import { norm } from '../lib/util'
import { usePlayer } from '../store/player'
import type { Release, Track } from '../types'
import { Link } from 'react-router-dom'

export default function ArtistPage() {
  const { name: raw = '' } = useParams()
  const name = decodeURIComponent(raw)
  const [catalog] = useCatalog()
  const [library] = useLibrary()
  const favIds = useFavouriteIds()
  const online = useOnline()
  const [following] = useLive(async () => !!(await db.follows.get(name)), [name])

  const mbid = useMemo(() => (catalog ?? []).find((r) => norm(r.artist) === norm(name) && r.artistMbid)?.artistMbid, [catalog, name])
  const remote = useAsync<Release[]>(online && name ? `artist:${name}` : null, async (signal) => {
    const ctx = providerContext(signal)
    const res = await Promise.allSettled(activeProviders().filter((p) => p.artistReleases).map((p) => p.artistReleases!(name, mbid, ctx)))
    const items = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    if (items.length) await mergeIntoCatalog(items)
    return items
  })

  const releases = useMemo(() => {
    const m = new Map<string, Release>()
    for (const r of [...(catalog ?? []), ...(remote.data ?? [])]) if (norm(r.artist) === norm(name)) m.set(r.id, r)
    return [...m.values()].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
  }, [catalog, remote.data, name])
  const mine = useMemo(() => (library ?? []).filter((t) => norm(t.artist) === norm(name)), [library, name])
  const playable = useMemo<Track[]>(() => [...mine, ...releases.flatMap((r) => (r.availability === 'full' || r.availability === 'preview' ? r.tracks ?? [] : [])).filter(isPlayable)], [mine, releases])
  const similar = useMemo(() => similarArtists(name, (catalog ?? []).map((release) => ({ release })), 8), [catalog, name])
  const art = releases.find((r) => r.artworkUrl)?.artworkUrl
  const src = releases.find((r) => r.sourceUrl)?.sourceUrl

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end gap-5">
        <Artwork src={art} title={name} className="h-32 w-32 sm:h-40 sm:w-40" rounded="rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Artist</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{name}</h1>
          <div className="flex flex-wrap gap-2">
            {playable.length > 0 && <Button variant="primary" onClick={() => void usePlayer.getState().playQueue(playable, 0)}><Play size={16} fill="currentColor" />Play</Button>}
            {playable.length > 1 && <Button onClick={() => { const p = usePlayer.getState(); void p.playQueue(playable, Math.floor(Math.random() * playable.length)); if (!p.shuffle) p.toggleShuffle() }}><Shuffle size={16} />Shuffle</Button>}
            <Button onClick={() => void toggleFollow(name)} aria-pressed={!!following}>{following ? <><UserCheck size={16} />Following</> : <><UserPlus size={16} />Follow</>}</Button>
            {src && <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm hover:bg-white/5"><ExternalLink size={14} />Source</a>}
          </div>
        </div>
      </header>

      {mine.length > 0 && <Section title="In your library"><TrackList tracks={mine} favourites={favIds} /></Section>}

      <Section title="Releases" subtitle={remote.loading ? 'Checking sources…' : `${releases.length} found`}>
        {remote.loading && releases.length === 0 ? <ShelfSkeleton /> : releases.length === 0 ? (
          <EmptyState title="No releases found">{online ? 'None of the enabled sources returned releases for this name.' : 'You’re offline — only releases already on this device are shown.'}</EmptyState>
        ) : <Shelf>{releases.map((r) => <ReleaseCard key={r.id} release={r} />)}</Shelf>}
      </Section>

      {similar.length > 0 && (
        <Section title="Similar artists" subtitle="By shared genres in your catalogue — computed on this device">
          <div className="flex flex-wrap gap-2">{similar.map((s) => <Link key={s.name} to={`/artist/${encodeURIComponent(s.name)}`} className="rounded-full border border-line px-4 py-2 text-sm hover:border-accent hover:text-accent">{s.name}</Link>)}</div>
        </Section>
      )}
    </div>
  )
}
