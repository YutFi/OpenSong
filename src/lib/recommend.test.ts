import { describe, expect, it } from 'vitest'
import { becauseYouListenTo, buildAffinity, discoverNewArtists, favouriteGenres, musicMix, recommendForYou, similarArtists, type Candidate } from './recommend'
import type { FavouriteTrack, HistoryEntry, Release, Track } from '../types'

const NOW = Date.UTC(2026, 10, 19)
const hist = (artist: string, genre: string, n: number, over: Partial<HistoryEntry> = {}): HistoryEntry[] =>
  Array.from({ length: n }, (_, i) => ({ trackId: `${artist}${i}`, title: `T${i}`, artist, genre, source: 'jamendo', startedAt: NOW - 86400_000 * (i % 3), listened: 200, duration: 200, counted: true, skipped: false, ...over }))

const rel = (id: string, artist: string, genre: string, over: Partial<Release> = {}): Release => ({
  id, kind: 'single', title: `Title ${id}`, artist, genre, tags: [genre], source: 'jamendo', sourceId: id, availability: 'full', releaseDate: '2026-11-15',
  discoveredAt: NOW, catalogAddedAt: NOW, lastSeenAt: NOW, ...over,
})
const cand = (r: Release): Candidate => ({ release: r })

describe('recommendations', () => {
  const aff = buildAffinity([...hist('Rocker', 'Rock', 10), ...hist('Jazzer', 'Jazz', 2)], [], [], NOW)

  it('scores favourite artists higher than strangers', () => {
    const recs = recommendForYou([cand(rel('1', 'Rocker', 'Rock')), cand(rel('2', 'Nobody', 'Polka')), cand(rel('3', 'Other', 'Rock'))], aff, 10, NOW)
    expect(recs[0].release!.id).toBe('1')
    expect(recs.find((r) => r.release!.id === '2')).toBeUndefined() // nothing in common → not recommended
    expect(recs.find((r) => r.release!.id === '3')).toBeDefined() // shares a favourite genre
  })
  it('always explains itself', () => {
    const recs = recommendForYou([cand(rel('1', 'Rocker', 'Rock'))], aff, 10, NOW)
    expect(recs[0].reasons.length).toBeGreaterThan(0)
    expect(recs[0].reasons.join(' ')).toMatch(/Rocker/)
  })
  it('never recommends artists the user keeps skipping', () => {
    const skippy = buildAffinity(hist('Annoying', 'Rock', 8, { counted: false, skipped: true, listened: 5 }), [], [], NOW)
    expect(recommendForYou([cand(rel('1', 'Annoying', 'Rock'))], skippy, 10, NOW)).toHaveLength(0)
  })
  it('lets old listening fade (30-day half-life)', () => {
    const old = buildAffinity(hist('Ancient', 'Rock', 5, { startedAt: NOW - 400 * 86400_000 }), [], [], NOW)
    const fresh = buildAffinity(hist('Fresh', 'Rock', 5), [], [], NOW)
    expect(old.artists.get('ancient')!).toBeLessThan(0.001)
    expect(fresh.artists.get('fresh')!).toBeGreaterThan(2)
  })
  it('counts favourites and follows', () => {
    const fav: FavouriteTrack[] = [{ id: 'x', addedAt: 0, track: { id: 'x', title: 'X', artist: 'Loved', genre: 'Folk', source: 'local', availability: 'local' } as Track }]
    const a = buildAffinity([], fav, ['Followed'], NOW)
    expect(a.artists.get('loved')).toBe(3)
    expect(a.artists.get('followed')).toBe(4)
    expect(a.genres.get('folk')).toBe(2)
  })
  it('suggests similar-genre music from other artists', () => {
    const cands = [cand(rel('1', 'Rocker', 'Rock')), cand(rel('2', 'NewBand', 'Rock')), cand(rel('3', 'AnotherBand', 'Rock')), cand(rel('4', 'DJ', 'Techno'))]
    const r = becauseYouListenTo(cands, aff)
    expect(r?.artist).toBe('Rocker')
    expect(r!.items.map((i) => i.release!.artist).sort()).toEqual(['AnotherBand', 'NewBand'])
  })
  it('finds similar artists by shared tags', () => {
    const cands = [cand(rel('1', 'A', 'Rock', { tags: ['rock', 'indie'] })), cand(rel('2', 'B', 'Rock', { tags: ['rock', 'indie'] })), cand(rel('3', 'C', 'Techno', { tags: ['techno'] }))]
    const s = similarArtists('A', cands)
    expect(s.map((x) => x.name)).toEqual(['B'])
    expect(similarArtists('Unknown', cands)).toEqual([])
  })
  it('discovers artists never played, preferring liked genres', () => {
    const d = discoverNewArtists([cand(rel('1', 'Rocker', 'Rock')), cand(rel('2', 'Fresh1', 'Rock')), cand(rel('3', 'Fresh2', 'Polka'))], aff)
    expect(d.map((x) => x.release!.artist)).toEqual(['Fresh1', 'Fresh2'])
    expect(d[0].reasons[0]).toMatch(/rock/)
  })
  it('builds a varied mix and lists favourite genres', () => {
    const tracks: Track[] = [...'abcdef'].map((c, i) => ({ id: c, title: c, artist: i < 5 ? 'Rocker' : 'Jazzer', genre: i < 5 ? 'Rock' : 'Jazz', source: 'local', availability: 'local' }))
    const mix = musicMix(tracks, aff)
    expect(mix.filter((t) => t.artist === 'Rocker').length).toBeLessThanOrEqual(3)
    expect(favouriteGenres(aff)[0].genre).toBe('rock')
  })
})
