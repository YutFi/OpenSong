import { useUI } from '../store/ui'
import { cn } from '../lib/util'

export function Toaster() {
  const toasts = useUI((s) => s.toasts)
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 z-[200] flex flex-col items-center gap-2 px-4" style={{ bottom: 'calc(8.5rem + env(safe-area-inset-bottom))' }}>
      {toasts.map((t) => (
        <button key={t.id} onClick={() => useUI.getState().dismiss(t.id)} className={cn('pointer-events-auto max-w-md rounded-2xl border px-4 py-2.5 text-left text-sm shadow-xl', t.kind === 'error' ? 'border-danger/40 bg-surface text-danger' : t.kind === 'success' ? 'border-ok/40 bg-surface' : 'border-line bg-surface2')}>{t.message}</button>
      ))}
    </div>
  )
}
