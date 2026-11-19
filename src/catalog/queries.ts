import { db } from '../lib/db'
import { parseDate } from '../lib/util'
import type { Release, ReleaseKind } from '../types'

export type Window = 'all' | 'today' | 'week' | 'month'
export interface ReleaseFilter {
  window: Window
  kind?: ReleaseKind | 'all'
  genre?: string
  country?: string
  independentOnly?: boolean
  followedOnly?: string[]
  playableOnly?: boolean
  source?: string
}

const DAY = 86400_000
const startOfToday = (now: number) => { const d = new Date(now); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) }

/** Never invents dates: releases without a date can't match a date window, and partial dates only match coarse windows. */
export function matchesWindow(r: Release, w: Window, now = Date.now()): boolean {
  if (w === 'all') return true
  const full = r.releaseDate && /^\d{4}-\d{2}-\d{2}/.test(r.releaseDate)
  const t = parseDate(r.releaseDate)
  if (t == null) return false
  const today = startOfToday(now)
  if (t > today) return false // upcoming releases are not "new" yet
  if (w === 'today') return !!full && t === today
  if (w === 'week') return !!full && t >= today - 6 * DAY
  const d = new Date(now)
  return t >= Date.UTC(d.getFullYear(), d.getMonth(), 1) || (t >= today - 29 * DAY && !!full)
}

export function applyFilter(rows: Release[], f: ReleaseFilter, now = Date.now()): Release[] {
  const follows = f.followedOnly ? new Set(f.followedOnly.map((x) => x.toLowerCase())) : undefined
  return rows
    .filter((r) => matchesWindow(r, f.window, now))
    .filter((r) => !f.kind || f.kind === 'all' || r.kind === f.kind)
    .filter((r) => !f.genre || [r.genre, ...(r.tags ?? [])].some((g) => g?.toLowerCase() === f.genre!.toLowerCase()))
    .filter((r) => !f.country || r.country === f.country)
    .filter((r) => !f.independentOnly || r.independent === true)
    .filter((r) => !follows || follows.has(r.artist.toLowerCase()))
    .filter((r) => !f.playableOnly || r.availability === 'full' || r.availability === 'preview')
    .filter((r) => !f.source || r.source === f.source)
    .sort(byRecent)
}

/** Newest original release date first; undated items fall back to when the source added them, then to discovery time. */
export function byRecent(a: Release, b: Release): number {
  const ta = parseDate(a.releaseDate), tb = parseDate(b.releaseDate)
  if (ta != null && tb != null) return tb - ta
  if (ta != null) return -1
  if (tb != null) return 1
  const sa = a.sourceAddedAt ? Date.parse(a.sourceAddedAt) : a.discoveredAt
  const sb = b.sourceAddedAt ? Date.parse(b.sourceAddedAt) : b.discoveredAt
  return sb - sa
}

export const allReleases = () => db.catalog.toArray()
export async function trendingReleases(limit = 40): Promise<Release[]> {
  const rows = (await db.catalog.toArray()).filter((r) => r.trending)
  return rows.sort((a, b) => (b.listenCount ?? 0) - (a.listenCount ?? 0)).slice(0, limit)
}
