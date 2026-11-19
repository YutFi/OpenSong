import { RefreshCw } from 'lucide-react'
import { syncCatalog, useSync } from '../catalog/sync'
import { useUI } from '../store/ui'
import { Button } from './ui'

export function SyncButton({ label = 'Refresh' }: { label?: string }) {
  const running = useSync((s) => s.running)
  return (
    <Button size="sm" disabled={running} aria-label="Refresh catalogue" onClick={async () => {
      if (!navigator.onLine) { useUI.getState().toast('You’re offline — showing what’s already on this device.', 'error'); return }
      const r = await syncCatalog({ force: true })
      const failed = Object.values(r.providers).filter((p) => !p.ok).length
      useUI.getState().toast(`${r.added} new release${r.added === 1 ? '' : 's'} found${failed ? ` · ${failed} source${failed > 1 ? 's' : ''} unavailable` : ''}`, failed && !r.added ? 'error' : 'success')
    }}>
      <RefreshCw size={14} className={running ? 'animate-spin' : ''} />{running ? 'Updating…' : label}
    </Button>
  )
}
