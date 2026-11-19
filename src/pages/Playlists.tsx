import { FileUp, ListMusic, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlaylistCard } from '../components/PlaylistCard'
import { PageHeader } from '../components/Section'
import { Button, EmptyState, Field, Input, Modal } from '../components/ui'
import { usePlaylists } from '../lib/data'
import { createPlaylist, importPlaylist } from '../lib/library'
import { useUI } from '../store/ui'

export default function Playlists() {
  const [lists, loading] = usePlaylists()
  const nav = useNavigate()
  const file = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const create = async () => { const p = await createPlaylist(name || 'New playlist'); setOpen(false); setName(''); nav(`/playlist/${p.id}`) }
  const doImport = async (f: File) => {
    try {
      const r = await importPlaylist(await f.text(), f.name)
      useUI.getState().toast(`Imported “${r.playlist.name}” — ${r.matched} track${r.matched === 1 ? '' : 's'}${r.missing.length ? `, ${r.missing.length} not found in your library` : ''}`, r.missing.length ? 'info' : 'success')
      nav(`/playlist/${r.playlist.id}`)
    } catch (e) { useUI.getState().toast(e instanceof Error ? e.message : 'Could not import that file', 'error') }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Playlists" subtitle="Saved on this device. Export to JSON or M3U any time." actions={<>
        <Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />New playlist</Button>
        <Button onClick={() => file.current?.click()}><FileUp size={16} />Import</Button>
      </>} />
      <input ref={file} type="file" accept=".json,.m3u,.m3u8,application/json,audio/x-mpegurl" className="hidden" aria-label="Import playlist file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = '' }} />
      {loading ? null : (lists?.length ?? 0) === 0
        ? <EmptyState icon={<ListMusic />} title="No playlists yet" action={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />Create one</Button>}>Add songs from anywhere using the “Add to playlist” menu.</EmptyState>
        : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{lists!.map((p) => <PlaylistCard key={p.id} playlist={p} className="!w-auto" />)}</div>}
      <Modal open={open} onClose={() => setOpen(false)} title="New playlist" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => void create()}>Create</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); void create() }}><Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="My playlist" maxLength={120} /></Field></form>
      </Modal>
    </div>
  )
}
