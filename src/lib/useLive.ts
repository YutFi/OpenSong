import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'

/** Subscribe to a Dexie query; re-renders whenever the underlying tables change. */
export function useLive<T>(query: () => Promise<T> | T, deps: unknown[] = [], initial?: T): [T | undefined, boolean] {
  const [value, setValue] = useState<T | undefined>(initial)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    const sub = liveQuery(async () => query()).subscribe({
      next: (v) => { setValue(v); setLoading(false) },
      error: () => setLoading(false),
    })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return [value, loading]
}
