/** How a track can be played. Metadata availability NEVER implies streaming permission. */
export type Availability = 'full' | 'preview' | 'external' | 'metadata' | 'local'

export type ReleaseKind = 'single' | 'album' | 'ep' | 'other'

export interface Track {
  /** Stable id: `${source}:${sourceId}`, or `local:${fileKey}` for imported files. */
  id: string
  title: string
  artist: string
  album?: string
  /** Seconds. */
  duration?: number
  genre?: string
  artworkUrl?: string
  /** Local-only: key into `blobs` for embedded cover art. */
  artworkBlobKey?: string
  /** Provider id (e.g. "jamendo") or "local". */
  source: string
  sourceId?: string
  availability: Availability
  /** Direct audio URL (https). Absent for metadata-only tracks. */
  streamUrl?: string
  /** Human page for the original source — always shown for attribution. */
  sourceUrl?: string
  license?: string
  licenseUrl?: string
  releaseDate?: string
  /** Some providers need an extra call to find the audio file (Internet Archive). */
  needsResolve?: boolean
  /** Local-only: key into the `blobs` table. */
  blobKey?: string
  /** Local-only: sha-ish fingerprint used for duplicate detection. */
  fileKey?: string
  /** Local-only: original file name (used for M3U export). */
  fileName?: string
  addedAt?: number
}

/** A discovered release (single / album / EP / item) in the local catalogue. */
export interface Release {
  id: string
  kind: ReleaseKind
  title: string
  artist: string
  artistMbid?: string
  /** Original release date AS REPORTED by the source (ISO, possibly partial). Never invented. */
  releaseDate?: string
  /** When the source says the item was added to it (e.g. Internet Archive `addeddate`). */
  sourceAddedAt?: string
  genre?: string
  tags?: string[]
  country?: string
  source: string
  sourceId: string
  artworkUrl?: string
  sourceUrl?: string
  availability: Availability
  independent?: boolean
  license?: string
  listenCount?: number
  /** Playable tracks, when the source gave them up-front (Jamendo, Commons). */
  tracks?: Track[]
  /** First time an OpenSong sync saw this release. */
  discoveredAt: number
  /** When it was written to the local catalogue. */
  catalogAddedAt: number
  /** Last time any sync re-saw it. */
  lastSeenAt: number
  trending?: boolean
  /** Normalised artist|title key for cross-provider duplicate detection. */
  dkey?: string
}

export interface Playlist {
  id: string
  name: string
  description?: string
  artwork?: string // small data: URL
  tracks: Track[]
  createdAt: number
  updatedAt: number
}

export interface HistoryEntry {
  id?: number
  trackId: string
  title: string
  artist: string
  album?: string
  genre?: string
  source: string
  startedAt: number
  /** Seconds actually listened. */
  listened: number
  duration?: number
  /** Counted as a "play" (>=30 s or >=50 %). */
  counted: boolean
  skipped: boolean
}

export interface FavouriteTrack { id: string; track: Track; addedAt: number }
export interface FavouriteAlbum { id: string; album: string; artist: string; artworkUrl?: string; addedAt: number }
export interface FollowedArtist { name: string; addedAt: number }
export interface SearchEntry { query: string; at: number }
export interface MetaRow { key: string; value: unknown }
export interface CacheRow { key: string; value: unknown; expires: number }
export interface BlobRow { key: string; blob: Blob }
export interface PresetRow { id: string; kind: 'eq' | 'viz'; name: string; data: unknown; updatedAt: number }

export interface ProviderHealth {
  ok: boolean
  lastOk?: number
  lastError?: string
  lastErrorAt?: number
  consecutiveFailures: number
  requests: number
}
