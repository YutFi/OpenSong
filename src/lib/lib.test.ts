import { describe, expect, it } from 'vitest'
import { dedupeKey, formatDate, formatTime, norm, parseDate, safeUrl, shuffled, timeAgo } from './util'
import { indexAfterMove, isPlayable, moveItem, nextIndex, prevIndex, removeAt, restoreOrder, shuffleUpcoming } from './queueLogic'
import { parseM3U, toM3U } from './m3u'
import { sanitizePlaylist, sanitizeTrack } from './validate'
import type { Track } from '../types'

const t = (id: string, extra: Partial<Track> = {}): Track => ({ id, title: id, artist: 'A', source: 'jamendo', availability: 'full', streamUrl: 'https://x.test/a.mp3', ...extra })

describe('util', () => {
  it('formats time', () => {
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(formatTime(undefined)).toBe('–:––')
    expect(formatTime(NaN)).toBe('–:––')
  })
  it('normalises names for duplicate detection', () => {
    expect(norm('Beyoncé (Remastered)')).toBe('beyonce')
    expect(dedupeKey('The  Artist!', 'Song [Live]')).toBe(dedupeKey('the artist', 'song'))
  })
  it('only allows http(s) URLs', () => {
    expect(safeUrl('https://a.test/x')).toBe('https://a.test/x')
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('data:text/html,hi')).toBeUndefined()
    expect(safeUrl('not a url')).toBeUndefined()
    expect(safeUrl(42)).toBeUndefined()
  })
  it('parses partial dates without inventing precision', () => {
    expect(parseDate('2026-11-16')).toBe(Date.UTC(2026, 10, 16))
    expect(parseDate('2026-11')).toBe(Date.UTC(2026, 10, 1))
    expect(parseDate('2026')).toBe(Date.UTC(2026, 0, 1))
    expect(parseDate('garbage')).toBeUndefined()
    expect(parseDate(undefined)).toBeUndefined()
    expect(formatDate('2026')).toBe('2026')
    expect(formatDate(undefined)).toBe('—')
  })
  it('timeAgo', () => {
    const now = 1_000_000_000_000
    expect(timeAgo(now - 30_000, now)).toBe('just now')
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('3 h ago')
  })
  it('shuffle is a permutation', () => {
    const a = [1, 2, 3, 4, 5, 6]
    expect([...shuffled(a)].sort()).toEqual(a)
  })
})

describe('queue logic', () => {
  it('next with repeat modes', () => {
    expect(nextIndex(3, 0, 'off', true)).toBe(1)
    expect(nextIndex(3, 2, 'off', true)).toBeNull()
    expect(nextIndex(3, 2, 'all', true)).toBe(0)
    expect(nextIndex(3, 1, 'one', true)).toBe(1) // auto-advance repeats the track
    expect(nextIndex(3, 1, 'one', false)).toBe(2) // manual Next still advances
    expect(nextIndex(0, 0, 'all', false)).toBeNull()
  })
  it('previous', () => {
    expect(prevIndex(3, 1, 'off')).toBe(0)
    expect(prevIndex(3, 0, 'off')).toBeNull()
    expect(prevIndex(3, 0, 'all')).toBe(2)
  })
  it('shuffles only upcoming tracks and can restore order', () => {
    const q = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => t(x))
    const s = shuffleUpcoming(q, 1, () => 0.1)
    expect(s.slice(0, 2).map((x) => x.id)).toEqual(['a', 'b'])
    expect(s.map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    const added = [...s, t('z')]
    expect(restoreOrder(added, q.map((x) => x.id)).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'z'])
  })
  it('moves and tracks the current index', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
    expect(moveItem([1, 2, 3], 5, 0)).toEqual([1, 2, 3])
    expect(indexAfterMove(0, 0, 2)).toBe(2) // moved the playing track
    expect(indexAfterMove(1, 0, 2)).toBe(0) // item before current moved after it
    expect(indexAfterMove(1, 3, 0)).toBe(2) // item after current moved before it
    expect(indexAfterMove(1, 2, 3)).toBe(1)
  })
  it('removes items and keeps the index consistent', () => {
    const q = ['a', 'b', 'c'].map((x) => t(x))
    expect(removeAt(q, 1, 0)).toMatchObject({ index: 0, removedCurrent: false })
    expect(removeAt(q, 1, 2)).toMatchObject({ index: 1, removedCurrent: false })
    const r = removeAt(q, 2, 2)
    expect(r.removedCurrent).toBe(true)
    expect(r.index).toBe(1)
    expect(removeAt([t('a')], 0, 0).queue).toEqual([])
  })
  it('only calls tracks playable when they really are', () => {
    expect(isPlayable(t('a'))).toBe(true)
    expect(isPlayable(t('a', { availability: 'metadata', streamUrl: undefined }))).toBe(false)
    expect(isPlayable(t('a', { availability: 'external' }))).toBe(false)
    expect(isPlayable(t('a', { availability: 'local', streamUrl: undefined }))).toBe(false)
    expect(isPlayable(t('a', { availability: 'local', blobKey: 'audio:1' }))).toBe(true)
    expect(isPlayable(t('a', { streamUrl: undefined, needsResolve: true }))).toBe(true)
    expect(isPlayable(undefined)).toBe(false)
  })
})

describe('M3U', () => {
  it('round-trips', () => {
    const tracks = [t('1', { title: 'Song One', artist: 'Band', duration: 200 }), t('2', { title: 'Song Two', artist: 'Band', streamUrl: 'https://x.test/b.mp3' })]
    const text = toM3U('Mix', tracks)
    const back = parseM3U(text)
    expect(back.name).toBe('Mix')
    expect(back.entries).toHaveLength(2)
    expect(back.entries[0]).toMatchObject({ artist: 'Band', title: 'Song One', duration: 200 })
  })
  it('handles bare files, BOM and CRLF', () => {
    const r = parseM3U('﻿#EXTM3U\r\nmusic/Foo Bar.mp3\r\n#EXTINF:-1,Solo\r\nhttps://a.test/s.ogg\r\n')
    expect(r.entries.map((e) => e.title)).toEqual(['Foo Bar', 'Solo'])
  })
})

describe('validation', () => {
  it('drops unsafe URLs and unknown fields', () => {
    const s = sanitizeTrack({ id: 'x', title: 'T', artist: 'A', source: 'jamendo', availability: 'full', streamUrl: 'javascript:alert(1)', sourceUrl: 'https://ok.test', evil: '<script>' })
    expect(s).toBeDefined()
    expect(s!.streamUrl).toBeUndefined()
    expect(s!.availability).toBe('external') // downgraded: no stream URL, but has a source page
    expect((s as unknown as Record<string, unknown>).evil).toBeUndefined()
  })
  it('rejects garbage', () => {
    expect(sanitizeTrack(null)).toBeUndefined()
    expect(sanitizeTrack({ id: 'x' })).toBeUndefined()
    expect(sanitizeTrack({ id: 'x', title: 'T', artist: 'A', source: 's', availability: 'free-lunch' })).toBeUndefined()
  })
  it('sanitises playlists and artwork', () => {
    const p = sanitizePlaylist({ name: 'P', tracks: [{ id: 'x', title: 'T', artist: 'A', source: 'jamendo', availability: 'full', streamUrl: 'https://a.test/a.mp3' }, 'junk'], artwork: 'https://tracker.test/pixel.gif' })
    expect(p!.tracks).toHaveLength(1)
    expect(p!.artwork).toBeUndefined()
    expect(sanitizePlaylist({ tracks: [] })).toBeUndefined()
  })
})
