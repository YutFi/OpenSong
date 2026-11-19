import { fetchJson } from '../lib/http'
import { safeUrl } from '../lib/util'
import type { Release, ReleaseKind } from '../types'
import type { ArtistResult, MusicProvider } from './types'

const API = 'https://musicbrainz.org/ws/2'

interface MBRG {
  id: string
  title: string
  'primary-type'?: string | null
  'first-release-date'?: string
  'artist-credit'?: { name?: string; artist?: { id: string; name: string } }[]
  tags?: { name: string; count?: number }[]
}
interface MBArtist {
  id: string
  name: string
  country?: string
  disambiguation?: string
  tags?: { name: string }[]
}

const kind = (t?: string | null): ReleaseKind => {
  switch ((t ?? '').toLowerCase()) { case 'single': return 'single'; case 'album': return 'album'; case 'ep': return 'ep'; default: return 'other' }
}

export function mapReleaseGroup(r: MBRG, now = Date.now()): Release {
  const ac = r['artist-credit']?.[0]
  const tags = (r.tags ?? []).sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).map((t) => t.name)
  return {
    id: `musicbrainz:${r.id}`,
    kind: kind(r['primary-type']),
    title: r.title,
    artist: ac?.name ?? ac?.artist?.name ?? 'Unknown artist',
    artistMbid: ac?.artist?.id,
    releaseDate: r['first-release-date'] || undefined,
    genre: tags[0],
    tags,
    source: 'musicbrainz',
    sourceId: r.id,
    artworkUrl: safeUrl(`https://coverartarchive.org/release-group/${r.id}/front-250`),
    sourceUrl: `https://musicbrainz.org/release-group/${r.id}`,
    availability: 'metadata',
    discoveredAt: now, catalogAddedAt: now, lastSeenAt: now,
  }
}

export function mapArtist(a: MBArtist): ArtistResult {
  return {
    id: `musicbrainz:${a.id}`,
    name: a.name,
    source: 'musicbrainz',
    mbid: a.id,
    country: a.country,
    disambiguation: a.disambiguation,
    tags: a.tags?.map((t) => t.name),
    sourceUrl: `https://musicbrainz.org/artist/${a.id}`,
  }
}

const lucene = (s: string) => s.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ').trim()

export const musicbrainz: MusicProvider = {
  id: 'musicbrainz',
  name: 'MusicBrainz',
  description: 'The open music encyclopedia: artists, albums, releases and discographies.',
  homepage: 'https://musicbrainz.org',
  termsUrl: 'https://musicbrainz.org/doc/MusicBrainz_API',
  dataLicense: 'Core data is CC0. Free for non-commercial use; commercial use needs an agreement.',
  playback: 'Metadata only — no audio.',
  rateLimit: '1 request/second per IP (enforced)',
  hosts: ['musicbrainz.org', 'coverartarchive.org'],
  isConfigured: () => true,

  async search(query, ctx) {
    const q = lucene(query)
    if (!q) return { tracks: [], albums: [], artists: [] }
    const opt = { provider: 'musicbrainz', minIntervalMs: 1100, cacheTtl: 24 * 3600 * 1000, signal: ctx.signal }
    const [rg, ar] = await Promise.all([
      fetchJson<{ 'release-groups'?: MBRG[] }>(`${API}/release-group?query=${encodeURIComponent(q)}&fmt=json&limit=8`, opt),
      fetchJson<{ artists?: MBArtist[] }>(`${API}/artist?query=${encodeURIComponent(q)}&fmt=json&limit=6`, opt),
    ])
    const now = Date.now()
    return {
      tracks: [],
      albums: (rg['release-groups'] ?? []).map((r) => mapReleaseGroup(r, now)),
      artists: (ar.artists ?? []).map(mapArtist),
    }
  },

  async artistReleases(name, mbid, ctx) {
    const opt = { provider: 'musicbrainz', minIntervalMs: 1100, cacheTtl: 24 * 3600 * 1000, signal: ctx.signal }
    let id = mbid
    if (!id) {
      const f = await fetchJson<{ artists?: MBArtist[] }>(`${API}/artist?query=${encodeURIComponent(`artist:"${lucene(name)}"`)}&fmt=json&limit=1`, opt)
      id = f.artists?.[0]?.id
    }
    if (!id) return []
    const j = await fetchJson<{ 'release-groups'?: MBRG[] }>(`${API}/release-group?artist=${id}&type=album|single|ep&fmt=json&limit=100`, opt)
    const now = Date.now()
    return (j['release-groups'] ?? []).map((r) => mapReleaseGroup(r, now))
      .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
  },
}
