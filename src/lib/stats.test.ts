import { describe, expect, it } from 'vitest'
import { busiestMonth, monthlyTotals, personality, rangeFor, series, sessionLengths, summarize, toCSV } from './stats'
import type { HistoryEntry } from '../types'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
const e = (over: Partial<HistoryEntry>): HistoryEntry => ({ trackId: 't1', title: 'Song', artist: 'Artist', source: 'jamendo', startedAt: at(2026, 11, 10), listened: 200, duration: 200, counted: true, skipped: false, ...over })

describe('listening statistics', () => {
  const rows: HistoryEntry[] = [
    e({ trackId: 'a', title: 'A', artist: 'Alpha', album: 'LP', genre: 'Rock', startedAt: at(2026, 11, 2), listened: 180, duration: 180 }),
    e({ trackId: 'a', title: 'A', artist: 'Alpha', album: 'LP', genre: 'Rock', startedAt: at(2026, 11, 3), listened: 180, duration: 180 }),
    e({ trackId: 'a', title: 'A', artist: 'Alpha', album: 'LP', genre: 'Rock', startedAt: at(2026, 11, 4), listened: 180, duration: 180 }),
    e({ trackId: 'b', title: 'B', artist: 'Beta', genre: 'Jazz', startedAt: at(2026, 11, 5), listened: 240, duration: 240 }),
    e({ trackId: 'c', title: 'C', artist: 'Gamma', startedAt: at(2026, 11, 6), listened: 10, duration: 200, counted: false, skipped: true }),
    e({ trackId: 'old', title: 'Old', artist: 'Alpha', startedAt: at(2026, 9, 1), listened: 100, duration: 100 }),
  ]
  const nov = rangeFor('month', at(2026, 11, 15))

  it('totals time and counts plays only for counted listens', () => {
    const s = summarize(rows, nov)
    expect(s.totalSeconds).toBe(180 * 3 + 240 + 10)
    expect(s.plays).toBe(4) // the 10-second skip is not a play
    expect(s.uniqueTracks).toBe(3)
    expect(s.uniqueArtists).toBe(3)
  })
  it('ranks songs, artists, albums and genres', () => {
    const s = summarize(rows, nov)
    expect(s.topSongs[0]).toMatchObject({ title: 'A', plays: 3 })
    expect(s.topArtists[0]).toMatchObject({ title: 'Alpha', plays: 3 })
    expect(s.topAlbums[0]).toMatchObject({ title: 'LP', artist: 'Alpha' })
    expect(s.topGenres.map((g) => g.title)).toEqual(['Rock', 'Jazz'])
  })
  it('finds replays, new artists and the skip rate', () => {
    const s = summarize(rows, nov)
    expect(s.replays.map((r) => r.title)).toEqual(['A'])
    expect(s.newArtists.sort()).toEqual(['Beta', 'Gamma']) // Alpha was already played in September
    expect(s.skipRate).toBeCloseTo(1 / 5)
  })
  it('respects the selected range', () => {
    expect(summarize(rows, rangeFor('month', at(2026, 9, 15))).totalSeconds).toBe(100)
    expect(summarize(rows, rangeFor('all')).totalSeconds).toBe(180 * 3 + 240 + 10 + 100)
    expect(summarize([], nov)).toMatchObject({ totalSeconds: 0, plays: 0, topSongs: [] })
  })
  it('builds calendar ranges', () => {
    const w = rangeFor('week', at(2026, 11, 19)) // Thursday
    expect(new Date(w.from).getDay()).toBe(1) // Monday
    expect(w.to - w.from).toBeGreaterThanOrEqual(7 * 86400_000 - 3600_000)
    expect(rangeFor('year', at(2026, 6, 1)).label).toBe('2026')
    expect(rangeFor('month', at(2026, 11, 15), -1).label).toMatch(/Oct/)
  })
  it('produces day buckets for a month and month buckets for a year', () => {
    const days = series(rows, nov)
    expect(days).toHaveLength(30)
    expect(days[1].seconds).toBe(180)
    const months = monthlyTotals(rows, 2026)
    expect(months).toHaveLength(12)
    expect(months[10].seconds).toBe(180 * 3 + 240 + 10)
    expect(busiestMonth(rows, 2026)?.label).toMatch(/Nov/)
    expect(busiestMonth(rows, 2020)).toBeUndefined()
  })
  it('splits sessions on 30 minute gaps', () => {
    const r = [e({ startedAt: 0, listened: 600 }), e({ startedAt: 700_000, listened: 600 }), e({ startedAt: 10_000_000, listened: 300 })]
    expect(sessionLengths(r)).toEqual([1200, 300])
  })
  it('explains the personality it assigns', () => {
    expect(personality(summarize([], nov)).name).toBe('Just Getting Started')
    const loyal = Array.from({ length: 20 }, (_, i) => e({ trackId: `x${i % 5}`, startedAt: at(2026, 11, 1 + (i % 20), 15) }))
    const p = personality(summarize(loyal, nov))
    expect(p.name).toBe('The Loyalist')
    expect(p.why).toMatch(/100%/)
    const night = Array.from({ length: 12 }, (_, i) => e({ artist: `Art${i}`, trackId: `n${i}`, startedAt: at(2025, 1, 1 + i, 23) }))
    expect(personality(summarize(night, rangeFor('all'))).name).toBe('The Explorer')
  })
  it('exports CSV with escaping', () => {
    const csv = toCSV([e({ title: 'He said "hi", ok' })])
    expect(csv.split('\n')[0]).toContain('listened_seconds')
    expect(csv).toContain('"He said ""hi"", ok"')
  })
})
