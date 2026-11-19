import { fetchJson } from '../lib/http'
import { parseDate, safeUrl } from '../lib/util'
import { licenseLabel } from './shared'
import type { Release, Track } from '../types'
import type { MusicProvider, ProviderContext } from './types'

const SEARCH = 'https://archive.org/advancedsearch.php'
const META = 'https://archive.org/metadata'

export interface ArchiveDoc {
  identifier: string
  title?: string | string[]
  creator?: string | string[]
  date?: string
  addeddate?: string
  licenseurl?: string | string[]
  downloads?: number
  subject?: string | string[]
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** Only these licence URLs are treated as streamable by a third party: Creative Commons + public-domain tools. */
export function isOpenLicense(url: string | undefined): boolean {
  return !!url && !!licenseLabel(url)
}

export function mapArchiveDoc(d: ArchiveDoc, now = Date.now()): Release | undefined {
  const title = one(d.title)
  if (!d.identifier || !title) return undefined
  const licenseUrl = safeUrl(one(d.licenseurl))
  const open = isOpenLicense(licenseUrl)
  const t = parseDate(one(d.date))
  // Only trust a date that parses and is not in the future; otherwise leave it undefined (never fabricate).
  const releaseDate = t != null && t <= now ? one(d.date)!.slice(0, 10) : undefined
  const subject = Array.isArray(d.subject) ? d.subject : d.subject ? [d.subject] : []
  return {
    id: `archive:${d.identifier}`,
    kind: 'other',
    title,
    artist: one(d.creator) ?? 'Unknown artist',
    releaseDate,
    sourceAddedAt: d.addeddate,
    genre: subject[0],
    tags: subject.slice(0, 5),
    source: 'archive',
    sourceId: d.identifier,
    artworkUrl: safeUrl(`https://archive.org/services/img/${encodeURIComponent(d.identifier)}`),
    sourceUrl: `https://archive.org/details/${encodeURIComponent(d.identifier)}`,
    // No licence statement → we do NOT stream it; the user can open the Archive page instead.
    availability: open ? 'full' : 'external',
    independent: true,
    license: licenseLabel(licenseUrl),
    listenCount: d.downloads,
    discoveredAt: now, catalogAddedAt: now, lastSeenAt: now,
  }
}

interface ArchiveFile { name: string; format?: string; source?: string; length?: string; size?: string }

const MP3 = ['VBR MP3', 'MP3', '128Kbps MP3', '64Kbps MP3', '192Kbps MP3', '256Kbps MP3', '320Kbps MP3']
const OGG = ['Ogg Vorbis']

const encPath = (name: string) => name.split('/').map(encodeURIComponent).join('/')

/** Pick one playable file per track name from an item's file list. Exported for tests. */
export function pickAudioFiles(files: ArchiveFile[], prefer: 'mp3' | 'ogg'): ArchiveFile[] {
  const order = prefer === 'mp3' ? [...MP3, ...OGG] : [...OGG, ...MP3]
  const byBase = new Map<string, ArchiveFile>()
  for (const f of files) {
    const rank = order.indexOf(f.format ?? '')
    if (rank < 0) continue
    const base = f.name.replace(/\.[^.]+$/, '')
    const cur = byBase.get(base)
    if (!cur || rank < order.indexOf(cur.format ?? '') || (rank === order.indexOf(cur.format ?? '') && f.source === 'original')) byBase.set(base, f)
  }
  return [...byBase.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

async function tracksFor(release: Release, ctx: ProviderContext): Promise<Track[]> {
  const j = await fetchJson<{ files?: ArchiveFile[]; metadata?: { licenseurl?: string | string[] } }>(
    `${META}/${encodeURIComponent(release.sourceId)}`,
    { provider: 'archive', minIntervalMs: 500, cacheTtl: 6 * 3600_000, signal: ctx.signal },
  )
  // Re-check the licence on the authoritative item record before offering playback.
  const lic = safeUrl(one(j.metadata?.licenseurl))
  if (!isOpenLicense(lic)) return []
  const files = pickAudioFiles(j.files ?? [], ctx.settings.archiveFormat)
  return files.map((f) => ({
    id: `archive:${release.sourceId}/${f.name}`,
    title: files.length === 1 ? release.title : f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
    artist: release.artist,
    album: files.length > 1 ? release.title : undefined,
    duration: f.length && Number.isFinite(+f.length) ? Math.round(+f.length) : undefined,
    genre: release.genre,
    artworkUrl: release.artworkUrl,
    source: 'archive',
    sourceId: `${release.sourceId}/${f.name}`,
    availability: 'full' as const,
    streamUrl: `https://archive.org/download/${encodeURIComponent(release.sourceId)}/${encPath(f.name)}`,
    sourceUrl: release.sourceUrl,
    license: licenseLabel(lic),
    licenseUrl: lic,
    releaseDate: release.releaseDate,
  }))
}

const FIELDS = ['identifier', 'title', 'creator', 'date', 'addeddate', 'licenseurl', 'downloads', 'subject']

function url(q: string, sort: string, rows: number, page: number) {
  const p = new URLSearchParams({ q, rows: String(rows), page: String(page), output: 'json' })
  for (const f of FIELDS) p.append('fl[]', f)
  p.append('sort[]', sort)
  return `${SEARCH}?${p.toString()}`
}

/** Rights-labelled audio only: mediatype audio AND any licenseurl. Open-licence filtering is re-checked client-side. */
const BASE = 'mediatype:audio AND licenseurl:http*'

async function run(ctx: ProviderContext, q: string, sort: string, rows: number, page: number, ttl: number) {
  const j = await fetchJson<{ response?: { docs?: ArchiveDoc[]; numFound?: number } }>(url(q, sort, rows, page), {
    provider: 'archive', minIntervalMs: 500, cacheTtl: ttl, signal: ctx.signal,
  })
  const now = Date.now()
  const items = (j.response?.docs ?? []).map((d) => mapArchiveDoc(d, now)).filter((r): r is Release => !!r && r.availability === 'full')
  return { items, total: j.response?.numFound ?? 0 }
}

const clean = (s: string) => s.replace(/[^\p{L}\p{N} _-]+/gu, ' ').trim()

export const archive: MusicProvider = {
  id: 'archive',
  name: 'Internet Archive',
  description: 'Netlabels, live recordings and historical audio — Creative Commons and public-domain items only.',
  homepage: 'https://archive.org',
  termsUrl: 'https://archive.org/about/terms.php',
  dataLicense: 'Per-item. OpenSong only offers playback when the item declares a Creative Commons / public-domain licence.',
  playback: 'Full streaming for licence-labelled items. Items without a licence are listed as "external" and not played.',
  rateLimit: 'No published limit; OpenSong keeps calls ≥0.5 s apart and caches responses.',
  hosts: ['archive.org', '*.archive.org (audio, artwork)'],
  isConfigured: () => true,

  async search(query, ctx) {
    const q = clean(query)
    if (!q) return { tracks: [], albums: [], artists: [] }
    const { items } = await run(ctx, `(${q}) AND ${BASE}`, 'downloads desc', 15, 1, 3600_000)
    return { tracks: [], albums: items, artists: [] }
  },

  async newReleases(ctx, { sinceDays, page }) {
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10)
    const { items, total } = await run(ctx, `${BASE} AND collection:netlabels AND addeddate:[${since} TO 2100-01-01]`, 'addeddate desc', 40, page, 30 * 60_000)
    return { items, hasMore: page * 40 < total && page < 5 }
  },

  async trending(ctx) {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
    const { items } = await run(ctx, `${BASE} AND collection:netlabels AND addeddate:[${since} TO 2100-01-01]`, 'week desc', 30, 1, 6 * 3600_000)
    return items.map((r) => ({ ...r, trending: true }))
  },

  async byGenre(genre, ctx) {
    const { items } = await run(ctx, `${BASE} AND subject:"${clean(genre)}"`, 'downloads desc', 30, 1, 6 * 3600_000)
    return items
  },

  async expand(release, ctx) {
    return tracksFor(release, ctx)
  },

  async resolveTrack(track) {
    return track // tracks are fully resolved by expand()
  },
}
