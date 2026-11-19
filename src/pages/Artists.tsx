import { UserMinus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Artwork } from '../components/Artwork'
import { PageHeader } from '../components/Section'
import { EmptyState, IconButton } from '../components/ui'
import { useCatalog, useFollows } from '../lib/data'
import { toggleFollow } from '../lib/library'
import { norm, timeAgo } from '../lib/util'

export default function Artists() {
  const [follows] = useFollows()
  const [catalog] = useCatalog()
  const list = [...(follows ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="space-y-5">
      <PageHeader title="Followed artists" subtitle="Follow an artist to be told when a new release appears. Stored only on this device." />
      {list.length === 0 ? <EmptyState icon={<Users />} title="You’re not following anyone yet">Open a release or artist page and press Follow.</EmptyState> : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {list.map((a) => {
            const rels = (catalog ?? []).filter((r) => norm(r.artist) === norm(a.name))
            const art = rels.find((r) => r.artworkUrl)?.artworkUrl
            return (
              <li key={a.name} className="flex items-center gap-3 p-3">
                <Artwork src={art} title={a.name} className="h-12 w-12" rounded="rounded-full" />
                <Link to={`/artist/${encodeURIComponent(a.name)}`} className="min-w-0 flex-1"><div className="truncate font-semibold hover:underline">{a.name}</div><div className="text-xs text-muted">{rels.length} release{rels.length === 1 ? '' : 's'} in catalogue · followed {timeAgo(a.addedAt)}</div></Link>
                <IconButton label={`Unfollow ${a.name}`} onClick={() => void toggleFollow(a.name)}><UserMinus size={18} /></IconButton>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
