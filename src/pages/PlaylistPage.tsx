import { Download, ImagePlus, ListMusic, Pencil, Play, Shuffle, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Artwork } from '../components/Artwork'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Menu } from '../components/Menu'
import { TrackRow, useFavouriteIds } from '../components/TrackRow'
import { Button, EmptyState, Field, Input, Modal } from '../components/ui'
import { db } from '../lib/db'
import { deletePlaylist, exportPlaylistJSON, exportPlaylistM3U, imageToDataUrl, playlistDuration, updatePlaylist } from '../lib/library'
import { useLive } from '../lib/useLive'
import { download, formatDuration, moveArr } from '../lib/util'
import { usePlayer } from '../store/player'
import { useUI } from '../store/ui'

export default function PlaylistPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [pl, loading] = useLive(() => db.playlists.get(id), [id])
  const favs = useFavouriteIds()
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const img = useRef<HTMLInputElement>(null)

  if (loading) return null
  if (!pl) return <EmptyState icon={<ListMusic />} title="Playlist not found" action={<Button onClick={() => nav('/playlists')}>Back to playlists</Button>}>It may have been deleted.</EmptyState>

  const cover = pl.artwork ?? pl.tracks.find((t) => t.artworkUrl)?.artworkUrl
  const coverBlob = pl.artwork ? undefined : pl.tracks.find((t) => t.artworkBlobKey)?.artworkBlobKey
  const slug = pl.name.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'playlist'

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end gap-5">
        <Artwork src={cover} blobKey={coverBlob} title={pl.name} className="h-36 w-36 sm:h-44 sm:w-44" rounded="rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Playlist</p>
          <h1 className="break-words text-3xl font-extrabold tracking-tight sm:text-5xl">{pl.name}</h1>
          {pl.description && <p className="text-sm text-muted">{pl.description}</p>}
          <p className="text-xs text-muted">{pl.tracks.length} track{pl.tracks.length === 1 ? '' : 's'}{pl.tracks.length ? ` · ${formatDuration(playlistDuration(pl))}` : ''}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={!pl.tracks.length} onClick={() => void usePlayer.getState().playQueue(pl.tracks, 0)}><Play size={16} fill="currentColor" />Play</Button>
            <Button disabled={!pl.tracks.length} onClick={() => { const p = usePlayer.getState(); void p.playQueue(pl.tracks, Math.floor(Math.random() * pl.tracks.length)); if (!p.shuffle) p.toggleShuffle() }}><Shuffle size={16} />Shuffle</Button>
            <Button onClick={() => { setName(pl.name); setDesc(pl.description ?? ''); setEdit(true) }}><Pencil size={16} />Edit</Button>
            <Menu label="Playlist actions" items={[
              { label: 'Export as JSON', icon: <Download size={16} />, onSelect: () => download(`${slug}.json`, exportPlaylistJSON(pl), 'application/json') },
              { label: 'Export as M3U', icon: <Download size={16} />, onSelect: () => download(`${slug}.m3u8`, exportPlaylistM3U(pl), 'audio/x-mpegurl') },
              { label: 'Choose cover image…', icon: <ImagePlus size={16} />, onSelect: () => img.current?.click() },
              { label: 'Delete playlist', icon: <Trash2 size={16} />, danger: true, onSelect: () => setDel(true) },
            ]} />
          </div>
        </div>
      </header>
      <input ref={img} type="file" accept="image/*" className="hidden" aria-label="Choose cover image" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { await updatePlaylist(pl.id, { artwork: await imageToDataUrl(f) }) } catch { useUI.getState().toast('That image could not be read', 'error') } }} />

      {pl.tracks.length === 0 ? <EmptyState icon={<ListMusic />} title="This playlist is empty">Use “Add to playlist” on any song to put it here.</EmptyState> : (
        <div className="space-y-0.5">
          {pl.tracks.map((t, i) => (
            <TrackRow key={`${t.id}-${i}`} track={t} context={pl.tracks} index={i} favourites={favs} removeLabel="Remove from playlist"
              onRemove={() => void updatePlaylist(pl.id, { tracks: pl.tracks.filter((_, j) => j !== i) })}
              draggable={{ onDragStart: () => setDragFrom(i), onDrop: () => { if (dragFrom != null && dragFrom !== i) void updatePlaylist(pl.id, { tracks: moveArr(pl.tracks, dragFrom, i) }); setDragFrom(null) } }}
              extraMenu={[
                ...(i > 0 ? [{ label: 'Move up', onSelect: () => void updatePlaylist(pl.id, { tracks: moveArr(pl.tracks, i, i - 1) }) }] : []),
                ...(i < pl.tracks.length - 1 ? [{ label: 'Move down', onSelect: () => void updatePlaylist(pl.id, { tracks: moveArr(pl.tracks, i, i + 1) }) }] : []),
              ]} />
          ))}
        </div>
      )}

      <Modal open={edit} onClose={() => setEdit(false)} title="Edit playlist" footer={<><Button onClick={() => setEdit(false)}>Cancel</Button><Button variant="primary" onClick={() => { void updatePlaylist(pl.id, { name: name.trim() || pl.name, description: desc.trim() || undefined }); setEdit(false) }}>Save</Button></>}>
        <div className="space-y-3"><Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field><Field label="Description"><Input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} /></Field></div>
      </Modal>
      <ConfirmDialog open={del} onClose={() => setDel(false)} title="Delete playlist?" body={`“${pl.name}” will be removed from this device. The songs themselves are not deleted.`} onConfirm={() => { void deletePlaylist(pl.id); nav('/playlists') }} />
    </div>
  )
}
