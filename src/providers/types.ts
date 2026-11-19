import type { Release, Track } from '../types'

export interface ArtistResult {
  id: string
  name: string
  source: string
  mbid?: string
  country?: string
  disambiguation?: string
  tags?: string[]
  sourceUrl?: string
}

export interface SearchResults {
  tracks: Track[]
  albums: Release[]
  artists: ArtistResult[]
}

export interface ProviderSettings {
  jamendoClientId?: string
  youtubeApiKey?: string
  /** ISO 3166-1 alpha-2 region for the YouTube music chart. */
  youtubeRegion?: string
  /** Jamendo stream format. */
  jamendoFormat: 'mp31' | 'mp32' | 'ogg' | 'flac'
  /** Internet Archive: prefer MP3 (widest support) or Ogg Vorbis. */
  archiveFormat: 'mp3' | 'ogg'
}

export interface ProviderContext {
  signal?: AbortSignal
  settings: ProviderSettings
}

export interface NewReleaseOptions {
  /** Look back this many days. */
  sinceDays: number
  page: number
}

export interface MusicProvider {
  id: string
  name: string
  description: string
  homepage: string
  termsUrl: string
  /** Plain-English licence of the DATA this provider returns. */
  dataLicense: string
  /** What the user will actually be able to do with results. */
  playback: string
  /** Rate limit we enforce client-side. */
  rateLimit: string
  /** Hosts this provider contacts — shown in Settings → Privacy for transparency. */
  hosts: string[]
  keyRequired?: boolean
  /** Whether the provider is usable with the current settings. */
  isConfigured(s: ProviderSettings): boolean
  search?(query: string, ctx: ProviderContext): Promise<SearchResults>
  newReleases?(ctx: ProviderContext, opts: NewReleaseOptions): Promise<{ items: Release[]; hasMore: boolean }>
  trending?(ctx: ProviderContext): Promise<Release[]>
  /** Releases by an artist (discography). */
  artistReleases?(name: string, mbid: string | undefined, ctx: ProviderContext): Promise<Release[]>
  /** Search by genre tag. */
  byGenre?(genre: string, ctx: ProviderContext): Promise<Release[]>
  /** Turn a release into its playable tracks (may need a network call). */
  expand?(release: Release, ctx: ProviderContext): Promise<Track[]>
  /** Resolve a lazily-defined track (e.g. Internet Archive) to a direct stream URL. */
  resolveTrack?(track: Track, ctx: ProviderContext): Promise<Track>
}
