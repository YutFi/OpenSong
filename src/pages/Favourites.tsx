import { Disc3, Heart, Play, Shuffle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Artwork } from '../components/Artwork'
import { PageHeader, Section } from '../components/Section'
import { TrackList } from '../components/TrackRow'
import { Button, EmptyState } from '../components/ui'
import { useFavourites } from '../lib/data'
import { db } from '../lib/db'
import { toggleFavouriteAlbum } from '../lib/library'
import { useLive } from '../lib/useLive'
import { usePlayer } from '../store/player'
import { IconButton } from '../components/ui'

export default function Favourites() {
  const [favs] = useFavourites()
  const [albums] = useLive(() => db.favAlbums.orderBy('addedAt').reverse().toArray(), [])
  const tracks = (favs ?? []).map((f) => f.track)
  const empty = tracks.length === 0 && (albums?.length ?? 0) === 0
  return (
    <div className="space-y-8">
      <PageHeader title="Favourites" subtitle="Hearts are stored on this device and shape your recommendations." actions={tracks.length > 0 && <>
        <Button variant="primary" onClick={() => void usePlayer.getState().playQueue(tracks, 0)}><Play size={16} fill="currentColor" />Play all</Button>
        <Button onClick={() => { const p = usePlayer.getState(); void p.playQueue(tracks, Math.floor(Math.random() * tracks.length)); if (!p.shuffle) p.toggleShuffle() }}><Shuffle size={16} />Shuffle</Button>
      </>} />
      {empty && <EmptyState icon={<Heart />} title="No favourites yet">Tap the heart on any song or album to keep it here.</EmptyState>}
      {tracks.length > 0 && <Section title="Songs"><TrackList tracks={tracks} /></Section>}
      {(albums?.length ?? 0) > 0 && (
        <Section title="Albums">
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {albums!.map((a) => (
              <li key={a.id} className="flex items-center gap-3 p-3">
                <Artwork src={a.artworkUrl} title={a.album} className="h-12 w-12" />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 truncate font-semibold"><Disc3 size={14} className="shrink-0 text-muted" />{a.album}</div><Link to={`/artist/${encodeURIComponent(a.artist)}`} className="truncate text-xs text-muted hover:underline">{a.artist}</Link></div>
                <IconButton label={`Remove ${a.album} from favourites`} active onClick={() => void toggleFavouriteAlbum(a.album, a.artist, a.artworkUrl)}><Heart size={18} fill="currentColor" /></IconButton>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
