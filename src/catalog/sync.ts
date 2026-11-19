import { create } from 'zustand'
import { db, getMeta, setMeta } from '../lib/db'
import { providerContext } from '../lib/providerCtx'
import { dedupeKey, norm } from '../lib/util'
import { providers as allProviders } from '../providers/registry'
import type { MusicProvider } from '../providers/types'
import type { Availability, Release } from '../types'
import { useSettings } from '../store/settings'

export const INTERVALS = { new: 6 * 3600_000, trending: 12 * 3600_000, maintenance: 24 * 3600_000 }
const FIRST_RUN_DAYS = 14
const MAX_PAGES = 3
const KEEP_DAYS = 60
/** YouTube API data is refreshed or removed within 30 days. */
const KEEP_DAYS_YOUTUBE = 30

export interface SyncReport {
  at: number
  added: number
  updated: number
  providers: Record<string, { ok: boolean; added: number; error?: string; skipped?: boolean }>
}

interface SyncStore {
  running: boolean
  last?: SyncReport
  set: (p: Partial<SyncStore>) => void
}
export const useSync = create<SyncStore>((set) => ({ running: false, set: (p) => set(p) }))

const rank: Record<Availability, number> = { full: 5, preview: 4, local: 4, external: 2, metadata: 1 }

/** Merge two records of the same release (possibly from different providers), keeping the best playable source. */
export function mergeRelease(existing: Release | undefined, incoming: Release): Release {
  if (!existing) return incoming
  const better = rank[incoming.availability] > rank[existing.availability] ? incoming : existing
  const other = better === incoming ? existing : incoming
  const tags = [...new Set([...(better.tags ?? []), ...(other.tags ?? [])])]
  return {
    ...other, ...better,
    // an authoritative original date from either source beats none; prefer the more precise (longer) one
    releaseDate: [better.releaseDate, other.releaseDate].filter(Boolean).sort((a, b) => (b!.length - a!.length))[0],
    genre: better.genre ?? other.genre,
    tags: tags.length ? tags : undefined,
    artworkUrl: better.artworkUrl ?? other.artworkUrl,
    artistMbid: better.artistMbid ?? other.artistMbid,
    listenCount: Math.max(better.listenCount ?? 0, other.listenCount ?? 0) || undefined,
    trending: existing.trending || incoming.trending || undefined,
    independent: better.independent ?? other.independent,
    // bookkeeping always comes from the earliest sighting
    discoveredAt: Math.min(existing.discoveredAt, incoming.discoveredAt),
    catalogAddedAt: Math.min(existing.catalogAddedAt, incoming.catalogAddedAt),
    lastSeenAt: Math.max(existing.lastSeenAt, incoming.lastSeenAt),
  }
}

/** Write releases into the catalogue with duplicate detection (same id, or same artist+title from another provider). */
export async function mergeIntoCatalog(items: Release[]): Promise<{ added: number; updated: number; newItems: Release[] }> {
  let added = 0, updated = 0
  const newItems: Release[] = []
  await db.transaction('rw', db.catalog, async () => {
    for (const raw of items) {
      if (!raw.title || !raw.artist) continue
      const dkey = dedupeKey(raw.artist, raw.title)
      const incoming = { ...raw, dkey }
      let existing = await db.catalog.get(incoming.id)
      let sibling: Release | undefined
      if (!existing) {
        sibling = await db.catalog.where('dkey').equals(dkey).first()
        existing = sibling
      }
      const merged = mergeRelease(existing, incoming)
      if (sibling && sibling.id !== merged.id) await db.catalog.delete(sibling.id)
      await db.catalog.put(merged)
      if (existing) updated++; else { added++; newItems.push(merged) }
    }
  })
  return { added, updated, newItems }
}

export async function maintenance(now = Date.now()) {
  const cutoff = now - KEEP_DAYS * 86400_000
  const follows = new Set((await db.follows.toArray()).map((f) => norm(f.name)))
  const old = await db.catalog.where('lastSeenAt').below(cutoff).toArray()
  await db.catalog.bulkDelete(old.filter((r) => !follows.has(norm(r.artist))).map((r) => r.id))
  const ytCutoff = now - KEEP_DAYS_YOUTUBE * 86400_000
  const ytOld = await db.catalog.where('lastSeenAt').below(ytCutoff).filter((r) => r.source === 'youtube').primaryKeys()
  await db.catalog.bulkDelete(ytOld)
  await db.apiCache.where('expires').below(now).delete()
  await setMeta('sync:maintenance', now)
}

export interface SyncOptions {
  force?: boolean
  providers?: MusicProvider[]
  now?: number
  signal?: AbortSignal
}

/**
 * Incremental catalogue sync. Each provider is independent (one failing never blocks the rest) and has its
 * own "last synced" timestamp, so the look-back window shrinks to what's actually needed.
 * New releases every 6 h, trending every 12 h, maintenance daily — all only while the app is open.
 */
export async function syncCatalog(opts: SyncOptions = {}): Promise<SyncReport> {
  const now = opts.now ?? Date.now()
  const st = useSettings.getState()
  const ctx = providerContext(opts.signal)
  const list = (opts.providers ?? allProviders).filter((p) => st.providers[p.id] !== false && p.isConfigured(ctx.settings))
  const report: SyncReport = { at: now, added: 0, updated: 0, providers: {} }
  useSync.getState().set({ running: true })
  const newlyFound: Release[] = []
  try {
    for (const p of list) {
      const r: SyncReport['providers'][string] = (report.providers[p.id] = { ok: true, added: 0 })
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { r.ok = false; r.error = 'Offline'; continue }
      try {
        if (p.newReleases) {
          const last = await getMeta<number>(`sync:new:${p.id}`)
          if (opts.force || !last || now - last >= INTERVALS.new) {
            const sinceDays = !last ? FIRST_RUN_DAYS : Math.min(30, Math.max(2, Math.ceil((now - last) / 86400_000) + 1))
            let page = 1
            for (;;) {
              const { items, hasMore } = await p.newReleases(ctx, { sinceDays, page })
              const m = await mergeIntoCatalog(items)
              report.added += m.added; report.updated += m.updated; r.added += m.added; newlyFound.push(...m.newItems)
              if (!hasMore || page >= MAX_PAGES) break
              page++
            }
            await setMeta(`sync:new:${p.id}`, now)
          } else r.skipped = true
        }
        if (p.trending) {
          const last = await getMeta<number>(`sync:trending:${p.id}`)
          if (opts.force || !last || now - last >= INTERVALS.trending) {
            const items = await p.trending(ctx)
            // Clear stale trending flags for this provider, then set the fresh ones.
            await db.catalog.where('source').equals(p.id).modify((x) => { delete x.trending })
            const m = await mergeIntoCatalog(items.map((x) => ({ ...x, trending: true })))
            report.added += m.added; report.updated += m.updated; r.added += m.added
            await setMeta(`sync:trending:${p.id}`, now)
          } else r.skipped = true
        }
      } catch (e) {
        r.ok = false
        r.error = e instanceof Error ? e.message : String(e)
      }
    }
    const lastMaint = await getMeta<number>('sync:maintenance')
    if (opts.force || !lastMaint || now - lastMaint >= INTERVALS.maintenance) await maintenance(now)
    await setMeta('sync:last', now)
    await notifyFollowed(newlyFound)
  } finally {
    useSync.getState().set({ running: false, last: report })
  }
  return report
}

async function notifyFollowed(items: Release[]) {
  const st = useSettings.getState()
  if (!st.notifications || typeof Notification === 'undefined' || Notification.permission !== 'granted' || !items.length) return
  const follows = new Set((await db.follows.toArray()).map((f) => norm(f.name)))
  const hits = items.filter((r) => follows.has(norm(r.artist)))
  if (!hits.length) return
  const names = [...new Set(hits.map((h) => h.artist))].slice(0, 3).join(', ')
  try { new Notification('New music from artists you follow', { body: `${hits.length} new release${hits.length > 1 ? 's' : ''} — ${names}`, icon: 'icons/icon-192.png' }) } catch { /* not allowed in this context */ }
}

export async function lastSyncAt(): Promise<number | undefined> { return getMeta<number>('sync:last') }

/** Run on app start and whenever the app becomes visible/online; the per-provider timestamps keep this cheap. */
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = () => { if (useSettings.getState().autoSync && !useSync.getState().running && navigator.onLine) void syncCatalog().catch(() => undefined) }
  const first = setTimeout(run, 1500)
  const iv = setInterval(run, 20 * 60_000)
  const vis = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); timer = setTimeout(run, 1000) } }
  document.addEventListener('visibilitychange', vis)
  window.addEventListener('online', run)
  return () => { clearTimeout(first); clearInterval(iv); clearTimeout(timer); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', run) }
}
