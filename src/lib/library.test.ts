import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addSearch, addToPlaylist, clearHistory, clearSearches, createPlaylist, deletePlaylist, exportBackup, exportPlaylistJSON, exportPlaylistM3U, importBackup, importFiles, importPlaylist, playlistDuration, removeLocalTracks, toggleFavourite, toggleFollow, updatePlaylist } from './library'
import type { Track } from '../types'

const tr = (id: string, over: Partial<Track> = {}): Track => ({ id, title: `Song ${id}`, artist: 'Band', source: 'jamendo', availability: 'full', streamUrl: `https://x.test/${id}.mp3`, duration: 100, ...over })

beforeEach(async () => { await db.delete(); await db.open() })

describe('playlists', () => {
  it('creates, renames, adds without duplicates, reorders, removes and deletes', async () => {
    const p = await createPlaylist('  Road trip ', [tr('1'), tr('1'), tr('2')], 'desc')
    expect(p.name).toBe('Road trip')
    expect(p.tracks).toHaveLength(2) // duplicate collapsed
    expect(await addToPlaylist(p.id, [tr('2'), tr('3')])).toBe(1)
    await updatePlaylist(p.id, { name: 'Renamed' })
    const got = (await db.playlists.get(p.id))!
    expect(got.name).toBe('Renamed')
    expect(got.tracks.map((t) => t.id)).toEqual(['1', '2', '3'])
    expect(playlistDuration(got)).toBe(300)
    await updatePlaylist(p.id, { tracks: [got.tracks[2], got.tracks[0], got.tracks[1]] })
    expect((await db.playlists.get(p.id))!.tracks.map((t) => t.id)).toEqual(['3', '1', '2'])
    await deletePlaylist(p.id)
    expect(await db.playlists.count()).toBe(0)
  })
  it('persists across a database reopen', async () => {
    const p = await createPlaylist('Keep me', [tr('1')])
    db.close(); await db.open()
    expect((await db.playlists.get(p.id))!.tracks).toHaveLength(1)
  })
  it('exports and re-imports JSON and M3U', async () => {
    const local: Track = { id: 'local:abc', title: 'Mine', artist: 'Me', source: 'local', availability: 'local', blobKey: 'audio:abc', fileName: 'mine.mp3', fileKey: 'abc' }
    await db.tracks.put(local)
    const p = await createPlaylist('Mix', [tr('1'), local])
    await db.playlists.delete(p.id)
    const json = exportPlaylistJSON((await createPlaylist('Mix', [tr('1'), local])))
    const r = await importPlaylist(json, 'mix.json')
    expect(r.matched).toBe(2)
    expect(r.missing).toEqual([])
    expect(r.playlist.tracks.map((t) => t.id)).toEqual(['jamendo:1'.replace('jamendo:', ''), 'local:abc'])
    const m3u = exportPlaylistM3U(r.playlist)
    const r2 = await importPlaylist(m3u, 'mix.m3u')
    expect(r2.matched).toBe(2)
  })
  it('reports local tracks it cannot re-link instead of faking them', async () => {
    const json = JSON.stringify({ format: 'opensong-playlist', name: 'X', tracks: [{ id: 'local:zzz', title: 'Gone', artist: 'Nobody', source: 'local', availability: 'local', blobKey: 'audio:zzz' }] })
    const r = await importPlaylist(json, 'x.json')
    expect(r.matched).toBe(0)
    expect(r.missing).toEqual(['Nobody – Gone'])
  })
  it('keeps arbitrary URLs from M3U as external links, never as playable', async () => {
    const r = await importPlaylist('#EXTM3U\n#EXTINF:100,A - B\nhttps://some.site/file.mp3\n', 'u.m3u')
    expect(r.playlist.tracks[0].availability).toBe('external')
    expect(r.playlist.tracks[0].streamUrl).toBeUndefined()
  })
  it('rejects files that are not playlists', async () => {
    await expect(importPlaylist('{"hello":1}', 'x.json')).rejects.toThrow()
    await expect(importPlaylist('not json', 'x.json')).rejects.toThrow()
  })
})

describe('favourites, follows, history, searches', () => {
  it('toggles favourites and follows', async () => {
    expect(await toggleFavourite(tr('1'))).toBe(true)
    expect(await db.favourites.count()).toBe(1)
    expect(await toggleFavourite(tr('1'))).toBe(false)
    expect(await toggleFollow('Band')).toBe(true)
    expect(await toggleFollow('Band')).toBe(false)
  })
  it('keeps recent searches bounded and clearable', async () => {
    for (let i = 0; i < 40; i++) await addSearch(`query ${i}`)
    await addSearch('x')
    expect(await db.searches.count()).toBeLessThanOrEqual(30)
    await clearSearches()
    expect(await db.searches.count()).toBe(0)
  })
  it('clears listening history', async () => {
    await db.history.add({ trackId: 'a', title: 'a', artist: 'a', source: 's', startedAt: 1, listened: 10, counted: false, skipped: false })
    await clearHistory()
    expect(await db.history.count()).toBe(0)
  })
})

describe('backup', () => {
  it('round-trips user data through a validated backup', async () => {
    await createPlaylist('P', [tr('1')])
    await toggleFavourite(tr('2'))
    await toggleFollow('Band')
    await db.presets.add({ id: 'p1', kind: 'eq', name: 'Mine', data: { gains: {} }, updatedAt: 1 })
    await db.history.add({ trackId: 'a', title: 'a', artist: 'a', source: 's', startedAt: 1, listened: 10, counted: false, skipped: false })
    const text = await exportBackup({ theme: 'dark' })
    await db.delete(); await db.open()
    const r = await importBackup(text)
    expect(r).toMatchObject({ playlists: 1, history: 1, favourites: 1 })
    expect(await db.follows.count()).toBe(1)
    expect((await db.presets.get('p1'))?.name).toBe('Mine')
  })
  it('refuses foreign or hostile files', async () => {
    await expect(importBackup('{"format":"other"}')).rejects.toThrow('not an OpenSong backup')
    await importBackup(JSON.stringify({ format: 'opensong-backup', playlists: [{ name: 'P', tracks: [{ id: 'x', title: 't', artist: 'a', source: 's', availability: 'full', streamUrl: 'javascript:1', sourceUrl: 'https://ok.test' }] }, 'junk'], history: [{ nope: 1 }] }))
    const p = (await db.playlists.toArray())[0]
    expect(p.tracks[0].streamUrl).toBeUndefined()
    expect(await db.history.count()).toBe(0)
  })
})

describe('local library import', () => {
  /** Minimal valid 16-bit mono WAV: 0.5 s of silence. */
  const wav = (seed = 0, secs = 0.5) => {
    const rate = 8000, n = Math.floor(rate * secs), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
    const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true)
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, (i * 37 + seed) % 2000, true)
    return buf
  }
  it('imports a file, reads duration, stores the blob and detects exact duplicates', async () => {
    const f = new File([wav(1)], 'My Song.wav', { type: 'audio/wav' })
    const r = await importFiles([f])
    expect(r.failed).toEqual([])
    expect(r.added).toHaveLength(1)
    const t = r.added[0]
    expect(t).toMatchObject({ title: 'My Song', artist: 'Unknown artist', availability: 'local', source: 'local' })
    expect(t.duration).toBeCloseTo(0.5, 1)
    // (jsdom's fake IndexedDB cannot clone Blobs faithfully; real Blob storage + playback is covered by the Chrome e2e test)
    expect(await db.blobs.get(t.blobKey!)).toBeDefined()
    const again = await importFiles([new File([wav(1)], 'Copy of My Song.wav', { type: 'audio/wav' })])
    expect(again.added).toHaveLength(0)
    expect(again.duplicates).toEqual(['Copy of My Song.wav'])
    expect(await db.tracks.count()).toBe(1)
  })
  it('rejects non-audio files without crashing the batch', async () => {
    const r = await importFiles([new File(['hello'], 'notes.txt', { type: 'text/plain' }), new File([wav(2)], 'ok.wav', { type: 'audio/wav' })])
    expect(r.failed.map((x) => x.name)).toEqual(['notes.txt'])
    expect(r.added).toHaveLength(1)
  })
  it('reports progress and removes tracks together with their audio', async () => {
    const seen: number[] = []
    const r = await importFiles([new File([wav(3)], 'a.wav'), new File([wav(4)], 'b.wav')], (d) => seen.push(d))
    expect(seen[seen.length - 1]).toBe(2)
    await toggleFavourite(r.added[0])
    await removeLocalTracks([r.added[0].id])
    expect(await db.tracks.count()).toBe(1)
    expect(await db.blobs.get(r.added[0].blobKey!)).toBeUndefined()
    expect(await db.favourites.count()).toBe(0)
  })
})
