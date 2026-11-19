import { fetchJson } from '../lib/http'
import { safeUrl } from '../lib/util'
import { stripHtml } from './shared'
import type { Release, Track } from '../types'
import type { MusicProvider } from './types'

const API = 'https://commons.wikimedia.org/w/api.php'

export interface CommonsPage {
  title: string
  pageid?: number
  imageinfo?: {
    url?: string
    descriptionurl?: string
    mime?: string
    timestamp?: string
    extmetadata?: Record<string, { value?: string } | undefined>
  }[]
}

const AUDIO_MIME = /^(audio\/|application\/ogg)/

export function mapCommonsPage(p: CommonsPage, now = Date.now()): Release | undefined {
  const info = p.imageinfo?.[0]
  const url = safeUrl(info?.url)
  if (!info || !url || !AUDIO_MIME.test(info.mime ?? '')) return undefined
  const meta = info.extmetadata ?? {}
  const licenseUrl = safeUrl(meta.LicenseUrl?.value)
  const license = stripHtml(meta.LicenseShortName?.value)
  // Commons only hosts freely-licensed or public-domain media; require a licence label to be safe.
  if (!license) return undefined
  const fileTitle = p.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')
  const title = stripHtml(meta.ObjectName?.value) ?? fileTitle
  const artist = stripHtml(meta.Artist?.value) ?? 'Unknown artist'
  const sourceUrl = safeUrl(info.descriptionurl) ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`
  const id = `commons:${p.pageid ?? p.title}`
  const track: Track = {
    id, title, artist, source: 'commons', sourceId: String(p.pageid ?? p.title),
    availability: 'full', streamUrl: url, sourceUrl, license, licenseUrl,
    // DateTimeOriginal is free text on Commons; do not pass it off as a release date.
  }
  return {
    id, kind: 'single', title, artist, source: 'commons', sourceId: String(p.pageid ?? p.title),
    // Upload time is when the FILE was added to Commons, not when the music was released.
    sourceAddedAt: info.timestamp,
    sourceUrl, availability: 'full', independent: true, license, tracks: [track],
    discoveredAt: now, catalogAddedAt: now, lastSeenAt: now,
  }
}

function params(extra: Record<string, string>) {
  return new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrnamespace: '6',
    prop: 'imageinfo', iiprop: 'url|mime|timestamp|extmetadata', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ObjectName',
    ...extra,
  })
}

async function run(q: string, sort: string | undefined, limit: number, signal?: AbortSignal, ttl = 3600_000): Promise<Release[]> {
  const p = params({ gsrsearch: `filetype:audio ${q}`.trim(), gsrlimit: String(limit), ...(sort ? { gsrsort: sort } : {}) })
  const j = await fetchJson<{ query?: { pages?: CommonsPage[] } }>(`${API}?${p.toString()}`, { provider: 'commons', minIntervalMs: 500, cacheTtl: ttl, signal })
  const now = Date.now()
  return (j.query?.pages ?? []).map((pg) => mapCommonsPage(pg, now)).filter((r): r is Release => !!r)
}

export const commons: MusicProvider = {
  id: 'commons',
  name: 'Wikimedia Commons',
  description: 'Freely licensed and public-domain audio recordings hosted by Wikimedia.',
  homepage: 'https://commons.wikimedia.org',
  termsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
  dataLicense: 'Every file carries its own free licence (shown in the app).',
  playback: 'Full streaming of the original file (mostly Ogg Vorbis — some browsers, notably Safari on older iOS, can’t decode it).',
  rateLimit: 'Wikimedia asks API clients to be polite; OpenSong keeps calls ≥0.5 s apart and caches.',
  hosts: ['commons.wikimedia.org', 'upload.wikimedia.org'],
  isConfigured: () => true,

  async search(query, ctx) {
    const albums = await run(query, undefined, 15, ctx.signal)
    return { tracks: albums.flatMap((a) => a.tracks ?? []), albums: [], artists: [] }
  },

  async newReleases(ctx, { page }) {
    if (page > 1) return { items: [], hasMore: false }
    // Newest uploads. NOTE: these have no true release date — only an upload time.
    return { items: await run('', 'create_timestamp_desc', 30, ctx.signal, 30 * 60_000), hasMore: false }
  },

  async byGenre(genre, ctx) {
    return run(genre, undefined, 20, ctx.signal, 6 * 3600_000)
  },

  async expand(release) {
    return release.tracks ?? []
  },
}
