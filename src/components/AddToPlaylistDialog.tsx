import { Plus } from 'lucide-react'
import { useState } from 'react'
import { db } from '../lib/db'
import { addToPlaylist, createPlaylist } from '../lib/library'
import { useLive } from '../lib/useLive'
import { useUI } from '../store/ui'
import { Artwork } from './Artwork'
import { Button, Input, Modal } from './ui'

export function AddToPlaylistDialog() {
  const tracks = useUI((s) => s.addToPlaylist)
  const close = () => useUI.getState().openAddToPlaylist(null)
  const [lists] = useLive(() => db.playlists.orderBy('updatedAt').reverse().toArray(), [])
  const [name, setName] = useState('')
  const toast = useUI.getState().toast
  if (!tracks) return null
  const label = tracks.length === 1 ? `“${tracks[0].title}”` : `${tracks.length} tracks`
  return (
    <Modal open onClose={close} title={`Add ${label} to…`}>
      <form className="mb-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; const p = await createPlaylist(name, tracks); toast(`Created “${p.name}”`, 'success'); setName(''); close() }}>
        <Input placeholder="New playlist name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="New playlist name" />
        <Button type="submit" variant="primary" disabled={!name.trim()}><Plus size={16} />Create</Button>
      </form>
      <div className="space-y-1">
        {(lists ?? []).map((p) => (
          <button key={p.id} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface2"
            onClick={async () => { const n = await addToPlaylist(p.id, tracks); toast(n ? `Added ${n} to “${p.name}”` : `Already in “${p.name}”`, n ? 'success' : 'info'); close() }}>
            <Artwork src={p.artwork} title={p.name} className="h-10 w-10" rounded="rounded-lg" />
            <div className="min-w-0"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-xs text-muted">{p.tracks.length} tracks</div></div>
          </button>
        ))}
        {lists && !lists.length && <p className="py-4 text-center text-sm text-muted">No playlists yet — create one above.</p>}
      </div>
    </Modal>
  )
}
