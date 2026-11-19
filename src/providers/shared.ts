import type { Release, Track } from '../types'

/** "https://creativecommons.org/licenses/by-nc-sa/4.0/" → "CC BY-NC-SA 4.0". Returns undefined for non-CC URLs. */
export function licenseLabel(url: string | undefined): string | undefined {
  if (!url) return undefined
  let u: URL
  try { u = new URL(url) } catch { return undefined }
  if (!/(^|\.)creativecommons\.org$/.test(u.hostname)) return undefined
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts[0] === 'publicdomain') {
    if (parts[1] === 'zero') return 'CC0 1.0'
    if (parts[1] === 'mark') return 'Public Domain'
    return 'Public Domain'
  }
  if (parts[0] === 'licenses' && parts[1]) {
    return `CC ${parts[1].toUpperCase()}${parts[2] ? ' ' + parts[2] : ''}`
  }
  return undefined
}

/** Strip HTML tags + decode the few entities Wikimedia emits. No DOM parsing → no XSS surface. */
export function stripHtml(html: string | undefined): string | undefined {
  if (!html) return undefined
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || undefined
}

export function kindFromTrackCount(n: number): Release['kind'] {
  if (n <= 1) return 'single'
  if (n <= 6) return 'ep'
  return 'album'
}

export function releaseFromTrack(t: Track, extra: Partial<Release> = {}): Release {
  const now = Date.now()
  return {
    id: t.id,
    kind: 'single',
    title: t.title,
    artist: t.artist,
    releaseDate: t.releaseDate,
    genre: t.genre,
    source: t.source,
    sourceId: t.sourceId ?? t.id,
    artworkUrl: t.artworkUrl,
    sourceUrl: t.sourceUrl,
    availability: t.availability,
    license: t.license,
    tracks: [t],
    discoveredAt: now,
    catalogAddedAt: now,
    lastSeenAt: now,
    ...extra,
  }
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10)
