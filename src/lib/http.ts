import { db } from './db'
import { sleep } from './util'
import type { ProviderHealth } from '../types'

export interface FetchOptions {
  provider: string
  /** Minimum gap between requests to this provider (ms). */
  minIntervalMs?: number
  retries?: number
  /** Cache TTL in ms. 0 disables caching. */
  cacheTtl?: number
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
  /** Used instead of the URL as the cache key — keeps API keys out of the stored cache. */
  cacheId?: string
}

/** Per-provider polite request queue: one in flight at a time with a minimum interval. */
const chains = new Map<string, Promise<unknown>>()
const lastStart = new Map<string, number>()

function schedule<T>(provider: string, minInterval: number, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(provider) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(async () => {
    const wait = (lastStart.get(provider) ?? 0) + minInterval - Date.now()
    if (wait > 0) await sleep(wait)
    lastStart.set(provider, Date.now())
    return fn()
  })
  chains.set(provider, run)
  return run
}

/** In-memory health + request counters (also surfaced in Settings → Providers for transparency). */
export const health = new Map<string, ProviderHealth>()
const listeners = new Set<() => void>()
export const onHealthChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

function record(provider: string, ok: boolean, err?: string) {
  const h = health.get(provider) ?? { ok: true, consecutiveFailures: 0, requests: 0 }
  h.requests++
  if (ok) { h.ok = true; h.lastOk = Date.now(); h.consecutiveFailures = 0 }
  else { h.ok = false; h.lastError = err; h.lastErrorAt = Date.now(); h.consecutiveFailures++ }
  health.set(provider, h)
  listeners.forEach((l) => l())
}

export class HttpError extends Error {
  status: number
  constructor(status: number, msg: string) { super(msg); this.status = status }
}

async function rawFetch(url: string, opts: FetchOptions): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), opts.timeoutMs ?? 15000)
  const onAbort = () => ctrl.abort(opts.signal?.reason)
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', ...opts.headers },
      credentials: 'omit',
      referrerPolicy: 'strict-origin-when-cross-origin',
    })
    if (res.status === 204) return null
    if (!res.ok) {
      const e = new HttpError(res.status, `HTTP ${res.status}`)
      ;(e as HttpError & { retryAfter?: number }).retryAfter = Number(res.headers.get('Retry-After')) || undefined
      throw e
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Fetch JSON politely: serial per-provider queue, retry with exponential backoff on 429/5xx/network
 * errors, optional TTL cache in IndexedDB, and health bookkeeping.
 * If the network is down but a stale cache entry exists, the stale value is returned.
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchOptions): Promise<T> {
  const ttl = opts.cacheTtl ?? 0
  const cacheKey = `${opts.provider}:${opts.cacheId ?? url}`
  if (ttl > 0) {
    const hit = await db.apiCache.get(cacheKey).catch(() => undefined)
    if (hit && hit.expires > Date.now()) return hit.value as T
  }
  const retries = opts.retries ?? 2
  let attempt = 0
  let lastErr: unknown
  while (attempt <= retries) {
    try {
      const data = await schedule(opts.provider, opts.minIntervalMs ?? 1000, () => rawFetch(url, opts))
      record(opts.provider, true)
      if (ttl > 0) await db.apiCache.put({ key: cacheKey, value: data, expires: Date.now() + ttl }).catch(() => undefined)
      return data as T
    } catch (e) {
      lastErr = e
      if (opts.signal?.aborted) throw e
      const status = e instanceof HttpError ? e.status : 0
      const retriable = status === 0 || status === 429 || status >= 500
      if (!retriable || attempt === retries) break
      const ra = (e as { retryAfter?: number }).retryAfter
      await sleep(ra ? ra * 1000 : 800 * 2 ** attempt)
      attempt++
    }
  }
  record(opts.provider, false, lastErr instanceof Error ? lastErr.message : String(lastErr))
  if (ttl > 0) {
    const stale = await db.apiCache.get(cacheKey).catch(() => undefined)
    if (stale) return stale.value as T
  }
  throw lastErr
}
