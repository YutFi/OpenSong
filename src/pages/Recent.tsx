import { History, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader } from '../components/Section'
import { TrackRow, useFavouriteIds } from '../components/TrackRow'
import { Button, EmptyState } from '../components/ui'
import { useHistory, useTrackIndex } from '../lib/data'
import { clearHistory } from '../lib/library'
import { clearRecent } from '../lib/recent'
import { timeAgo } from '../lib/util'
import { useSettings } from '../store/settings'
import { useUI } from '../store/ui'
import type { Track } from '../types'

export default function Recent() {
  const [history] = useHistory()
  const [index] = useTrackIndex()
  const favs = useFavouriteIds()
  const rec = useSettings((s) => s.recordHistory)
  const [confirm, setConfirm] = useState(false)

  const rows = useMemo(() => [...(history ?? [])].sort((a, b) => b.startedAt - a.startedAt).slice(0, 300), [history])
  const playable = useMemo<Track[]>(() => rows.map((h) => index?.get(h.trackId)).filter((t): t is Track => !!t), [rows, index])

  return (
    <div className="space-y-5">
      <PageHeader title="Recently played" subtitle={rec ? 'Your listening history lives only on this device.' : 'History recording is turned off in Settings → Privacy.'} actions={rows.length > 0 && <Button variant="danger" onClick={() => setConfirm(true)}><Trash2 size={16} />Clear history</Button>} />
      {rows.length === 0 ? <EmptyState icon={<History />} title="Nothing played yet">Songs you listen to for a while will show up here.</EmptyState> : (
        <div className="space-y-0.5">
          {rows.map((h) => {
            const t = index?.get(h.trackId)
            const track: Track = t ?? { id: h.trackId, title: h.title, artist: h.artist, album: h.album, source: h.source, availability: 'metadata' }
            return <TrackRow key={h.id ?? `${h.trackId}-${h.startedAt}`} track={track} context={t ? playable : [track]} favourites={favs} meta={`${timeAgo(h.startedAt)}${h.skipped ? ' · skipped' : ''}`} showAlbum={false} />
          })}
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Clear listening history?" confirmLabel="Clear" body="This removes your play history, which also resets Wrapped-style statistics and personalised recommendations. Favourites, playlists and your library are kept." onConfirm={() => void Promise.all([clearHistory(), clearRecent()]).then(() => useUI.getState().toast('History cleared', 'success'))} />
    </div>
  )
}
