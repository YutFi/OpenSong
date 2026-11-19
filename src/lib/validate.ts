import type { Availability, Playlist, Track } from '../types'
import { safeUrl } from './util'

const AVAIL: Availability[] = ['full', 'preview', 'external', 'metadata', 'local']
const str = (v: unknown, max = 300): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e7 ? v : undefined)

/** Validate + sanitise an untrusted track object (imports, backups). Unknown fields are dropped; URLs must be http(s). */
export function sanitizeTrack(raw: unknown): Track | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const id = str(r.id, 500)
  const title = str(r.title)
  const artist = str(r.artist)
  const source = str(r.source, 40)
  const availability = AVAIL.includes(r.availability as Availability) ? (r.availability as Availability) : undefined
  if (!id || !title || !artist || !source || !availability) return undefined
  const t: Track = { id, title, artist, source, availability }
  t.album = str(r.album); t.genre = str(r.genre, 80); t.duration = num(r.duration)
  t.sourceId = str(r.sourceId, 500); t.license = str(r.license, 120); t.releaseDate = str(r.releaseDate, 30)
  t.artworkUrl = safeUrl(r.artworkUrl); t.streamUrl = safeUrl(r.streamUrl); t.sourceUrl = safeUrl(r.sourceUrl); t.licenseUrl = safeUrl(r.licenseUrl)
  t.blobKey = str(r.blobKey, 200); t.artworkBlobKey = str(r.artworkBlobKey, 200); t.fileKey = str(r.fileKey, 200); t.fileName = str(r.fileName, 300)
  if (r.needsResolve === true) t.needsResolve = true
  if (typeof r.youtubeId === 'string' && /^[\w-]{11}$/.test(r.youtubeId)) t.youtubeId = r.youtubeId
  // Remote tracks without a URL can never be "full"; downgrade rather than trust the file.
  if ((availability === 'full' || availability === 'preview') && !t.streamUrl && !t.needsResolve && !t.youtubeId) t.availability = t.sourceUrl ? 'external' : 'metadata'
  if (availability === 'local' && !t.blobKey) t.availability = 'metadata'
  return t
}

export function sanitizePlaylist(raw: unknown, now = Date.now()): Playlist | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const name = str(r.name, 120)
  if (!name || !Array.isArray(r.tracks)) return undefined
  const tracks = r.tracks.slice(0, 5000).map(sanitizeTrack).filter((t): t is Track => !!t)
  const art = typeof r.artwork === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(r.artwork) && r.artwork.length < 400_000 ? r.artwork : undefined
  return {
    id: str(r.id, 100) ?? `${now}`, name, description: str(r.description, 1000), artwork: art, tracks,
    createdAt: num(r.createdAt) ?? now, updatedAt: num(r.updatedAt) ?? now,
  }
}

/** Parse JSON with a size cap so a hostile file can't freeze the tab. */
export function parseJsonSafe(text: string, maxBytes = 50_000_000): unknown {
  if (text.length > maxBytes) throw new Error('File is too large.')
  return JSON.parse(text)
}
