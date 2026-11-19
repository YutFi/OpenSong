import { Clock, Search as SearchIcon, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ReleaseCard } from '../components/ReleaseCard'
import { PlaylistCard } from '../components/PlaylistCard'
import { PageHeader, Section, Shelf } from '../components/Section'
import { TrackList, useFavouriteIds } from '../components/TrackRow'
import { Chip, EmptyState, Input, Skeleton } from '../components/ui'
import { Artwork } from '../components/Artwork'
import { useCatalog, useFavourites, useLibrary, usePlaylists } from '../lib/data'
import { useDebounced, useAsync, useOnline } from '../lib/hooks'
import { addSearch, clearSearches } from '../lib/library'
import { useLive } from '../lib/useLive'
import { db } from '../lib/db'
import { activeProviders, providerContext } from '../lib/providerCtx'
import { norm } from '../lib/util'
import type { ArtistResult, SearchResults } from '../providers/types'
import type { Track } from '../types'
import { mergeIntoCatalog } from '../catalog/sync'

type Scope = 'all' | 'tracks' | 'albums' | 'artists' | 'playlists'
const match = (q: string, ...fields: (string | undefined)[]) => { const n = norm(q); return fields.some((f) => f && norm(f).includes(n)) }

export default function Search() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const q = useDebounced(text.trim(), 350)
  const [scope, setScope] = useState<Scope>('all')
  const online = useOnline()
  const favIds = useFavouriteIds()
  const [library] = useLibrary()
  const [favs] = useFavourites()
  const [catalog] = useCatalog()
  const [playlists] = usePlaylists()
  const [recent] = useLive(() => db.searches.orderBy('at').reverse().limit(10).toArray(), [])

  useEffect(() => { if (q) { setParams({ q }, { replace: true }); void addSearch(q) } else setParams({}, { replace: true }) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const localTracks = useMemo<Track[]>(() => {
    if (!q) return []
    const pool = new Map<string, Track>()
    for (const t of library ?? []) pool.set(t.id, t)
    for (const f of favs ?? []) pool.set(f.id, f.track)
    for (const p of playlists ?? []) for (const t of p.tracks) pool.set(t.id, t)
    for (const r of catalog ?? []) for (const t of r.tracks ?? []) pool.set(t.id, t)
    return [...pool.values()].filter((t) => match(q, t.title, t.artist, t.album, t.genre))
  }, [q, library, favs, playlists, catalog])
  const localAlbums = useMemo(() => q ? (catalog ?? []).filter((r) => match(q, r.title, r.artist, r.genre, ...(r.tags ?? []))).slice(0, 40) : [], [q, catalog])
  const localPlaylists = useMemo(() => q ? (playlists ?? []).filter((p) => match(q, p.name, p.description)) : [], [q, playlists])

  const remote = useAsync<SearchResults>(q && online ? `s:${q}` : null, async (signal) => {
    const ctx = providerContext(signal)
    const settled = await Promise.allSettled(activeProviders().filter((p) => p.search).map((p) => p.search!(q, ctx)))
    const out: SearchResults = { tracks: [], albums: [], artists: [] }
    for (const s of settled) if (s.status === 'fulfilled') { out.tracks.push(...s.value.tracks); out.albums.push(...s.value.albums); out.artists.push(...s.value.artists) }
    if (out.albums.length) await mergeIntoCatalog(out.albums)
    return out
  })

  const tracks = useMemo(() => dedupe([...localTracks, ...(remote.data?.tracks ?? [])], (t) => t.id).slice(0, 80), [localTracks, remote.data])
  const albums = useMemo(() => dedupe([...localAlbums, ...(remote.data?.albums ?? [])], (r) => r.id).slice(0, 40), [localAlbums, remote.data])
  const artists = useMemo(() => {
    const m = new Map<string, ArtistResult | { name: string; source: string; id: string; tags?: string[] }>()
    for (const a of remote.data?.artists ?? []) if (!m.has(norm(a.name))) m.set(norm(a.name), a)
    for (const r of [...albums, ...tracks.map((t) => ({ artist: t.artist, source: t.source, id: t.id }))]) if (r.artist && !m.has(norm(r.artist)) && match(q, r.artist)) m.set(norm(r.artist), { name: r.artist, source: r.source, id: r.id })
    return [...m.values()].slice(0, 24)
  }, [remote.data, albums, tracks, q])

  const none = q && !remote.loading && !tracks.length && !albums.length && !artists.length && !localPlaylists.length
  const show = (s: Scope) => scope === 'all' || scope === s

  return (
    <div className="space-y-6">
      <PageHeader title="Search" subtitle="Your library, playlists and catalogue — plus every enabled source." />
      <div className="relative">
        <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <Input autoFocus aria-label="Search music" placeholder="Songs, albums, artists, genres…" value={text} onChange={(e) => setText(e.target.value)} className="h-12 pl-11 pr-10 text-base" />
        {text && <button aria-label="Clear search" onClick={() => setText('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-fg"><X size={16} /></button>}
      </div>

      {!q ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold text-muted"><Clock size={14} />Recent searches</h2>{(recent?.length ?? 0) > 0 && <button onClick={() => void clearSearches()} className="text-xs text-muted hover:text-fg">Clear</button>}</div>
          {(recent?.length ?? 0) === 0 ? <p className="text-sm text-muted">Nothing yet. Searches stay on this device.</p> : <div className="flex flex-wrap gap-2">{recent!.map((s) => <Chip key={s.query} onClick={() => setText(s.query)}>{s.query}</Chip>)}</div>}
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Result type">
            {(['all', 'tracks', 'albums', 'artists', 'playlists'] as Scope[]).map((s) => <Chip key={s} role="tab" aria-selected={scope === s} active={scope === s} onClick={() => setScope(s)} className="capitalize">{s}</Chip>)}
          </div>
          {!online && <p className="text-sm text-muted">You’re offline — searching what’s already on this device.</p>}
          {remote.loading && <div className="flex items-center gap-2 text-xs text-muted"><Skeleton className="h-2 w-16" />Searching online sources…</div>}
          {none && <EmptyState icon={<SearchIcon />} title={`No results for “${q}”`}>Try fewer words or a different spelling. Sources that were unavailable are listed in Settings.</EmptyState>}

          {show('tracks') && tracks.length > 0 && <Section title="Songs"><TrackList tracks={tracks.slice(0, scope === 'tracks' ? 80 : 8)} favourites={favIds} /></Section>}
          {show('albums') && albums.length > 0 && <Section title="Albums & releases"><Shelf>{albums.slice(0, scope === 'albums' ? 40 : 12).map((r) => <ReleaseCard key={r.id} release={r} />)}</Shelf></Section>}
          {show('artists') && artists.length > 0 && (
            <Section title="Artists">
              <div className="flex flex-wrap gap-2">{artists.map((a) => <Link key={a.id + a.name} to={`/artist/${encodeURIComponent(a.name)}`} className="flex items-center gap-2 rounded-full border border-line py-1.5 pl-1.5 pr-4 text-sm hover:border-accent"><Artwork title={a.name} className="h-8 w-8" rounded="rounded-full" />{a.name}</Link>)}</div>
            </Section>
          )}
          {show('playlists') && localPlaylists.length > 0 && <Section title="Your playlists"><Shelf>{localPlaylists.map((p) => <PlaylistCard key={p.id} playlist={p} />)}</Shelf></Section>}
        </>
      )}
    </div>
  )
}

function dedupe<T>(arr: T[], key: (x: T) => string): T[] { const s = new Set<string>(); return arr.filter((x) => { const k = key(x); if (s.has(k)) return false; s.add(k); return true }) }
