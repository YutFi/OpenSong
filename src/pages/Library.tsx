import { FolderOpen, HardDriveUpload, Library as LibIcon, Play, Search, Shuffle, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader } from '../components/Section'
import { TrackList } from '../components/TrackRow'
import { Button, Card, EmptyState, Input, Select } from '../components/ui'
import { useLibrary } from '../lib/data'
import { ACCEPT, browserCanPlay, extOf, importFiles, removeLocalTracks, SUPPORTED_EXT, type ImportResult } from '../lib/library'
import { formatDuration, norm } from '../lib/util'
import { usePlayer } from '../store/player'
import { useUI } from '../store/ui'

type Sort = 'added' | 'title' | 'artist' | 'album'

export default function Library() {
  const [tracks, loading] = useLibrary()
  const input = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('added')
  const [confirm, setConfirm] = useState(false)

  const run = async (files: File[]) => {
    if (!files.length) return
    setResult(null); setBusy({ done: 0, total: files.length, name: '' })
    try {
      const r = await importFiles(files, (done, total, name) => setBusy({ done, total, name }))
      setResult(r)
      useUI.getState().toast(`${r.added.length} added${r.duplicates.length ? ` · ${r.duplicates.length} already in library` : ''}`, r.added.length ? 'success' : 'info')
    } catch (e) { useUI.getState().toast(e instanceof Error ? e.message : 'Import failed', 'error') }
    finally { setBusy(null) }
  }

  const list = useMemo(() => {
    const n = norm(q)
    const rows = (tracks ?? []).filter((t) => !n || [t.title, t.artist, t.album, t.genre].some((f) => f && norm(f).includes(n)))
    const by: Record<Sort, (a: typeof rows[number], b: typeof rows[number]) => number> = {
      added: (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0),
      title: (a, b) => a.title.localeCompare(b.title), artist: (a, b) => a.artist.localeCompare(b.artist) || (a.album ?? '').localeCompare(b.album ?? ''), album: (a, b) => (a.album ?? '').localeCompare(b.album ?? ''),
    }
    return rows.sort(by[sort])
  }, [tracks, q, sort])
  const total = (tracks ?? []).reduce((s, t) => s + (t.duration ?? 0), 0)
  const risky = SUPPORTED_EXT.filter((e) => !browserCanPlay(e))

  return (
    <div className="space-y-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); void run([...e.dataTransfer.files].filter((f) => SUPPORTED_EXT.includes(extOf(f.name)) || f.type.startsWith('audio/'))) }}>
      <PageHeader title="Your library" subtitle={tracks?.length ? `${tracks.length} track${tracks.length === 1 ? '' : 's'} · ${formatDuration(total)} · stored in this browser only` : 'Music you own, played from this device. Files never leave your browser.'}
        actions={<>
          <Button variant="primary" onClick={() => input.current?.click()}><HardDriveUpload size={16} />Add files</Button>
          <Button onClick={() => dirInput.current?.click()}><FolderOpen size={16} />Add folder</Button>
        </>} />
      <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Choose audio files" onChange={(e) => { void run([...(e.target.files ?? [])]); e.target.value = '' }} />
      <input ref={dirInput} type="file" multiple className="hidden" aria-label="Choose a folder of audio files" {...({ webkitdirectory: '' } as object)}
        onChange={(e) => { void run([...(e.target.files ?? [])].filter((f) => SUPPORTED_EXT.includes(extOf(f.name)))); e.target.value = '' }} />

      {busy && <Card role="status" aria-live="polite" className="space-y-2 text-sm"><div className="flex justify-between"><span>Importing… {busy.done}/{busy.total}</span><span className="max-w-[50%] truncate text-muted">{busy.name}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-surface2"><div className="h-full bg-accent transition-all" style={{ width: `${(busy.done / busy.total) * 100}%` }} /></div></Card>}

      {result && (result.failed.length > 0 || result.unsupported.length > 0 || result.duplicates.length > 0) && (
        <Card className="space-y-1 text-sm">
          <div className="font-semibold">Import summary</div>
          <p className="text-muted">{result.added.length} added · {result.duplicates.length} duplicate{result.duplicates.length === 1 ? '' : 's'} skipped</p>
          {result.unsupported.length > 0 && <details><summary className="cursor-pointer text-muted">{result.unsupported.length} unsupported file{result.unsupported.length === 1 ? '' : 's'}</summary><ul className="mt-1 list-disc pl-5 text-xs text-muted">{result.unsupported.slice(0, 30).map((n) => <li key={n}>{n}</li>)}</ul></details>}
          {result.failed.length > 0 && <details open><summary className="cursor-pointer text-red-400">{result.failed.length} failed</summary><ul className="mt-1 list-disc pl-5 text-xs text-muted">{result.failed.slice(0, 30).map((f) => <li key={f.name}>{f.name} — {f.reason}</li>)}</ul></details>}
        </Card>
      )}

      {loading ? null : (tracks?.length ?? 0) === 0 ? (
        <EmptyState icon={<LibIcon />} title="Your library is empty" action={<Button variant="primary" onClick={() => input.current?.click()}><HardDriveUpload size={16} />Choose audio files</Button>}>
          Add MP3, WAV, FLAC, OGG/Opus, M4A or AAC files — or drop them anywhere on this page. Tags and cover art are read automatically; nothing is uploaded.
          {risky.length > 0 && <span className="mt-1 block text-xs">This browser can’t decode: {risky.join(', ')}. Those files are skipped with a clear message.</span>}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input aria-label="Filter library" placeholder="Filter by title, artist, album…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" /></div>
            <Select aria-label="Sort library" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto"><option value="added">Recently added</option><option value="title">Title</option><option value="artist">Artist</option><option value="album">Album</option></Select>
            <Button variant="primary" onClick={() => void usePlayer.getState().playQueue(list, 0)} disabled={!list.length}><Play size={16} fill="currentColor" />Play</Button>
            <Button onClick={() => { const p = usePlayer.getState(); void p.playQueue(list, Math.floor(Math.random() * list.length)); if (!p.shuffle) p.toggleShuffle() }} disabled={!list.length}><Shuffle size={16} />Shuffle</Button>
            <Button variant="danger" onClick={() => setConfirm(true)} aria-label="Remove all tracks from library"><Trash2 size={16} /></Button>
          </div>
          <TrackList tracks={list} extraMenu={[]} />
          {list.length === 0 && <p className="text-sm text-muted">No tracks match “{q}”.</p>}
        </>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Remove all library tracks?" confirmLabel="Remove all" body="This deletes the imported audio from this browser’s storage. Your original files on disk are not touched. Playlists keep their entries but those tracks will no longer play until re-imported." onConfirm={() => void removeLocalTracks((tracks ?? []).map((t) => t.id)).then(() => useUI.getState().toast('Library cleared', 'success'))} />
    </div>
  )
}
