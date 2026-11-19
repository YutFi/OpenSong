import { fetchJson } from '../lib/http'
import { safeUrl } from '../lib/util'
import type { Release, ReleaseKind } from '../types'
import type { MusicProvider } from './types'

const API = 'https://api.listenbrainz.org/1'

interface LBFresh {
  artist_credit_name: string
  artist_mbids?: string[]
  caa_id: number | null
  caa_release_mbid: string | null
  listen_count?: number
  release_date: string
  release_group_mbid: string
  release_group_primary_type?: string | null
  release_group_secondary_type?: string | null
  release_mbid: string
  release_name: string
  release_tags?: string[]
}
interface LBReleaseGroupStat {
  artist_mbids?: string[]
  artist_name: string
  caa_id: number | null
  caa_release_mbid: string | null
  listen_count: number
  release_group_mbid: string
  release_group_name: string
}

function kind(t: string | null | undefined): ReleaseKind {
  switch ((t ?? '').toLowerCase()) {
    case 'single': return 'single'
    case 'album': return 'album'
    case 'ep': return 'ep'
    default: return 'other'
  }
}

function art(caaId: number | null, mbid: string | null): string | undefined {
  // `caa_id: null` means the Cover Art Archive has no image — don't request a URL that will 404.
  return caaId != null && mbid ? `https://coverartarchive.org/release/${mbid}/front-250` : undefined
}

export function mapFresh(r: LBFresh, now = Date.now()): Release {
  return {
    id: `listenbrainz:${r.release_group_mbid}`,
    kind: kind(r.release_group_primary_type),
    title: r.release_name,
    artist: r.artist_credit_name,
    artistMbid: r.artist_mbids?.[0],
    releaseDate: r.release_date,
    genre: r.release_tags?.[0],
    tags: r.release_tags ?? [],
    source: 'listenbrainz',
    sourceId: r.release_group_mbid,
    artworkUrl: safeUrl(art(r.caa_id, r.caa_release_mbid)),
    sourceUrl: `https://musicbrainz.org/release/${r.release_mbid}`,
    // Metadata only: MusicBrainz/ListenBrainz tell us a release exists, not that we may stream it.
    availability: 'metadata',
    listenCount: r.listen_count,
    discoveredAt: now, catalogAddedAt: now, lastSeenAt: now,
  }
}

export function mapReleaseGroupStat(r: LBReleaseGroupStat, now = Date.now()): Release {
  return {
    id: `listenbrainz:${r.release_group_mbid}`,
    kind: 'other',
    title: r.release_group_name,
    artist: r.artist_name,
    artistMbid: r.artist_mbids?.[0],
    source: 'listenbrainz',
    sourceId: r.release_group_mbid,
    artworkUrl: safeUrl(art(r.caa_id, r.caa_release_mbid)),
    sourceUrl: `https://musicbrainz.org/release-group/${r.release_group_mbid}`,
    availability: 'metadata',
    listenCount: r.listen_count,
    trending: true,
    discoveredAt: now, catalogAddedAt: now, lastSeenAt: now,
  }
}

export const listenbrainz: MusicProvider = {
  id: 'listenbrainz',
  name: 'ListenBrainz',
  description: 'Open listening-data project by the MetaBrainz Foundation. Powers fresh-release discovery and community trends.',
  homepage: 'https://listenbrainz.org',
  termsUrl: 'https://metabrainz.org/social-contract',
  dataLicense: 'Public data CC0 / open (see MetaBrainz). Free for non-commercial use.',
  playback: 'Metadata only — links to MusicBrainz. No audio.',
  rateLimit: '1 request/second',
  hosts: ['api.listenbrainz.org', 'coverartarchive.org'],
  isConfigured: () => true,

  async newReleases(ctx, { sinceDays, page }) {
    if (page > 1) return { items: [], hasMore: false } // endpoint returns everything for the window
    const days = Math.min(Math.max(Math.ceil(sinceDays), 1), 90)
    const j = await fetchJson<{ payload?: { releases?: LBFresh[] } }>(
      `${API}/explore/fresh-releases/?days=${days}&sort=release_date`,
      { provider: 'listenbrainz', minIntervalMs: 1100, cacheTtl: 30 * 60 * 1000, signal: ctx.signal },
    )
    const now = Date.now()
    const items = (j?.payload?.releases ?? [])
      .filter((r) => r.release_group_mbid && r.release_name && r.artist_credit_name)
      .map((r) => mapFresh(r, now))
    return { items, hasMore: false }
  },

  async trending(ctx) {
    const j = await fetchJson<{ payload?: { release_groups?: LBReleaseGroupStat[] } }>(
      `${API}/stats/sitewide/release-groups?range=this_week&count=30`,
      { provider: 'listenbrainz', minIntervalMs: 1100, cacheTtl: 6 * 60 * 60 * 1000, signal: ctx.signal },
    )
    const now = Date.now()
    return (j?.payload?.release_groups ?? []).filter((r) => r.release_group_mbid && r.release_group_name).map((r) => mapReleaseGroupStat(r, now))
  },
}
