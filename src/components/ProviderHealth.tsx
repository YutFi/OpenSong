import { useEffect, useState } from 'react'
import { health, onHealthChange } from '../lib/http'
import { timeAgo } from '../lib/util'
import { providers } from '../providers/registry'
import { useSettings } from '../store/settings'
import { cn } from '../lib/util'

/** Honest per-source status derived from real request outcomes this session (not a ping). */
export function ProviderHealthList({ compact }: { compact?: boolean }) {
  const [, tick] = useState(0)
  useEffect(() => onHealthChange(() => tick((n) => n + 1)), [])
  const enabled = useSettings((s) => s.providers)
  const key = useSettings((s) => s.jamendoClientId)
  return (
    <ul className={cn('grid gap-2', compact ? 'sm:grid-cols-2' : '')}>
      {providers.map((p) => {
        const h = health.get(p.id)
        const off = enabled[p.id] === false
        const needsKey = p.keyRequired && !key.trim()
        const state = off ? 'Turned off' : needsKey ? 'Needs a client ID' : !h ? 'Not contacted yet' : h.ok ? `Working · ${h.lastOk ? timeAgo(h.lastOk) : ''}` : `Unavailable · ${h.consecutiveFailures} failed in a row`
        const dot = off || needsKey || !h ? 'bg-muted/50' : h.ok ? 'bg-emerald-500' : 'bg-red-500'
        return (
          <li key={p.id} className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden />
            <div className="min-w-0"><div className="font-medium">{p.name}</div><div className="text-xs text-muted">{state}</div>{h && !h.ok && h.lastError && <div className="truncate text-xs text-red-400" title={h.lastError}>{h.lastError}</div>}</div>
          </li>
        )
      })}
    </ul>
  )
}
