import { db, getMeta, setMeta } from './db'
import type { Track } from '../types'

const KEY = 'recent'
const MAX = 120

/** Keep a small most-recently-played list of full Track objects so history rows can be replayed. */
export async function recordRecent(track: Track) {
  try {
    const list = (await getMeta<Track[]>(KEY)) ?? []
    await setMeta(KEY, [track, ...list.filter((t) => t.id !== track.id)].slice(0, MAX))
  } catch { /* non-fatal */ }
}
export const getRecent = async () => (await getMeta<Track[]>(KEY)) ?? []
export const clearRecent = () => setMeta(KEY, [])

/** id → Track for everything we know about (recent, library, favourites, playlists, catalogue). */
export async function trackIndex(): Promise<Map<string, Track>> {
  const [recent, lib, favs, lists, cat] = await Promise.all([getRecent(), db.tracks.toArray(), db.favourites.toArray(), db.playlists.toArray(), db.catalog.toArray()])
  const m = new Map<string, Track>()
  for (const r of cat) for (const t of r.tracks ?? []) m.set(t.id, t)
  for (const p of lists) for (const t of p.tracks) m.set(t.id, t)
  for (const f of favs) m.set(f.id, f.track)
  for (const t of lib) m.set(t.id, t)
  for (const t of recent) m.set(t.id, t)
  return m
}
