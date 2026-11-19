import { fetchJson } from '../lib/http'
import { safeUrl } from '../lib/util'
import { kindFromTrackCount, licenseLabel } from './shared'
import type { Release, Track } from '../types'
import type { MusicProvider, ProviderContext } from './types'

const API = 'https://api.jamendo.com/v3.0'

export interface JamendoTrack {
  id: string
  name: string
  duration?: number
  artist_id?: string
  artist_name?: string
  album_id?: string
  album_name?: string
  releasedate?: string
  album_image?: string
  image?: string
  audio?: string
  audiodownload_allowed?: boolean
  shareurl?: string
  license_ccurl?: string
  musicinfo?: { tags?: { genres?: string[] } }
}
interface JamendoResponse { headers?: { status?: string; error_message?: string }; results?: JamendoTrack[] }

export function mapJamendoTrack(t: JamendoTrack): Track {
  const stream = safeUrl(t.audio)
  const lic = safeUrl(t.license_ccurl)
  return {
    id: `jamendo:${t.id}`,
    title: t.name,
    artist: t.artist_name ?? 'Unknown artist',
    album: t.album_name || undefined,
    duration: t.duration,
    genre: t.musicinfo?.tags?.genres?.[0],
    artworkUrl: safeUrl(t.image || t.album_image),
    source: 'jamendo',
    sourceId: t.id,
    // Jamendo grants streaming to registered non-commercial apps via the API's `audio` URL.
    availability: stream ? 'full' : 'external',
    streamUrl: stream,
    sourceUrl: safeUrl(t.shareurl) ?? `https://www.jamendo.com/track/${t.id}`,
    license: licenseLabel(lic) ?? (lic ? 'Creative Commons' : undefined),
    licenseUrl: lic,
    releaseDate: t.releasedate || undefined,
  }
}

/** Group tracks into releases by album. Kind is INFERRED from the track count (1 single, 2–6 EP, 7+ album). */
export function groupJamendo(tracks: JamendoTrack[], now = Date.now(), trending = false): Release[] {
  const groups = new Map<string, JamendoTrack[]>()
  for (const t of tracks) {
    const key = t.album_id && t.album_name ? `a${t.album_id}` : `t${t.id}`
    const g = groups.get(key)
    if (g) g.push(t); else groups.set(key, [t])
  }
  return [...groups.values()].map((g) => {
    const first = g[0]
    const mapped = g.map(mapJamendoTrack)
    const isAlbum = !!(first.album_id && first.album_name)
    return {
      id: isAlbum ? `jamendo:album:${first.album_id}` : mapped[0].id,
      kind: kindFromTrackCount(g.length),
      title: isAlbum ? first.album_name! : first.name,
      artist: first.artist_name ?? 'Unknown artist',
      releaseDate: first.releasedate || undefined,
      genre: mapped[0].genre,
      source: 'jamendo',
      sourceId: isAlbum ? `album:${first.album_id}` : first.id,
      artworkUrl: mapped[0].artworkUrl,
      sourceUrl: mapped[0].sourceUrl,
      availability: mapped.some((m) => m.availability === 'full') ? 'full' : 'external',
      independent: true,
      license: mapped[0].license,
      tracks: mapped,
      trending,
      discoveredAt: now, catalogAddedAt: now, lastSeenAt: now,
    } satisfies Release
  })
}

function base(ctx: ProviderContext, params: Record<string, string>): string {
  const p = new URLSearchParams({
    client_id: ctx.settings.jamendoClientId ?? '',
    format: 'json',
    imagesize: '300',
    audioformat: ctx.settings.jamendoFormat,
    include: 'musicinfo+licenses',
    ...params,
  })
  return `${API}/tracks/?${p.toString().replace(/%2B/g, '+')}`
}

async function query(ctx: ProviderContext, params: Record<string, string>, ttl: number): Promise<JamendoTrack[]> {
  const j = await fetchJson<JamendoResponse>(base(ctx, params), { provider: 'jamendo', minIntervalMs: 400, cacheTtl: ttl, signal: ctx.signal })
  // Jamendo reports errors inside a 200 response.
  if (j?.headers?.status && j.headers.status !== 'success') throw new Error(`Jamendo: ${j.headers.error_message ?? j.headers.status}`)
  return j?.results ?? []
}

export const jamendo: MusicProvider = {
  id: 'jamendo',
  name: 'Jamendo',
  description: 'Independent artists publishing under Creative Commons licences. Full-length streaming.',
  homepage: 'https://www.jamendo.com',
  termsUrl: 'https://developer.jamendo.com/v3.0/terms',
  dataLicense: 'Each track carries its own Creative Commons licence (shown in the app).',
  playback: 'Full streaming for registered non-commercial apps. Needs your own free client ID (Settings → Music sources).',
  rateLimit: 'Free tier: 35,000 requests/month. OpenSong spaces calls ≥0.4 s apart and caches responses.',
  hosts: ['api.jamendo.com', '*.jamendo.com (audio and artwork)'],
  keyRequired: true,
  isConfigured: (s) => !!s.jamendoClientId?.trim(),

  async search(q, ctx) {
    const tracks = await query(ctx, { search: q, limit: '20', order: 'relevance' }, 3600_000)
    const now = Date.now()
    return { tracks: tracks.map(mapJamendoTrack), albums: groupJamendo(tracks, now).filter((r) => r.kind !== 'single'), artists: [] }
  },

  async newReleases(ctx, { sinceDays, page }) {
    const to = new Date()
    const from = new Date(to.getTime() - sinceDays * 86400_000)
    const f = (d: Date) => d.toISOString().slice(0, 10)
    const limit = 50
    const tracks = await query(ctx, {
      order: 'releasedate_desc', datebetween: `${f(from)}_${f(to)}`, limit: String(limit), offset: String((page - 1) * limit),
    }, 30 * 60_000)
    return { items: groupJamendo(tracks), hasMore: tracks.length === limit }
  },

  async trending(ctx) {
    const tracks = await query(ctx, { order: 'popularity_week', limit: '30' }, 6 * 3600_000)
    return groupJamendo(tracks, Date.now(), true)
  },

  async byGenre(genre, ctx) {
    const tracks = await query(ctx, { tags: genre.toLowerCase(), order: 'popularity_month', limit: '30' }, 6 * 3600_000)
    return groupJamendo(tracks)
  },

  async artistReleases(name, _mbid, ctx) {
    const tracks = await query(ctx, { artist_name: name, order: 'releasedate_desc', limit: '50' }, 6 * 3600_000)
    return groupJamendo(tracks)
  },

  async expand(release) {
    return release.tracks ?? []
  },
}
