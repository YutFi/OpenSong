import { fetchJson } from '../lib/http'
import { safeUrl } from '../lib/util'
import type { Release, Track } from '../types'
import type { MusicProvider, ProviderContext } from './types'

const API = 'https://www.googleapis.com/youtube/v3'
const MUSIC_CATEGORY = '10'

export interface YouTubeVideo {
  id: string
  snippet?: {
    title?: string
    channelTitle?: string
    publishedAt?: string
    thumbnails?: Record<string, { url?: string } | undefined>
  }
  contentDetails?: { duration?: string }
  statistics?: { viewCount?: string }
  status?: { embeddable?: boolean }
}
interface VideosResponse { items?: YouTubeVideo[] }
interface SearchResponse { items?: { id?: { videoId?: string } }[] }

/** ISO-8601 duration (PT3M25S, PT1H2M) → seconds. */
export function parseIsoDuration(d: string | undefined): number | undefined {
  const m = d ? /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d) : null
  if (!m) return undefined
  const [, days, h, min, s] = m
  const total = (+(days ?? 0)) * 86400 + (+(h ?? 0)) * 3600 + (+(min ?? 0)) * 60 + +(s ?? 0)
  return total > 0 ? total : undefined
}

const ID_RE = /^[\w-]{11}$/

/**
 * One YouTube video → one playable-through-the-embed track.
 * Returns undefined when the owner disallows embedding (we never offer something that can't play)
 * or when the video id is malformed.
 */
export function mapYouTubeVideo(v: YouTubeVideo): Track | undefined {
  if (!v?.id || !ID_RE.test(v.id)) return undefined
  if (v.status?.embeddable === false) return undefined
  const sn = v.snippet
  if (!sn?.title) return undefined
  const th = sn.thumbnails
  const art = safeUrl(th?.medium?.url ?? th?.high?.url ?? th?.default?.url)
  return {
    id: `youtube:${v.id}`,
    title: sn.title,
    // YouTube auto-generated artist channels are named "<Artist> - Topic".
    artist: (sn.channelTitle ?? 'Unknown artist').replace(/\s+-\s+Topic$/i, ''),
    duration: parseIsoDuration(v.contentDetails?.duration),
    artworkUrl: art,
    source: 'youtube',
    sourceId: v.id,
    youtubeId: v.id,
    availability: 'full',
    sourceUrl: `https://www.youtube.com/watch?v=${v.id}`,
    // The day it was published on YouTube, as reported — not necessarily the song's original release date.
    releaseDate: sn.publishedAt?.slice(0, 10),
  }
}

export function releaseFromYouTube(v: YouTubeVideo, now = Date.now(), trending = false): Release | undefined {
  const t = mapYouTubeVideo(v)
  if (!t) return undefined
  const views = Number(v.statistics?.viewCount)
  return {
    id: t.id, kind: 'single', title: t.title, artist: t.artist, releaseDate: t.releaseDate,
    source: 'youtube', sourceId: t.sourceId!, artworkUrl: t.artworkUrl, sourceUrl: t.sourceUrl,
    availability: 'full', tracks: [t], trending,
    listenCount: Number.isFinite(views) ? views : undefined,
    discoveredAt: now, catalogAddedAt: now, lastSeenAt: now,
  }
}

const key = (ctx: ProviderContext) => ctx.settings.youtubeApiKey ?? ''
const region = (ctx: ProviderContext) => (/^[A-Za-z]{2}$/.test(ctx.settings.youtubeRegion ?? '') ? ctx.settings.youtubeRegion!.toUpperCase() : 'US')

async function call<T>(ctx: ProviderContext, path: string, params: Record<string, string>, ttl: number): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: key(ctx) })
  const idForCache = `${path}?${new URLSearchParams(params).toString()}` // never store the API key in the cache
  return fetchJson<T>(`${API}/${path}?${qs.toString()}`, { provider: 'youtube', minIntervalMs: 500, cacheTtl: ttl, cacheId: idForCache, signal: ctx.signal })
}

const PARTS = 'snippet,contentDetails,statistics,status'

async function mostPopularMusic(ctx: ProviderContext): Promise<YouTubeVideo[]> {
  // videos.list: 1 quota unit per call.
  const j = await call<VideosResponse>(ctx, 'videos', { part: PARTS, chart: 'mostPopular', videoCategoryId: MUSIC_CATEGORY, regionCode: region(ctx), maxResults: '40' }, 3 * 3600_000)
  return j?.items ?? []
}

export const youtube: MusicProvider = {
  id: 'youtube',
  name: 'YouTube (official player)',
  description: 'Most-popular music videos, played in YouTube’s own embedded player. Opt-in; uses your own free Google API key.',
  homepage: 'https://www.youtube.com',
  termsUrl: 'https://developers.google.com/youtube/terms/api-services-terms-of-service',
  dataLicense: 'YouTube API data. Titles and thumbnails are kept on this device for at most 30 days, then refreshed or removed.',
  playback: 'Plays inside YouTube’s official embed, which must stay visible. Equaliser, visualiser, crossfade and background play do not apply. Some videos can’t be embedded and are skipped.',
  rateLimit: 'Google’s free quota (default 10,000 units/day). Charts cost 1 unit per refresh; searches cost more, so OpenSong only searches when you do and caches results.',
  hosts: ['www.googleapis.com', 'www.youtube.com (player)', '*.ytimg.com (player script and thumbnails)'],
  keyRequired: true,
  isConfigured: (s) => !!s.youtubeApiKey?.trim(),

  async search(q, ctx) {
    const s = await call<SearchResponse>(ctx, 'search', { part: 'snippet', type: 'video', videoCategoryId: MUSIC_CATEGORY, videoEmbeddable: 'true', maxResults: '15', q }, 3600_000)
    const ids = (s?.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => !!x && ID_RE.test(x))
    if (!ids.length) return { tracks: [], albums: [], artists: [] }
    const j = await call<VideosResponse>(ctx, 'videos', { part: PARTS, id: ids.join(',') }, 3600_000)
    return { tracks: (j?.items ?? []).map(mapYouTubeVideo).filter((t): t is Track => !!t), albums: [], artists: [] }
  },

  async newReleases(ctx, { sinceDays, page }) {
    // YouTube has no "new releases" feed with a 1-unit cost; we use the music chart and keep what was published recently.
    if (page > 1) return { items: [], hasMore: false }
    const since = Date.now() - sinceDays * 86400_000
    const now = Date.now()
    const items = (await mostPopularMusic(ctx))
      .filter((v) => { const t = Date.parse(v.snippet?.publishedAt ?? ''); return Number.isFinite(t) && t >= since })
      .map((v) => releaseFromYouTube(v, now)).filter((r): r is Release => !!r)
    return { items, hasMore: false }
  },

  async trending(ctx) {
    const now = Date.now()
    return (await mostPopularMusic(ctx)).map((v) => releaseFromYouTube(v, now, true)).filter((r): r is Release => !!r)
  },

  async expand(release) {
    return release.tracks ?? []
  },
}
