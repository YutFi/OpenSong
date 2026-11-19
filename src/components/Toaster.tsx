import { useUI } from '../store/ui'
import { cn } from '../lib/util'
import { useYT } from '../audio/ytPlayer'

export function Toaster() {
  const toasts = useUI((s) => s.toasts)
  // Nothing may be drawn over YouTube's player, so notifications move to the top of the screen while it is showing.
  const ytShown = useYT((s) => s.visible)
  return (
    <div role="status" aria-live="polite" className={cn('pointer-events-none fixed inset-x-0 z-[200] flex flex-col items-center gap-2 px-4', ytShown && 'top-3')} style={ytShown ? undefined : { bottom: 'calc(8.5rem + env(safe-area-inset-bottom))' }}>
      {toasts.map((t) => (
        <button key={t.id} onClick={() => useUI.getState().dismiss(t.id)} className={cn('pointer-events-auto max-w-md rounded-2xl border px-4 py-2.5 text-left text-sm shadow-xl', t.kind === 'error' ? 'border-danger/40 bg-surface text-danger' : t.kind === 'success' ? 'border-ok/40 bg-surface' : 'border-line bg-surface2')}>{t.message}</button>
      ))}
    </div>
  )
}
