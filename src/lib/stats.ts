import type { HistoryEntry } from '../types'
import { norm } from './util'

export type RangeKind = 'week' | 'month' | 'year' | 'all'
export interface Range { from: number; to: number; kind: RangeKind; label: string }

const DAY = 86400_000

/** Calendar range containing `ref` (local time). Weeks start on Monday. */
export function rangeFor(kind: RangeKind, ref = Date.now(), offset = 0): Range {
  const d = new Date(ref)
  if (kind === 'all') return { from: 0, to: Number.MAX_SAFE_INTEGER, kind, label: 'All time' }
  if (kind === 'week') {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + offset * 7)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    return { from: start.getTime(), to: end.getTime(), kind, label: `Week of ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` }
  }
  if (kind === 'month') {
    const start = new Date(d.getFullYear(), d.getMonth() + offset, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    return { from: start.getTime(), to: end.getTime(), kind, label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }
  }
  const start = new Date(d.getFullYear() + offset, 0, 1)
  return { from: start.getTime(), to: new Date(start.getFullYear() + 1, 0, 1).getTime(), kind, label: String(start.getFullYear()) }
}

export interface Ranked { key: string; title: string; artist?: string; plays: number; seconds: number }
export interface Bucket { label: string; start: number; seconds: number; plays: number }

export interface Summary {
  range: Range
  totalSeconds: number
  plays: number
  uniqueTracks: number
  uniqueArtists: number
  topSongs: Ranked[]
  topArtists: Ranked[]
  topAlbums: Ranked[]
  topGenres: Ranked[]
  hourly: number[]
  avgPlaySeconds: number
  sessions: number
  avgSessionSeconds: number
  newArtists: string[]
  replays: Ranked[]
  skipRate: number
  personality: { name: string; why: string }
}

function rank(map: Map<string, Ranked>, n = 10): Ranked[] {
  return [...map.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds).slice(0, n)
}

function bump(map: Map<string, Ranked>, key: string, title: string, artist: string | undefined, e: HistoryEntry) {
  const r = map.get(key) ?? { key, title, artist, plays: 0, seconds: 0 }
  if (e.counted) r.plays++
  r.seconds += e.listened
  map.set(key, r)
}

export function inRange(rows: HistoryEntry[], r: Range) { return rows.filter((e) => e.startedAt >= r.from && e.startedAt < r.to) }

/** Group entries into listening sessions: a new session starts after a 30-minute silence. */
export function sessionLengths(rows: HistoryEntry[], gapMs = 30 * 60_000): number[] {
  const sorted = [...rows].sort((a, b) => a.startedAt - b.startedAt)
  const out: number[] = []
  let cur = 0
  let lastEnd = -Infinity
  for (const e of sorted) {
    if (e.startedAt - lastEnd > gapMs && cur > 0) { out.push(cur); cur = 0 }
    cur += e.listened
    lastEnd = e.startedAt + e.listened * 1000
  }
  if (cur > 0) out.push(cur)
  return out
}

export function summarize(all: HistoryEntry[], range: Range): Summary {
  const rows = inRange(all, range)
  const songs = new Map<string, Ranked>(), artists = new Map<string, Ranked>(), albums = new Map<string, Ranked>(), genres = new Map<string, Ranked>()
  const hourly = new Array<number>(24).fill(0)
  let total = 0, plays = 0, skips = 0
  for (const e of rows) {
    total += e.listened
    if (e.counted) plays++
    if (e.skipped) skips++
    bump(songs, e.trackId, e.title, e.artist, e)
    bump(artists, norm(e.artist), e.artist, undefined, e)
    if (e.album) bump(albums, `${norm(e.artist)}|${norm(e.album)}`, e.album, e.artist, e)
    if (e.genre) bump(genres, norm(e.genre), e.genre, undefined, e)
    hourly[new Date(e.startedAt).getHours()] += e.listened
  }
  const firstSeen = new Map<string, number>()
  for (const e of all) { const k = norm(e.artist); if (e.startedAt < (firstSeen.get(k) ?? Infinity)) firstSeen.set(k, e.startedAt) }
  const nameOf = new Map(rows.map((e) => [norm(e.artist), e.artist]))
  const newArtists = [...artists.keys()].filter((k) => (firstSeen.get(k) ?? 0) >= range.from).map((k) => nameOf.get(k) ?? k)
  const replays = [...songs.values()].filter((s) => s.plays >= 3).sort((a, b) => b.plays - a.plays)
  const sessions = sessionLengths(rows)
  const avgSession = sessions.length ? sessions.reduce((a, b) => a + b, 0) / sessions.length : 0

  const s: Summary = {
    range, totalSeconds: total, plays, uniqueTracks: songs.size, uniqueArtists: artists.size,
    topSongs: rank(songs), topArtists: rank(artists), topAlbums: rank(albums), topGenres: rank(genres),
    hourly, avgPlaySeconds: rows.length ? total / rows.length : 0, sessions: sessions.length, avgSessionSeconds: avgSession,
    newArtists, replays: replays.slice(0, 10), skipRate: rows.length ? skips / rows.length : 0,
    personality: { name: '', why: '' },
  }
  s.personality = personality(s)
  return s
}

/** Fully transparent, rule-based "music personality". The reason is always shown with the label. */
export function personality(s: Summary): { name: string; why: string } {
  if (s.totalSeconds < 600) return { name: 'Just Getting Started', why: 'Listen for a little longer and your personality will appear.' }
  const topShare = s.plays ? (s.topArtists[0]?.plays ?? 0) / s.plays : 0
  const night = (s.hourly.slice(22).reduce((a, b) => a + b, 0) + s.hourly.slice(0, 5).reduce((a, b) => a + b, 0)) / s.totalSeconds
  const morning = s.hourly.slice(5, 11).reduce((a, b) => a + b, 0) / s.totalSeconds
  const replayShare = s.plays ? s.replays.reduce((a, r) => a + r.plays, 0) / s.plays : 0
  const genreCount = s.topGenres.filter((g) => g.seconds / s.totalSeconds >= 0.05).length
  if (s.uniqueArtists >= 8 && s.newArtists.length / s.uniqueArtists >= 0.6) return { name: 'The Explorer', why: `${s.newArtists.length} of your ${s.uniqueArtists} artists were new to you.` }
  if (topShare >= 0.35) return { name: 'The Loyalist', why: `${Math.round(topShare * 100)}% of your plays were ${s.topArtists[0].title}.` }
  if (replayShare >= 0.4) return { name: 'The Replayer', why: `${Math.round(replayShare * 100)}% of your plays were songs you played 3+ times.` }
  if (night >= 0.45) return { name: 'The Night Owl', why: `${Math.round(night * 100)}% of your listening happened between 10 pm and 5 am.` }
  if (morning >= 0.45) return { name: 'The Early Bird', why: `${Math.round(morning * 100)}% of your listening happened between 5 am and 11 am.` }
  if (s.avgSessionSeconds >= 3600) return { name: 'The Marathoner', why: `Your average listening session lasted ${Math.round(s.avgSessionSeconds / 60)} minutes.` }
  if (genreCount >= 6) return { name: 'The Genre Hopper', why: `${genreCount} genres each made up 5%+ of your listening.` }
  return { name: 'The Balanced Listener', why: 'No single habit dominates your listening — you mix it up.' }
}

/** Time series for the line chart. Day buckets for week/month, month buckets for year/all. */
export function series(all: HistoryEntry[], range: Range, firstTs?: number): Bucket[] {
  const rows = inRange(all, range)
  const buckets: Bucket[] = []
  const byDay = range.kind === 'week' || range.kind === 'month'
  let start = range.kind === 'all' ? new Date(firstTs ?? rows.reduce((m, e) => Math.min(m, e.startedAt), Date.now())) : new Date(range.from)
  const end = range.kind === 'all' ? Date.now() + DAY : range.to
  if (!byDay) start = new Date(start.getFullYear(), range.kind === 'year' ? 0 : start.getMonth(), 1)
  const cursor = new Date(start)
  while (cursor.getTime() < end) {
    const s = cursor.getTime()
    const next = byDay ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1) : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    buckets.push({ label: byDay ? cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : cursor.toLocaleDateString(undefined, { month: 'short', year: range.kind === 'all' ? '2-digit' : undefined }), start: s, seconds: 0, plays: 0 })
    cursor.setTime(next.getTime())
    if (buckets.length > 800) break
  }
  for (const e of rows) {
    // binary-free linear lookup is fine: bucket count is small
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (e.startedAt >= buckets[i].start) { buckets[i].seconds += e.listened; if (e.counted) buckets[i].plays++; break }
    }
  }
  return buckets
}

/** Hours listened per calendar month of `year`, used for the monthly comparison chart and the "busiest month". */
export function monthlyTotals(all: HistoryEntry[], year: number): Bucket[] {
  return Array.from({ length: 12 }, (_, m) => {
    const from = new Date(year, m, 1).getTime(), to = new Date(year, m + 1, 1).getTime()
    const rows = all.filter((e) => e.startedAt >= from && e.startedAt < to)
    return { label: new Date(year, m, 1).toLocaleDateString(undefined, { month: 'short' }), start: from, seconds: rows.reduce((a, e) => a + e.listened, 0), plays: rows.filter((e) => e.counted).length }
  })
}

export function busiestMonth(all: HistoryEntry[], year: number): Bucket | undefined {
  const m = monthlyTotals(all, year)
  const best = m.reduce((a, b) => (b.seconds > a.seconds ? b : a), m[0])
  return best.seconds > 0 ? best : undefined
}

export function toCSV(rows: HistoryEntry[]): string {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const head = ['started_at', 'title', 'artist', 'album', 'genre', 'source', 'listened_seconds', 'duration_seconds', 'counted_as_play', 'skipped']
  return [head.join(','), ...rows.map((e) => [new Date(e.startedAt).toISOString(), e.title, e.artist, e.album, e.genre, e.source, e.listened, e.duration, e.counted, e.skipped].map(esc).join(','))].join('\n')
}
