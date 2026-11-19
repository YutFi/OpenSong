import { Flame } from 'lucide-react'
import { useMemo } from 'react'
import { ReleaseCard } from '../components/ReleaseCard'
import { PageHeader } from '../components/Section'
import { SyncButton } from '../components/SyncButton'
import { EmptyState, Skeleton } from '../components/ui'
import { useCatalog } from '../lib/data'

export default function Trending() {
  const [catalog, loading] = useCatalog()
  const rows = useMemo(() => (catalog ?? []).filter((r) => r.trending).sort((a, b) => (b.listenCount ?? 0) - (a.listenCount ?? 0)), [catalog])
  return (
    <div className="space-y-5">
      <PageHeader title="Trending" subtitle="Most-played recently on the open sources that publish listening charts (ListenBrainz, Jamendo). Counts are theirs, not ours." actions={<SyncButton />} />
      {loading ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-square !rounded-2xl" />)}</div>
        : rows.length === 0 ? <EmptyState icon={<Flame />} title="No trending data yet" action={<SyncButton label="Check now" />}>Trending lists refresh every 12 hours while OpenSong is open and you’re online.</EmptyState>
        : <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{rows.map((r, i) => <li key={r.id} className="relative"><span className="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white">#{i + 1}</span><ReleaseCard release={r} className="!w-auto" note={r.listenCount ? `${r.listenCount.toLocaleString()} listens` : undefined} /></li>)}</ol>}
    </div>
  )
}
