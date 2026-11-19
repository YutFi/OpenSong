import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn, formatDuration } from '../lib/util'
import { usePlayer } from '../store/player'
import { useUI } from '../store/ui'
import { Artwork } from './Artwork'
import { Button, IconButton } from './ui'

export function QueueDrawer() {
  const open = useUI((s) => s.queueOpen)
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const status = usePlayer((s) => s.status)
  const drag = useRef<number | null>(null)
  const p = usePlayer.getState
  if (!open) return null
  const total = queue.reduce((s, t) => s + (t.duration ?? 0), 0)
  return createPortal(
    <div className="fixed inset-0 z-[95]" onMouseDown={(e) => e.target === e.currentTarget && useUI.getState().setQueue(false)}>
      <aside role="dialog" aria-label="Queue" className="absolute inset-x-0 bottom-0 top-16 flex flex-col rounded-t-3xl border border-line bg-surface shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-96 md:rounded-none">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div><h2 className="font-semibold">Queue</h2><p className="text-xs text-muted">{queue.length} tracks{total > 0 ? ` · ${formatDuration(total)}` : ''}</p></div>
          <div className="flex items-center gap-1"><Button size="sm" variant="ghost" disabled={queue.length < 2} onClick={() => p().clearQueue()}>Clear upcoming</Button><IconButton label="Close queue" onClick={() => useUI.getState().setQueue(false)}><X size={18} /></IconButton></div>
        </div>
        <ol className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {queue.length === 0 && <li className="p-6 text-center text-sm text-muted">Your queue is empty.</li>}
          {queue.map((t, i) => (
            <li key={`${t.id}-${i}`} draggable onDragStart={() => (drag.current = i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag.current != null) p().moveInQueue(drag.current, i); drag.current = null }}
              className={cn('group flex items-center gap-2 rounded-xl p-1.5 hover:bg-surface2', i === index && 'bg-surface2')}>
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => void p().jumpTo(i)} aria-label={`Play ${t.title}`}>
                <Artwork src={t.artworkUrl} blobKey={t.artworkBlobKey} title={t.title} className="h-10 w-10" rounded="rounded-lg" />
                <div className="min-w-0"><div className={cn('truncate text-sm font-medium', i === index && 'text-accent')}>{t.title}{i === index && status === 'playing' ? ' ▶' : ''}</div><div className="truncate text-xs text-muted">{t.artist}</div></div>
              </button>
              <IconButton label="Move up" disabled={i === 0} onClick={() => p().moveInQueue(i, i - 1)}><ArrowUp size={15} /></IconButton>
              <IconButton label="Move down" disabled={i === queue.length - 1} onClick={() => p().moveInQueue(i, i + 1)}><ArrowDown size={15} /></IconButton>
              <IconButton label={`Remove ${t.title} from queue`} onClick={() => p().removeFromQueue(i)}><Trash2 size={15} /></IconButton>
            </li>
          ))}
        </ol>
      </aside>
    </div>, document.body)
}
