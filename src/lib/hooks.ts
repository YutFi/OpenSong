import { useEffect, useState } from 'react'

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export function useOnline(): boolean {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false)
    window.addEventListener('online', a); window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  return on
}

/** Runs an async fetch with abort + error state. Re-runs when `key` changes; `null` key = idle. */
export function useAsync<T>(key: string | null, fn: (signal: AbortSignal) => Promise<T>): { data?: T; loading: boolean; error?: string } {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: string }>({ loading: key != null })
  useEffect(() => {
    if (key == null) { setState({ loading: false }); return }
    const ac = new AbortController()
    setState((s) => ({ data: s.data, loading: true }))
    fn(ac.signal).then((data) => { if (!ac.signal.aborted) setState({ data, loading: false }) })
      .catch((e: unknown) => { if (!ac.signal.aborted) setState({ loading: false, error: e instanceof Error ? e.message : 'Failed' }) })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}
