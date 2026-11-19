import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { isPlayable } from '../lib/queueLogic'
import { sanitizeTrack } from '../lib/validate'
import { mapYouTubeVideo, parseIsoDuration, releaseFromYouTube, youtube, type YouTubeVideo } from './youtube'

// Shape follows the YouTube Data API v3 `videos.list` resource (part=snippet,contentDetails,statistics,status).
// This is a hand-written fixture: live YouTube responses were NOT checked from the build environment.
const video: YouTubeVideo = {
  id: 'dQw4w9WgXcQ',
  snippet: { title: 'Some Song (Official Audio)', channelTitle: 'Some Artist - Topic', publishedAt: '2026-11-17T09:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' } } },
  contentDetails: { duration: 'PT3M25S' },
  statistics: { viewCount: '123456' },
  status: { embeddable: true },
}

describe('YouTube provider mapping', () => {
  it('parses ISO-8601 durations', () => {
    expect(parseIsoDuration('PT3M25S')).toBe(205)
    expect(parseIsoDuration('PT1H2M')).toBe(3720)
    expect(parseIsoDuration('PT45S')).toBe(45)
    expect(parseIsoDuration('P0D')).toBeUndefined()
    expect(parseIsoDuration('nonsense')).toBeUndefined()
  })
  it('maps an embeddable video to a track played through the official embed (no audio URL)', () => {
    const t = mapYouTubeVideo(video)!
    expect(t).toMatchObject({ id: 'youtube:dQw4w9WgXcQ', source: 'youtube', youtubeId: 'dQw4w9WgXcQ', availability: 'full', artist: 'Some Artist', duration: 205, releaseDate: '2026-11-17' })
    expect(t.streamUrl).toBeUndefined()
    expect(t.sourceUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(isPlayable(t)).toBe(true)
  })
  it('never offers videos the owner has blocked from embedding, or malformed ids', () => {
    expect(mapYouTubeVideo({ ...video, status: { embeddable: false } })).toBeUndefined()
    expect(mapYouTubeVideo({ ...video, id: 'bad id!' })).toBeUndefined()
    expect(mapYouTubeVideo({ id: 'dQw4w9WgXcQ' })).toBeUndefined()
  })
  it('builds a release with the view count and no invented release date', () => {
    const r = releaseFromYouTube({ ...video, snippet: { ...video.snippet!, publishedAt: undefined } }, 1, true)!
    expect(r).toMatchObject({ source: 'youtube', trending: true, listenCount: 123456, availability: 'full' })
    expect(r.releaseDate).toBeUndefined()
  })
  it('survives validation of imported/backup data and rejects forged ids', () => {
    const t = mapYouTubeVideo(video)!
    expect(sanitizeTrack(JSON.parse(JSON.stringify(t)))?.youtubeId).toBe('dQw4w9WgXcQ')
    expect(sanitizeTrack({ ...t, youtubeId: '<script>' })?.availability).toBe('external') // no audio URL and bad id → downgraded, never "full"
  })
})

describe('YouTube provider requests', () => {
  afterEach(() => vi.unstubAllGlobals())
  const ctx = { settings: { youtubeApiKey: 'SECRET-KEY', youtubeRegion: 'my', jamendoFormat: 'mp32' as const, archiveFormat: 'mp3' as const } }

  it('is off until a key is present', () => {
    expect(youtube.isConfigured({ jamendoFormat: 'mp32', archiveFormat: 'mp3' })).toBe(false)
    expect(youtube.isConfigured(ctx.settings)).toBe(true)
  })

  it('asks for the music chart in the chosen region, keeps only recent videos, and never caches the API key', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { urls.push(u); return new Response(JSON.stringify({ items: [{ ...video, snippet: { ...video.snippet!, publishedAt: new Date().toISOString() } }, { ...video, id: 'AAAAAAAAAAA', snippet: { ...video.snippet!, publishedAt: '2020-01-01T00:00:00Z' } }] }), { status: 200 }) }))
    const r = await youtube.newReleases!(ctx, { sinceDays: 14, page: 1 })
    expect(r.items.map((x) => x.sourceId)).toEqual(['dQw4w9WgXcQ'])
    const u = new URL(urls[0])
    expect(u.origin + u.pathname).toBe('https://www.googleapis.com/youtube/v3/videos')
    expect(u.searchParams.get('chart')).toBe('mostPopular')
    expect(u.searchParams.get('videoCategoryId')).toBe('10')
    expect(u.searchParams.get('regionCode')).toBe('MY')
    const cached = await db.apiCache.toArray()
    expect(cached.length).toBeGreaterThan(0)
    expect(JSON.stringify(cached)).not.toContain('SECRET-KEY')
  })
})
