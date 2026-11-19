import { db } from './db'
import { useLive } from './useLive'
import { getRecent, trackIndex } from './recent'

export const useCatalog = () => useLive(() => db.catalog.toArray(), [])
export const useHistory = () => useLive(() => db.history.toArray(), [])
export const useLibrary = () => useLive(() => db.tracks.toArray(), [])
export const useFavourites = () => useLive(() => db.favourites.orderBy('addedAt').reverse().toArray(), [])
export const useFollows = () => useLive(() => db.follows.toArray(), [])
export const usePlaylists = () => useLive(() => db.playlists.orderBy('updatedAt').reverse().toArray(), [])
export const useRecentTracks = () => useLive(() => getRecent(), [])
export const useTrackIndex = () => useLive(() => trackIndex(), [])
