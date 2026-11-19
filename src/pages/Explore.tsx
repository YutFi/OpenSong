import { Compass } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ReleaseCard } from '../components/ReleaseCard'
import { PageHeader, Section, ShelfSkeleton } from '../components/Section'
import { Card, Chip, EmptyState } from '../components/ui'
import { useCatalog } from '../lib/data'
import { useAsync, useOnline } from '../lib/hooks'
import { mergeIntoCatalog } from '../catalog/sync'
import { activeProviders, providerContext } from '../lib/providerCtx'
import { norm } from '../lib/util'
import type { Release } from '../types'

const SEED = ['electronic', 'ambient', 'rock', 'pop', 'hip hop', 'jazz', 'classical', 'folk', 'metal', 'experimental', 'lofi', 'soundtrack', 'blues', 'world', 'punk', 'reggae']

export default function Explore() {
  const [params, setParams] = useSearchParams()
  const genre = params.get('genre') ?? ''
  const [catalog] = useCatalog()
  const online = useOnline()

  const genres = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of catalog ?? []) for (const g of new Set([r.genre, ...(r.tags ?? [])].filter(Boolean).map((x) => norm(x!)))) m.set(g, (m.get(g) ?? 0) + 1)
    const fromCatalog = [...m.entries()].filter(([g]) => g.length > 1 && g.length < 24).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([g]) => g)
    return [...new Set([...fromCatalog, ...SEED])].slice(0, 32)
  }, [catalog])

  const local = useMemo(() => genre ? (catalog ?? []).filter((r) => [r.genre, ...(r.tags ?? [])].some((g) => g && norm(g) === norm(genre))) : [], [catalog, genre])

  // Ask the enabled providers for this genre live; results are also merged into the catalogue so they work offline later.
  const live = useAsync<Release[]>(genre && online ? `genre:${genre}` : null, async (signal) => {
    const ctx = providerContext(signal)
    const res = await Promise.allSettled(activeProviders().filter((p) => p.byGenre).map((p) => p.byGenre!(genre, ctx)))
    const items = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    if (items.length) await mergeIntoCatalog(items)
    return items
  })

  const shown = useMemo(() => {
    const seen = new Set<string>(); const out: Release[] = []
    for (const r of [...(live.data ?? []), ...local]) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r) }
    return out
  }, [live.data, local])

  return (
    <div className="space-y-6">
      <PageHeader title="Explore" subtitle="Browse by genre across the open catalogues you’ve enabled." />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Genres">
        {genres.map((g) => <Chip key={g} active={norm(g) === norm(genre)} onClick={() => setParams(norm(g) === norm(genre) ? {} : { genre: g })} className="capitalize">{g}</Chip>)}
      </div>

      {!genre ? (
        <Card className="space-y-2 text-sm">
          <div className="flex items-center gap-2 font-semibold"><Compass size={16} />Pick a genre</div>
          <p className="text-muted">OpenSong searches the sources you’ve enabled in <Link to="/settings" className="text-accent hover:underline">Settings</Link>. Only music that is actually available is shown as playable; everything else is clearly labelled.</p>
        </Card>
      ) : (
        <Section title={genre.charAt(0).toUpperCase() + genre.slice(1)} subtitle={live.loading ? 'Searching sources…' : online ? `${shown.length} release${shown.length === 1 ? '' : 's'}` : 'Offline — showing releases already on this device'}>
          {live.loading && shown.length === 0 ? <ShelfSkeleton /> : shown.length === 0 ? (
            <EmptyState icon={<Compass />} title="Nothing found for this genre">{live.error ? `A source reported: ${live.error}. ` : ''}Try a broader tag, or check the source status in Settings.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 [&>*]:w-auto">{shown.map((r) => <ReleaseCard key={r.id} release={r} className="!w-auto" />)}</div>
          )}
        </Section>
      )}
    </div>
  )
}
