import { CalendarX, Filter, Music2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { applyFilter, type ReleaseFilter, type Window } from '../catalog/queries'
import { useSync } from '../catalog/sync'
import { ProviderHealthList } from '../components/ProviderHealth'
import { ReleaseCard } from '../components/ReleaseCard'
import { PageHeader } from '../components/Section'
import { SyncButton } from '../components/SyncButton'
import { Button, Card, Chip, EmptyState, Select, Skeleton, Switch } from '../components/ui'
import { sourceName } from '../components/Badges'
import { useCatalog, useFollows } from '../lib/data'
import { formatDate, parseDate, timeAgo } from '../lib/util'
import { providers } from '../providers/registry'
import type { Release, ReleaseKind } from '../types'

const WINDOWS: [Window, string][] = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All']]
const KINDS: [ReleaseKind | 'all', string][] = [['all', 'All types'], ['single', 'Singles'], ['album', 'Albums'], ['ep', 'EPs'], ['other', 'Other']]
const PAGE = 36

function groupLabel(r: Release): { key: string; label: string; sub?: string } {
  const d = r.releaseDate
  if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) return { key: d.slice(0, 10), label: formatDate(d) }
  if (d && parseDate(d) != null) return { key: `p:${d}`, label: formatDate(d), sub: 'Only part of the date is known' }
  return { key: 'none', label: 'Release date not provided', sub: 'The source gave no release date. These are sorted by when OpenSong found them.' }
}

export default function NewReleases() {
  const [catalog, loading] = useCatalog()
  const [follows] = useFollows()
  const syncing = useSync((s) => s.running)
  const last = useSync((s) => s.last)
  const [f, setF] = useState<ReleaseFilter>({ window: 'month', kind: 'all', playableOnly: false, independentOnly: false })
  const [followedOnly, setFollowedOnly] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const set = (p: Partial<ReleaseFilter>) => { setF((x) => ({ ...x, ...p })); setLimit(PAGE) }

  const genres = useMemo(() => [...new Set((catalog ?? []).flatMap((r) => [r.genre, ...(r.tags ?? [])]).filter((g): g is string => !!g).map((g) => g.toLowerCase()))].sort().slice(0, 80), [catalog])
  const countries = useMemo(() => [...new Set((catalog ?? []).map((r) => r.country).filter((c): c is string => !!c))].sort(), [catalog])

  const rows = useMemo(() => applyFilter(catalog ?? [], { ...f, followedOnly: followedOnly ? (follows ?? []).map((x) => x.name) : undefined }), [catalog, f, followedOnly, follows])
  const visible = rows.slice(0, limit)
  const groups = useMemo(() => {
    const out: { key: string; label: string; sub?: string; items: Release[] }[] = []
    for (const r of visible) { const g = groupLabel(r); const last = out[out.length - 1]; if (last && last.key === g.key) last.items.push(r); else out.push({ ...g, items: [r] }) }
    return out
  }, [visible])

  const withDate = (catalog ?? []).filter((r) => r.releaseDate).length

  return (
    <div className="space-y-5">
      <PageHeader title="New releases" subtitle={last ? `Catalogue updated ${timeAgo(last.at)} · ${catalog?.length ?? 0} releases on this device` : `${catalog?.length ?? 0} releases on this device`} actions={<SyncButton />} />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Release window">
          <Filter size={14} className="text-muted" />
          {WINDOWS.map(([w, label]) => <Chip key={w} active={f.window === w} onClick={() => set({ window: w })}>{label}</Chip>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select aria-label="Release type" value={f.kind} onChange={(e) => set({ kind: e.target.value as ReleaseKind | 'all' })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select aria-label="Genre" value={f.genre ?? ''} onChange={(e) => set({ genre: e.target.value || undefined })}><option value="">All genres</option>{genres.map((g) => <option key={g} value={g}>{g}</option>)}</Select>
          <Select aria-label="Country" value={f.country ?? ''} onChange={(e) => set({ country: e.target.value || undefined })}><option value="">All countries</option>{countries.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          <Select aria-label="Source" value={f.source ?? ''} onChange={(e) => set({ source: e.target.value || undefined })}><option value="">All sources</option>{providers.map((p) => <option key={p.id} value={p.id}>{sourceName(p.id)}</option>)}</Select>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Switch label="Playable only" checked={!!f.playableOnly} onChange={(v) => set({ playableOnly: v })} />
          <Switch label="Independent artists" checked={!!f.independentOnly} onChange={(v) => set({ independentOnly: v })} />
          <Switch label={`Followed artists${(follows?.length ?? 0) ? ` (${follows!.length})` : ''}`} checked={followedOnly} onChange={(v) => { setFollowedOnly(v); setLimit(PAGE) }} />
        </div>
      </Card>

      {loading ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-square !rounded-2xl" />)}</div>
        : rows.length === 0 ? (
          <EmptyState icon={<Music2 />} title={(catalog?.length ?? 0) === 0 ? 'No releases yet' : 'No releases match these filters'}
            action={<div className="flex gap-2">{(catalog?.length ?? 0) > 0 && <Button onClick={() => { setF({ window: 'all', kind: 'all' }); setFollowedOnly(false) }}>Show everything</Button>}<SyncButton /></div>}>
            {(catalog?.length ?? 0) === 0 ? (syncing ? 'Looking for new music…' : 'Press Refresh to fetch releases. If you are offline, connect once and OpenSong will fill this page.') : f.window !== 'all' && withDate === 0 ? 'None of the releases found so far include a release date, so date windows can’t include them. Try “All”.' : 'Try a wider window or remove a filter.'}
          </EmptyState>
        ) : (
          <>
            <p className="text-xs text-muted">{rows.length} release{rows.length === 1 ? '' : 's'} · newest first · dates are exactly what each source reports</p>
            {groups.map((g) => (
              <section key={g.key} className="space-y-3" aria-label={g.label}>
                <div className="flex items-baseline gap-2 border-b border-line pb-1"><h2 className="flex items-center gap-1.5 text-sm font-bold">{g.key === 'none' && <CalendarX size={14} className="text-muted" />}{g.label}</h2><span className="text-xs text-muted">{g.items.length}</span>{g.sub && <span className="hidden text-xs text-muted sm:inline">· {g.sub}</span>}</div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{g.items.map((r) => <ReleaseCard key={r.id} release={r} className="!w-auto" note={`Found ${timeAgo(r.discoveredAt)}`} />)}</div>
              </section>
            ))}
            {rows.length > limit && <div className="flex justify-center"><Button onClick={() => setLimit((l) => l + PAGE)}>Load more ({rows.length - limit} left)</Button></div>}
          </>
        )}

      <details className="rounded-2xl border border-line p-4 text-sm"><summary className="cursor-pointer font-medium">Source status</summary><div className="mt-3"><ProviderHealthList compact /></div></details>
    </div>
  )
}
