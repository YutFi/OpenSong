import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { applyFilter, byRecent, matchesWindow } from './queries'
import { INTERVALS, maintenance, mergeIntoCatalog, mergeRelease, syncCatalog, useSync } from './sync'
import type { MusicProvider } from '../providers/types'
import type { Release } from '../types'

const NOW = Date.UTC(2026, 10, 19, 12)
const rel = (id: string, over: Partial<Release> = {}): Release => ({
  id, kind: 'single', title: `T-${id}`, artist: `Artist ${id}`, source: 'x', sourceId: id, availability: 'metadata',
  discoveredAt: NOW, catalogAddedAt: NOW, lastSeenAt: NOW, ...over,
})

function fakeProvider(id: string, pages: Release[][], over: Partial<MusicProvider> = {}): MusicProvider & { calls: { sinceDays: number; page: number }[] } {
  const calls: { sinceDays: number; page: number }[] = []
  return {
    id, name: id, description: '', homepage: '', termsUrl: '', dataLicense: '', playback: '', rateLimit: '', hosts: [], isConfigured: () => true,
    calls,
    newReleases: async (_ctx, o) => { calls.push(o); return { items: pages[o.page - 1] ?? [], hasMore: o.page < pages.length } },
    ...over,
  }
}

beforeEach(async () => {
  await db.delete(); await db.open()
  useSync.getState().set({ running: false, last: undefined })
})

describe('release date windows', () => {
  it('never matches releases without a date and never treats the future as new', () => {
    expect(matchesWindow(rel('a'), 'week', NOW)).toBe(false)
    expect(matchesWindow(rel('a', { releaseDate: '2026-11-25' }), 'week', NOW)).toBe(false)
    expect(matchesWindow(rel('a'), 'all', NOW)).toBe(true)
  })
  it('today / week / month', () => {
    expect(matchesWindow(rel('a', { releaseDate: '2026-11-19' }), 'today', NOW)).toBe(true)
    expect(matchesWindow(rel('a', { releaseDate: '2026-11-18' }), 'today', NOW)).toBe(false)
    expect(matchesWindow(rel('a', { releaseDate: '2026-11-13' }), 'week', NOW)).toBe(true)
    expect(matchesWindow(rel('a', { releaseDate: '2026-11-12' }), 'week', NOW)).toBe(false)
    expect(matchesWindow(rel('a', { releaseDate: '2026-11-01' }), 'month', NOW)).toBe(true)
    expect(matchesWindow(rel('a', { releaseDate: '2026-11' }), 'month', NOW)).toBe(true)
    expect(matchesWindow(rel('a', { releaseDate: '2026' }), 'week', NOW)).toBe(false) // year-only can't be "this week"
  })
  it('filters by kind, genre, independence, followed artists, playability', () => {
    const rows = [
      rel('1', { releaseDate: '2026-11-18', kind: 'album', genre: 'Rock', independent: true, availability: 'full' }),
      rel('2', { releaseDate: '2026-11-17', kind: 'single', tags: ['rock'] }),
      rel('3', { releaseDate: '2026-11-16', kind: 'ep', genre: 'Jazz' }),
    ]
    expect(applyFilter(rows, { window: 'week', kind: 'album' }, NOW).map((r) => r.id)).toEqual(['1'])
    expect(applyFilter(rows, { window: 'all', genre: 'rock' }, NOW).map((r) => r.id)).toEqual(['1', '2'])
    expect(applyFilter(rows, { window: 'all', independentOnly: true }, NOW).map((r) => r.id)).toEqual(['1'])
    expect(applyFilter(rows, { window: 'all', followedOnly: ['artist 3'] }, NOW).map((r) => r.id)).toEqual(['3'])
    expect(applyFilter(rows, { window: 'all', playableOnly: true }, NOW).map((r) => r.id)).toEqual(['1'])
  })
  it('sorts newest first, dated before undated', () => {
    const a = rel('a', { releaseDate: '2026-11-10' }), b = rel('b', { releaseDate: '2026-11-15' }), c = rel('c', { sourceAddedAt: '2026-11-18T00:00:00Z' })
    expect([a, c, b].sort(byRecent).map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('catalogue merge & duplicate detection', () => {
  it('keeps the playable copy when two providers report the same release', () => {
    const meta = rel('lb:1', { artist: 'The Band', title: 'Song', availability: 'metadata', releaseDate: '2026-11-10', source: 'listenbrainz', tags: ['rock'] })
    const full = rel('jam:9', { artist: 'the band', title: 'Song!', availability: 'full', source: 'jamendo', tags: ['indie'], tracks: [] })
    const m = mergeRelease(meta, full)
    expect(m.id).toBe('jam:9')
    expect(m.availability).toBe('full')
    expect(m.releaseDate).toBe('2026-11-10') // original date from the other source is kept
    expect(m.tags).toEqual(expect.arrayContaining(['rock', 'indie']))
  })
  it('detects duplicates across providers inside the database', async () => {
    await mergeIntoCatalog([rel('lb:1', { artist: 'Band', title: 'Hit', source: 'lb' })])
    const r = await mergeIntoCatalog([rel('jam:1', { artist: 'BAND', title: 'hit', availability: 'full', source: 'jamendo' })])
    expect(r.added).toBe(0); expect(r.updated).toBe(1)
    const rows = await db.catalog.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('jam:1')
  })
  it('preserves the first-discovered timestamp on re-sync', async () => {
    await mergeIntoCatalog([rel('1', { discoveredAt: 1000, catalogAddedAt: 1000, lastSeenAt: 1000 })])
    await mergeIntoCatalog([rel('1', { discoveredAt: 9000, catalogAddedAt: 9000, lastSeenAt: 9000 })])
    const r = (await db.catalog.get('1'))!
    expect([r.discoveredAt, r.catalogAddedAt, r.lastSeenAt]).toEqual([1000, 1000, 9000])
  })
  it('does not duplicate the same release id', async () => {
    await mergeIntoCatalog([rel('1'), rel('1'), rel('2')])
    expect(await db.catalog.count()).toBe(2)
  })
})

describe('catalogue sync', () => {
  it('paginates and stores everything', async () => {
    const p = fakeProvider('p', [[rel('1'), rel('2')], [rel('3')]])
    const rep = await syncCatalog({ providers: [p], now: NOW, force: true })
    expect(rep.added).toBe(3)
    expect(p.calls.map((c) => c.page)).toEqual([1, 2])
    expect(await db.catalog.count()).toBe(3)
  })
  it('caps pages per run (rate-limit friendly)', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => [rel(`r${i}`)])
    const p = fakeProvider('p', pages)
    await syncCatalog({ providers: [p], now: NOW, force: true })
    expect(p.calls).toHaveLength(3)
  })
  it('first run looks back 14 days; later runs only fetch what is needed', async () => {
    const p = fakeProvider('p', [[rel('1')]])
    await syncCatalog({ providers: [p], now: NOW })
    expect(p.calls[0].sinceDays).toBe(14)
    p.calls.length = 0
    await syncCatalog({ providers: [p], now: NOW + INTERVALS.new + 1000 })
    expect(p.calls[0].sinceDays).toBe(2)
  })
  it('does not hit providers again before the 6 hour interval', async () => {
    const p = fakeProvider('p', [[rel('1')]])
    await syncCatalog({ providers: [p], now: NOW })
    p.calls.length = 0
    const rep = await syncCatalog({ providers: [p], now: NOW + 3600_000 })
    expect(p.calls).toHaveLength(0)
    expect(rep.providers.p.skipped).toBe(true)
    await syncCatalog({ providers: [p], now: NOW + 3600_000, force: true })
    expect(p.calls).toHaveLength(1)
  })
  it('isolates a failing provider and still syncs the others', async () => {
    const bad = fakeProvider('bad', [], { newReleases: async () => { throw new Error('HTTP 503') } })
    const good = fakeProvider('good', [[rel('1')]])
    const rep = await syncCatalog({ providers: [bad, good], now: NOW, force: true })
    expect(rep.providers.bad).toMatchObject({ ok: false, error: 'HTTP 503' })
    expect(rep.providers.good).toMatchObject({ ok: true, added: 1 })
    expect(await db.catalog.count()).toBe(1)
    expect(useSync.getState().running).toBe(false)
  })
  it('a failed provider is retried next time (timestamp not advanced)', async () => {
    let fail = true
    const p = fakeProvider('p', [], { newReleases: async () => { if (fail) throw new Error('down'); return { items: [rel('1')], hasMore: false } } })
    await syncCatalog({ providers: [p], now: NOW })
    fail = false
    const rep = await syncCatalog({ providers: [p], now: NOW + 60_000 })
    expect(rep.providers.p.added).toBe(1)
  })
  it('syncs trending and clears stale trending flags', async () => {
    await db.catalog.put(rel('old', { trending: true, source: 'p' }))
    const p = fakeProvider('p', [], { newReleases: undefined, trending: async () => [rel('new', { source: 'p' })] })
    await syncCatalog({ providers: [p], now: NOW, force: true })
    expect((await db.catalog.get('old'))!.trending).toBeUndefined()
    expect((await db.catalog.get('new'))!.trending).toBe(true)
  })
  it('maintenance prunes stale items but keeps followed artists', async () => {
    const old = NOW - 90 * 86400_000
    await db.catalog.bulkPut([rel('stale', { lastSeenAt: old, artist: 'Nobody' }), rel('keep', { lastSeenAt: old, artist: 'Fan Favourite' }), rel('fresh')])
    await db.follows.put({ name: 'Fan Favourite', addedAt: 1 })
    await db.apiCache.bulkPut([{ key: 'a', value: 1, expires: NOW - 1 }, { key: 'b', value: 1, expires: NOW + 1000 }])
    await maintenance(NOW)
    expect((await db.catalog.toArray()).map((r) => r.id).sort()).toEqual(['fresh', 'keep'])
    expect((await db.apiCache.toArray()).map((r) => r.key)).toEqual(['b'])
  })
  it('skips unconfigured providers', async () => {
    const p = fakeProvider('p', [[rel('1')]], { isConfigured: () => false })
    const rep = await syncCatalog({ providers: [p], now: NOW, force: true })
    expect(rep.providers.p).toBeUndefined()
    expect(p.calls).toHaveLength(0)
  })
})

describe('http layer', () => {
  it('retries on 503, then succeeds, and caches', async () => {
    const { fetchJson, health } = await import('../lib/http')
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const v = await fetchJson('https://x.test/a', { provider: 'ret', minIntervalMs: 0, retries: 2, cacheTtl: 60_000 })
    expect(v).toEqual({ ok: 1 })
    expect(f).toHaveBeenCalledTimes(2)
    const again = await fetchJson('https://x.test/a', { provider: 'ret', minIntervalMs: 0, cacheTtl: 60_000 })
    expect(again).toEqual({ ok: 1 })
    expect(f).toHaveBeenCalledTimes(2) // served from cache
    expect(health.get('ret')!.ok).toBe(true)
    vi.unstubAllGlobals()
  }, 15000)
  it('does not retry client errors and records the failure', async () => {
    const { fetchJson, health } = await import('../lib/http')
    const f = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    vi.stubGlobal('fetch', f)
    await expect(fetchJson('https://x.test/missing', { provider: 'nf', minIntervalMs: 0 })).rejects.toThrow('HTTP 404')
    expect(f).toHaveBeenCalledTimes(1)
    expect(health.get('nf')).toMatchObject({ ok: false, lastError: 'HTTP 404' })
    vi.unstubAllGlobals()
  })
  it('falls back to stale cache when the network is down', async () => {
    const { fetchJson } = await import('../lib/http')
    await db.apiCache.put({ key: 'stale:https://x.test/s', value: { cached: true }, expires: 1 })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const v = await fetchJson('https://x.test/s', { provider: 'stale', minIntervalMs: 0, retries: 0, cacheTtl: 60_000 })
    expect(v).toEqual({ cached: true })
    vi.unstubAllGlobals()
  })
  it('does not send credentials', async () => {
    const { fetchJson } = await import('../lib/http')
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    await fetchJson('https://x.test/c', { provider: 'cred', minIntervalMs: 0 })
    expect(f.mock.calls[0][1]).toMatchObject({ credentials: 'omit' })
    vi.unstubAllGlobals()
  })
})
