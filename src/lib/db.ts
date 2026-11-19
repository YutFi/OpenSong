import Dexie, { type Table } from 'dexie'
import type {
  BlobRow, CacheRow, FavouriteAlbum, FavouriteTrack, FollowedArtist, HistoryEntry,
  MetaRow, Playlist, PresetRow, Release, SearchEntry, Track,
} from '../types'

/** All persistent data lives in this IndexedDB database — nothing is sent anywhere. */
export class OpenSongDB extends Dexie {
  tracks!: Table<Track, string>
  blobs!: Table<BlobRow, string>
  catalog!: Table<Release, string>
  playlists!: Table<Playlist, string>
  favourites!: Table<FavouriteTrack, string>
  favAlbums!: Table<FavouriteAlbum, string>
  history!: Table<HistoryEntry, number>
  searches!: Table<SearchEntry, string>
  follows!: Table<FollowedArtist, string>
  presets!: Table<PresetRow, string>
  meta!: Table<MetaRow, string>
  apiCache!: Table<CacheRow, string>

  constructor(name = 'opensong') {
    super(name)
    this.version(1).stores({
      tracks: 'id, artist, album, genre, addedAt, fileKey',
      blobs: 'key',
      catalog: 'id, releaseDate, discoveredAt, source, kind, artist, lastSeenAt, dkey',
      playlists: 'id, updatedAt',
      favourites: 'id, addedAt',
      favAlbums: 'id, addedAt',
      history: '++id, trackId, startedAt, artist',
      searches: 'query, at',
      follows: 'name',
      presets: 'id, kind',
      meta: 'key',
      apiCache: 'key, expires',
    })
  }
}

export const db = new OpenSongDB()

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}

/** Remove every user table. Used by "Clear local storage". */
export async function wipeAll() {
  await db.delete()
  await db.open()
}
