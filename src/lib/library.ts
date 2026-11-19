import { db } from './db'
import { dedupeKey, norm, uid } from './util'
import { parseM3U, toM3U } from './m3u'
import { parseJsonSafe, sanitizePlaylist, sanitizeTrack } from './validate'
import type { Playlist, Track } from '../types'

export const SUPPORTED_EXT = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'mp4']
export const ACCEPT = SUPPORTED_EXT.map((e) => `.${e}`).join(',') + ',audio/*'

const MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg; codecs=opus', m4a: 'audio/mp4', aac: 'audio/aac', mp4: 'audio/mp4' }

export const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

/** Can this browser decode the file type? (e.g. Safari cannot play Ogg Vorbis.) */
export function browserCanPlay(ext: string): boolean {
  if (typeof Audio === 'undefined') return true
  const m = MIME[ext]
  return !m || new Audio().canPlayType(m) !== ''
}

async function fingerprint(file: File): Promise<string> {
  const head = await file.slice(0, 65536).arrayBuffer()
  const tail = file.size > 65536 ? await file.slice(Math.max(0, file.size - 65536)).arrayBuffer() : new ArrayBuffer(0)
  const buf = new Uint8Array(head.byteLength + tail.byteLength + 8)
  buf.set(new Uint8Array(head), 0); buf.set(new Uint8Array(tail), head.byteLength)
  new DataView(buf.buffer).setFloat64(buf.length - 8, file.size)
  const d = await crypto.subtle.digest('SHA-1', buf)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function downscale(blob: Blob, max = 400): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
  } catch { return blob }
}

export interface ImportResult { added: Track[]; duplicates: string[]; failed: { name: string; reason: string }[]; unsupported: string[] }

/** Import local audio files: metadata is read in the browser; nothing is uploaded anywhere. */
export async function importFiles(files: File[], onProgress?: (done: number, total: number, name: string) => void): Promise<ImportResult> {
  const res: ImportResult = { added: [], duplicates: [], failed: [], unsupported: [] }
  const { parseBlob } = await import('music-metadata')
  const existing = await db.tracks.toArray() // this table only ever holds imported local files
  const keys = new Set(existing.map((t) => t.fileKey))
  const soft = new Set(existing.map((t) => `${dedupeKey(t.artist, t.title)}|${Math.round(t.duration ?? 0)}`))
  let done = 0
  for (const file of files) {
    onProgress?.(done, files.length, file.name)
    const ext = extOf(file.name)
    try {
      if (!SUPPORTED_EXT.includes(ext) && !file.type.startsWith('audio/')) { res.failed.push({ name: file.name, reason: 'Not an audio file' }); continue }
      if (!browserCanPlay(ext)) res.unsupported.push(file.name)
      const fileKey = await fingerprint(file)
      if (keys.has(fileKey)) { res.duplicates.push(file.name); continue }
      let meta
      try { meta = await parseBlob(file, { duration: true, skipPostHeaders: true }) } catch { meta = undefined }
      const c = meta?.common
      const title = c?.title?.trim() || file.name.replace(/\.[^.]+$/, '')
      const artist = c?.artist?.trim() || c?.albumartist?.trim() || 'Unknown artist'
      const duration = meta?.format.duration ? Math.round(meta.format.duration * 10) / 10 : undefined
      const sk = `${dedupeKey(artist, title)}|${Math.round(duration ?? 0)}`
      if (soft.has(sk) && duration) { res.duplicates.push(file.name); continue }
      let artworkBlobKey: string | undefined
      const pic = c?.picture?.[0]
      if (pic) {
        const art = await downscale(new Blob([pic.data as BlobPart], { type: pic.format }))
        artworkBlobKey = `art:${fileKey}`
        await db.blobs.put({ key: artworkBlobKey, blob: art })
      }
      const track: Track = {
        id: `local:${fileKey}`, title, artist, album: c?.album?.trim() || undefined, duration, genre: c?.genre?.[0]?.trim() || undefined,
        source: 'local', availability: 'local', blobKey: `audio:${fileKey}`, artworkBlobKey, fileKey, fileName: file.name,
        releaseDate: c?.year ? String(c.year) : undefined, addedAt: Date.now(),
      }
      await db.transaction('rw', db.blobs, db.tracks, async () => {
        await db.blobs.put({ key: track.blobKey!, blob: file })
        await db.tracks.put(track)
      })
      keys.add(fileKey); soft.add(sk)
      res.added.push(track)
    } catch (e) {
      res.failed.push({ name: file.name, reason: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      done++
      onProgress?.(done, files.length, file.name)
    }
  }
  if (res.added.length) void navigator.storage?.persist?.().catch(() => undefined)
  return res
}

export async function removeLocalTracks(ids: string[]) {
  const tracks = (await db.tracks.bulkGet(ids)).filter((t): t is Track => !!t)
  await db.transaction('rw', db.tracks, db.blobs, db.favourites, async () => {
    for (const t of tracks) {
      await db.tracks.delete(t.id)
      if (t.blobKey) await db.blobs.delete(t.blobKey)
      if (t.artworkBlobKey) await db.blobs.delete(t.artworkBlobKey)
      await db.favourites.delete(t.id)
    }
  })
}

// ---------- favourites ----------
export async function toggleFavourite(track: Track): Promise<boolean> {
  const has = await db.favourites.get(track.id)
  if (has) { await db.favourites.delete(track.id); return false }
  await db.favourites.put({ id: track.id, track, addedAt: Date.now() })
  return true
}

export const albumKey = (artist: string, album: string) => `${norm(artist)}|${norm(album)}`

export async function toggleFavouriteAlbum(album: string, artist: string, artworkUrl?: string): Promise<boolean> {
  const id = albumKey(artist, album)
  if (await db.favAlbums.get(id)) { await db.favAlbums.delete(id); return false }
  await db.favAlbums.put({ id, album, artist, artworkUrl, addedAt: Date.now() })
  return true
}

export async function toggleFollow(artist: string): Promise<boolean> {
  const name = artist.trim()
  if (await db.follows.get(name)) { await db.follows.delete(name); return false }
  await db.follows.put({ name, addedAt: Date.now() })
  return true
}

// ---------- playlists ----------
export async function createPlaylist(name: string, tracks: Track[] = [], description?: string): Promise<Playlist> {
  const now = Date.now()
  const p: Playlist = { id: uid(), name: name.trim().slice(0, 120) || 'Untitled playlist', description, tracks: dedupe(tracks), createdAt: now, updatedAt: now }
  await db.playlists.add(p)
  return p
}
const dedupe = (tracks: Track[]) => [...new Map(tracks.map((t) => [t.id, t])).values()]

export async function updatePlaylist(id: string, patch: Partial<Pick<Playlist, 'name' | 'description' | 'artwork' | 'tracks'>>) {
  await db.playlists.update(id, { ...patch, updatedAt: Date.now() })
}
export const deletePlaylist = (id: string) => db.playlists.delete(id)

export async function addToPlaylist(id: string, tracks: Track[]): Promise<number> {
  const p = await db.playlists.get(id)
  if (!p) return 0
  const have = new Set(p.tracks.map((t) => t.id))
  const add = dedupe(tracks).filter((t) => !have.has(t.id))
  if (add.length) await updatePlaylist(id, { tracks: [...p.tracks, ...add] })
  return add.length
}

export function playlistDuration(p: Playlist) { return p.tracks.reduce((s, t) => s + (t.duration ?? 0), 0) }

export function exportPlaylistJSON(p: Playlist): string {
  return JSON.stringify({ format: 'opensong-playlist', version: 1, name: p.name, description: p.description, artwork: p.artwork, tracks: p.tracks }, null, 2)
}
export const exportPlaylistM3U = (p: Playlist) => toM3U(p.name, p.tracks)

export interface PlaylistImportResult { playlist: Playlist; matched: number; missing: string[] }

/** Import an OpenSong JSON or M3U/M3U8 playlist. Local files are re-linked to the library by fingerprint / artist+title. */
export async function importPlaylist(text: string, filename: string): Promise<PlaylistImportResult> {
  const lib = await db.tracks.toArray()
  const byKey = new Map(lib.map((t) => [dedupeKey(t.artist, t.title), t]))
  const byFile = new Map(lib.filter((t) => t.fileName).map((t) => [t.fileName!.toLowerCase(), t]))
  const byId = new Map(lib.map((t) => [t.id, t]))
  const tracks: Track[] = []
  const missing: string[] = []
  let name = filename.replace(/\.[^.]+$/, '')
  let description: string | undefined
  let artwork: string | undefined

  if (/\.m3u8?$/i.test(filename) || text.trimStart().startsWith('#EXTM3U')) {
    const m = parseM3U(text)
    name = m.name || name
    for (const e of m.entries) {
      const hit = (e.artist && byKey.get(dedupeKey(e.artist, e.title))) || byFile.get((e.path.split(/[\\/]/).pop() ?? '').toLowerCase())
      if (hit) tracks.push(hit)
      else if (/^https?:\/\//i.test(e.path)) {
        // We cannot verify rights for arbitrary URLs, so they are kept as external links, not playable tracks.
        tracks.push({ id: `url:${e.path}`, title: e.title, artist: e.artist ?? 'Unknown artist', duration: e.duration, source: 'url', availability: 'external', sourceUrl: e.path })
      } else missing.push(e.artist ? `${e.artist} – ${e.title}` : e.title)
    }
  } else {
    const j = parseJsonSafe(text) as Record<string, unknown>
    const p = sanitizePlaylist({ ...j, tracks: Array.isArray(j.tracks) ? j.tracks : [] })
    if (!p || (j.format && j.format !== 'opensong-playlist')) throw new Error('This file is not an OpenSong playlist.')
    name = p.name; description = p.description; artwork = p.artwork
    for (const t of p.tracks) {
      if (t.source === 'local') {
        const hit = byId.get(t.id) ?? byKey.get(dedupeKey(t.artist, t.title))
        if (hit) tracks.push(hit); else missing.push(`${t.artist} – ${t.title}`)
      } else tracks.push(t)
    }
  }
  const playlist = await createPlaylist(name, tracks, description)
  if (artwork) await updatePlaylist(playlist.id, { artwork })
  return { playlist: { ...playlist, artwork }, matched: tracks.length, missing }
}

/** Downscale a user-chosen image to a small JPEG data URL for playlist artwork. */
export async function imageToDataUrl(file: File, max = 400): Promise<string> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.82)
}

// ---------- history & searches ----------
export async function clearHistory() { await db.history.clear() }
export async function addSearch(q: string) {
  const query = q.trim()
  if (query.length < 2) return
  await db.searches.put({ query, at: Date.now() })
  const all = await db.searches.orderBy('at').reverse().offset(30).primaryKeys()
  if (all.length) await db.searches.bulkDelete(all)
}
export const clearSearches = () => db.searches.clear()

// ---------- backup ----------
export async function exportBackup(settings: unknown): Promise<string> {
  const [playlists, favourites, favAlbums, history, follows, searches, presets] = await Promise.all([
    db.playlists.toArray(), db.favourites.toArray(), db.favAlbums.toArray(), db.history.toArray(),
    db.follows.toArray(), db.searches.toArray(), db.presets.toArray(),
  ])
  return JSON.stringify({ format: 'opensong-backup', version: 1, exportedAt: new Date().toISOString(), settings, playlists, favourites, favAlbums, history, follows, searches, presets }, null, 2)
}

export async function importBackup(text: string): Promise<{ playlists: number; history: number; favourites: number; settings?: unknown }> {
  const j = parseJsonSafe(text) as Record<string, unknown>
  if (j.format !== 'opensong-backup') throw new Error('This file is not an OpenSong backup.')
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  const playlists = arr(j.playlists).map((p) => sanitizePlaylist(p)).filter((p): p is Playlist => !!p)
  const favourites = arr(j.favourites).flatMap((f) => { const t = sanitizeTrack((f as { track?: unknown })?.track); return t ? [{ id: t.id, track: t, addedAt: Number((f as { addedAt?: number }).addedAt) || Date.now() }] : [] })
  const history = arr(j.history).flatMap((h) => {
    const r = h as Record<string, unknown>
    if (typeof r.trackId !== 'string' || typeof r.title !== 'string' || typeof r.artist !== 'string' || typeof r.startedAt !== 'number' || typeof r.listened !== 'number') return []
    return [{ trackId: r.trackId.slice(0, 500), title: r.title.slice(0, 300), artist: r.artist.slice(0, 300), album: typeof r.album === 'string' ? r.album.slice(0, 300) : undefined, genre: typeof r.genre === 'string' ? r.genre.slice(0, 80) : undefined, source: typeof r.source === 'string' ? r.source.slice(0, 40) : 'unknown', startedAt: r.startedAt, listened: Math.max(0, r.listened), duration: typeof r.duration === 'number' ? r.duration : undefined, counted: !!r.counted, skipped: !!r.skipped }]
  })
  const presets = arr(j.presets).flatMap((r) => {
    const x = r as Record<string, unknown>
    if (typeof x.id !== 'string' || (x.kind !== 'eq' && x.kind !== 'viz') || typeof x.name !== 'string' || typeof x.data !== 'object' || x.data === null) return []
    return [{ id: x.id.slice(0, 80), kind: x.kind as 'eq' | 'viz', name: x.name.slice(0, 60), data: x.data, updatedAt: Number(x.updatedAt) || Date.now() }]
  })
  await db.transaction('rw', [db.playlists, db.favourites, db.history, db.follows, db.favAlbums, db.presets], async () => {
    await db.presets.bulkPut(presets)
    await db.playlists.bulkPut(playlists)
    await db.favourites.bulkPut(favourites)
    await db.history.bulkAdd(history)
    await db.follows.bulkPut(arr(j.follows).filter((f): f is { name: string; addedAt: number } => typeof (f as { name?: unknown })?.name === 'string').map((f) => ({ name: f.name.slice(0, 200), addedAt: Number(f.addedAt) || Date.now() })))
    await db.favAlbums.bulkPut(arr(j.favAlbums).filter((f): f is { id: string; album: string; artist: string; addedAt: number } => typeof (f as { id?: unknown })?.id === 'string' && typeof (f as { album?: unknown }).album === 'string').map((f) => ({ id: f.id, album: f.album, artist: f.artist, addedAt: Number(f.addedAt) || Date.now() })))
  })
  return { playlists: playlists.length, history: history.length, favourites: favourites.length, settings: j.settings }
}
